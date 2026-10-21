import type { CurrentUser } from '@/lib/contracts';
import type { CargoVehicle } from '@/lib/domain/cargo-vehicles';
import { cargoVehiclesOrLegacy } from '@/lib/domain/cargo-vehicles';
import { FLEET_OPERATIONAL_STATUS_LABELS, type FleetOperationalStatus } from '@/lib/domain/fleet';
import { buildFleetClientReport, creationDate, type FleetClientReportData, type FleetClientReportRow } from '@/lib/domain/fleet-client-report';
import { ApiError, queryAll } from './d1';

type SourceRow = {
  id: string; saleNumber: string; createdAt: string; clientId: string; clientName: string;
  vehicles: CargoVehicle[] | null; vehicle: string | null; plate: string | null;
  driverName: string | null; serviceSituation: FleetClientReportRow["serviceSituation"]; situation: string; departureDate: string | null;
  amountCents: number; paidStatus: string | null; paidAt: string | null; notes: string | null; orderObservation: string | null; orderIncludeObservation: boolean | null;
};
type Receipt = {saleId: string; type: string; amountCents: number; occurredAt: string};
const receiptDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : creationDate(value);

function validDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new ApiError(400, 'Informe uma data inicial e final válidas.');
  return value;
}

export async function loadFleetClientReport(user: CurrentUser, params: URLSearchParams): Promise<FleetClientReportData> {
  const clientId = params.get('clientId')?.trim();
  const own = user.role === 'VENDEDOR';
  const clients = await queryAll<{id: string; name: string}>(`
    select c.id,c.legal_name as name from clients c where
    exists(select 1 from fleet_freights f where f.client_id=c.id ${own ? 'and f.seller_id=?' : ''})
    or exists(select 1 from freight_sales s where s.client_id=c.id and s.sale_channel='FROTA' ${own ? 'and s.seller_id=?' : ''})
    order by c.legal_name,c.id`, own ? [user.id, user.id] : []);
  if (!clientId) return {clients, report: null};
  const from = validDate(params.get('from')), to = validDate(params.get('to'));
  if (from > to) throw new ApiError(400, 'A data inicial deve ser anterior ou igual à data final.');
  const client = clients.find(c => c.id === clientId);
  if (!client) throw new ApiError(404, 'Cliente sem vendas Frota disponíveis para seu perfil.');
  // TEXT timestamps in this project contain ISO timestamps. Convert in SQL so the
  // filter uses creation in São Paulo, including the complete end day.
  const period = (alias: string) => `(${alias}.created_at::timestamptz at time zone 'America/Sao_Paulo')::date between ?::date and ?::date`;
  const [freights, sales] = await Promise.all([
    queryAll<SourceRow>(`select f.id,f.sale_number as saleNumber,f.created_at as createdAt,
      f.client_id as clientId,c.legal_name as clientName,f.cargo_vehicles as vehicles,
      f.cargo_vehicle_model as vehicle,f.cargo_plate as plate,f.driver_name as driverName,
      f.service_situation as serviceSituation,f.operational_status as situation,f.pickup_date as departureDate,
      f.freight_amount_cents as amountCents,f.payment_status as paidStatus,f.paid_at as paidAt,f.notes,f.order_observation as orderObservation,f.order_include_observation as orderIncludeObservation
      from fleet_freights f join clients c on c.id=f.client_id
      where f.client_id=? and ${period('f')} ${own ? 'and f.seller_id=?' : ''}
      order by f.created_at,f.id limit 2001`, own ? [clientId, from, to, user.id] : [clientId, from, to]),
    // A linked commercial sale is represented by its operation, exactly once.
    queryAll<SourceRow>(`select s.id,s.sale_number as saleNumber,s.created_at as createdAt,
      s.client_id as clientId,c.legal_name as clientName,s.cargo_vehicles as vehicles,
      s.vehicle,s.plate,null::text as driverName,s.service_situation as serviceSituation,s.operational_status as situation,
      null::text as departureDate,s.freight_amount_cents as amountCents,
      null::text as paidStatus,null::text as paidAt,s.notes,s.order_observation as orderObservation,s.order_include_observation as orderIncludeObservation
      from freight_sales s join clients c on c.id=s.client_id
      where s.sale_channel='FROTA' and s.fleet_freight_id is null and s.client_id=? and ${period('s')}
      ${own ? 'and s.seller_id=?' : ''} order by s.created_at,s.id limit 2001`, own ? [clientId, from, to, user.id] : [clientId, from, to]),
  ]);
  if (freights.length + sales.length > 2000) throw new ApiError(400, 'O período contém mais de 2.000 vendas. Reduza o intervalo para gerar o relatório completo.');
  const receipts = sales.length ? await queryAll<Receipt>(`select sale_id as saleId,type,amount_cents as amountCents,occurred_at as occurredAt
    from payment_transactions where status='CONFIRMADO' and sale_id in (${sales.map(() => '?').join(',')})
    order by occurred_at,id`, sales.map(s => s.id)) : [];
  const rows: FleetClientReportRow[] = [
    ...freights.map((f): FleetClientReportRow => ({
      id: `freight:${f.id}`, saleNumber: f.saleNumber, createdDate: creationDate(f.createdAt), clientId: f.clientId, clientName: f.clientName,
      vehicles: cargoVehiclesOrLegacy(f.vehicles, f.vehicle, f.plate), driverName: f.driverName, serviceSituation: f.serviceSituation,
      situation: FLEET_OPERATIONAL_STATUS_LABELS[f.situation as FleetOperationalStatus] ?? f.situation,
      departureDate: f.departureDate, amountCents: f.amountCents,
      receivedCents: f.paidStatus === 'PAGO' ? f.amountCents : 0,
      receivedDates: f.paidStatus === 'PAGO' && f.paidAt ? [receiptDate(f.paidAt)] : [],
      paid: f.paidStatus === 'PAGO' ? 'Sim' : 'Não', notes: f.notes ?? '', orderObservation: f.orderObservation, orderIncludeObservation: f.orderIncludeObservation,
    })),
    ...sales.map((s): FleetClientReportRow => {
      const payments = receipts.filter(p => p.saleId === s.id);
      const receivedCents = Math.max(0, payments.reduce((sum, p) => sum + (p.type === 'ESTORNO' ? -p.amountCents : p.amountCents), 0));
      return {id: `sale:${s.id}`, saleNumber: s.saleNumber, createdDate: creationDate(s.createdAt), clientId: s.clientId, clientName: s.clientName,
        vehicles: cargoVehiclesOrLegacy(s.vehicles, s.vehicle, s.plate), driverName: s.driverName, serviceSituation: s.serviceSituation, situation: s.situation,
        departureDate: s.departureDate, amountCents: s.amountCents, receivedCents,
        receivedDates: [...new Set(payments.filter(p => p.type !== 'ESTORNO').map(p => receiptDate(p.occurredAt)))],
        paid: receivedCents >= s.amountCents ? 'Sim' : receivedCents > 0 ? 'Parcial' : 'Não', notes: s.notes ?? '', orderObservation: s.orderObservation, orderIncludeObservation: s.orderIncludeObservation};
    }),
  ];
  const rowId = params.get('rowId')?.trim();
  if (rowId && !rows.some(row => row.id === rowId)) throw new ApiError(404, 'Venda não disponível neste cliente e período para seu perfil.');
  return {clients, report: buildFleetClientReport(client, from, to, rowId ? rows.filter(row => row.id === rowId) : rows)};
}
