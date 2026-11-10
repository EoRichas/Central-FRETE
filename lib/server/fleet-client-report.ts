import type { CurrentUser } from '@/lib/contracts';
import { cargoPlateKey, cargoVehiclesOrLegacy, type CargoVehicle } from '@/lib/domain/cargo-vehicles';
import type { DatePeriod } from '@/lib/domain/date-period';
import { FLEET_OPERATIONAL_STATUS_LABELS, type FleetOperationalStatus } from '@/lib/domain/fleet';
import { FLEET_REPORT_PAYMENT_FILTERS, buildFleetClientReport, creationDate, type FleetClientReportData, type FleetClientReportRow, type FleetReportPaymentFilter, type FleetVehicleReport } from '@/lib/domain/fleet-client-report';
import { ApiError, queryAll } from './d1';
import { readDatePeriod } from './date-period';
import { reportCreationDateSql } from './report-creation-date';

type SourceRow = {
  providerServices?: import("@/lib/domain/provider-services").ProviderService[];
  returnFreight?: boolean;
  id: string; saleNumber: string; createdDate: string; clientId: string; clientName: string;
  vehicles: CargoVehicle[] | null; vehicle: string | null; plate: string | null;
  driverName: string | null; serviceSituation: FleetClientReportRow["serviceSituation"]; situation: string; departureDate: string | null;
  amountCents: number; receivedCents: number; receivedDates: string[]; paid: FleetClientReportRow['paid'];
  notes: string | null; orderObservation: string | null; orderIncludeObservation: boolean | null;
};
const receiptDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : creationDate(value);
const legacySale = "s.sale_channel='FROTA' and s.fleet_freight_id is null";
const normalizedPlateSql = "regexp_replace(upper(cargo.vehicle->>'plate'), '[^A-Z0-9]', '', 'g')";
const validPlateSql = " ~ '^[A-Z0-9]{7}$'";
function cargoSource(alias: 'f'|'s') {
  const legacy = alias==='f' ? 'f.cargo_plate' : 's.plate';
  return `jsonb_array_elements(case when jsonb_array_length(${alias}.cargo_vehicles)>0 then ${alias}.cargo_vehicles
    else jsonb_build_array(jsonb_build_object('plate',${legacy})) end) as cargo(vehicle)`;
}
function readReportPeriod(params: URLSearchParams) {
  const period = readDatePeriod(params);
  if (!period) throw new ApiError(400, 'Informe uma data inicial e final válidas.');
  return period;
}
function readReportPayment(params: URLSearchParams): FleetReportPaymentFilter {
  const value = params.get('payment') ?? 'TODOS';
  if (!FLEET_REPORT_PAYMENT_FILTERS.some(option=>option===value)) throw new ApiError(400, 'Situação de pagamento inválida.');
  return value as FleetReportPaymentFilter;
}
function paymentCondition(payment: FleetReportPaymentFilter, paid: string) {
  return payment==='TODOS' ? '' : `and (${paid}) is ${payment==='CONFIRMADO'?'true':'not true'}`;
}

async function loadFleetReportRows(user: CurrentUser, period: DatePeriod, payment: FleetReportPaymentFilter, selection: {clientId?:string; plate?:string}) {
  const {clientId,plate} = selection;
  const own = user.role==='VENDEDOR';
  const filter = (alias: 'f'|'s') => `${reportCreationDateSql(alias)} between ?::date and ?::date
    ${own?`and ${alias}.seller_id=?`:''}
    ${clientId && clientId!=='*'?`and ${alias}.client_id=?`:''}
    ${plate?`and exists (select 1 from ${cargoSource(alias)} where ${normalizedPlateSql}${plate==='*'?validPlateSql:' = ?'})`:''}`;
  const args = [period.from,period.to,...(own?[user.id]:[]),...(clientId&&clientId!=='*'?[clientId]:[]),...(plate&&plate!=='*'?[plate]:[])];
  const clientJoin = clientId ? 'join' : 'left join';
  const [freights, sales] = await Promise.all([
    queryAll<SourceRow>(`select f.provider_services as providerServices,f.return_freight as returnFreight,f.id,f.sale_number as saleNumber,
      ${reportCreationDateSql('f')}::text as createdDate,coalesce(f.client_id,'') as clientId,coalesce(c.legal_name,f.client_name,'Não informado') as clientName,
      f.cargo_vehicles as vehicles,f.cargo_vehicle_model as vehicle,f.cargo_plate as plate,f.driver_name as driverName,
      f.service_situation as serviceSituation,f.operational_status as situation,f.pickup_date as departureDate,f.freight_amount_cents as amountCents,
      case when f.payment_status='PAGO' then f.freight_amount_cents else 0 end as receivedCents,
      case when f.payment_status='PAGO' and f.paid_at is not null then array[f.paid_at::text] else '{}'::text[] end as receivedDates,
      case when f.payment_status='PAGO' then 'Sim' else 'Não' end as paid,
      f.notes,f.order_observation as orderObservation,f.order_include_observation as orderIncludeObservation
      from fleet_freights f ${clientJoin} clients c on c.id=f.client_id
      where ${filter('f')} ${paymentCondition(payment,"f.payment_status='PAGO'")}
      order by ${reportCreationDateSql('f')} desc,f.id limit 2001`, args),
    // Linked commercial sales are represented by their operating freight only.
    queryAll<SourceRow>(`select s.id,s.sale_number as saleNumber,${reportCreationDateSql('s')}::text as createdDate,
      coalesce(s.client_id,'') as clientId,coalesce(c.legal_name,'Não informado') as clientName,s.cargo_vehicles as vehicles,
      s.vehicle,s.plate,null::text as driverName,s.service_situation as serviceSituation,s.operational_status as situation,
      null::text as departureDate,s.freight_amount_cents as amountCents,p.received as receivedCents,p.dates as receivedDates,
      case when p.received>=s.freight_amount_cents then 'Sim' when p.received>0 then 'Parcial' else 'Não' end as paid,
      s.notes,s.order_observation as orderObservation,s.order_include_observation as orderIncludeObservation
      from freight_sales s ${clientJoin} clients c on c.id=s.client_id
      cross join lateral (
        select greatest(0,coalesce(sum(case when t.type='ESTORNO' then -t.amount_cents else t.amount_cents end),0))::bigint as received,
          coalesce(array_agg(t.occurred_at order by t.occurred_at,t.id) filter (where t.type<>'ESTORNO'),'{}'::text[]) as dates
        from payment_transactions t where t.sale_id=s.id and t.status='CONFIRMADO'
      ) p
      where ${legacySale} and ${filter('s')} ${paymentCondition(payment,'p.received>=s.freight_amount_cents')}
      order by ${reportCreationDateSql('s')} desc,s.id limit 2001`, args),
  ]);
  if (freights.length + sales.length > 2000) throw new ApiError(400, 'A consulta contém mais de 2.000 vendas. Reduza o período ou use outro filtro.');
  const asRow = (source: SourceRow, operational: boolean): FleetClientReportRow => ({
    id: `${operational?'freight':'sale'}:${source.id}`, providerServices:source.providerServices, returnFreight:source.returnFreight,
    saleNumber:source.saleNumber, createdDate:source.createdDate, clientId:source.clientId, clientName:source.clientName,
    vehicles:cargoVehiclesOrLegacy(source.vehicles,source.vehicle,source.plate), driverName:source.driverName, serviceSituation:source.serviceSituation,
    situation:operational ? FLEET_OPERATIONAL_STATUS_LABELS[source.situation as FleetOperationalStatus] ?? source.situation : source.situation,
    departureDate:source.departureDate, amountCents:source.amountCents, receivedCents:source.receivedCents,
    receivedDates:[...new Set(source.receivedDates.map(receiptDate))], paid:source.paid, notes:source.notes??'',
    orderObservation:source.orderObservation, orderIncludeObservation:source.orderIncludeObservation,
  });
  return [...freights.map(f=>asRow(f,true)),...sales.map(s=>asRow(s,false))];
}

export async function loadFleetClientReport(user: CurrentUser, params: URLSearchParams): Promise<FleetClientReportData> {
  const clientId = params.get('clientId')?.trim();
  const payment = readReportPayment(params);
  const own = user.role === 'VENDEDOR';
  const clients = await queryAll<{id: string; name: string}>(`
    select c.id,c.legal_name as name from clients c where
    exists(select 1 from fleet_freights f where f.client_id=c.id ${own ? 'and f.seller_id=?' : ''})
    or exists(select 1 from freight_sales s where s.client_id=c.id and s.sale_channel='FROTA' ${own ? 'and s.seller_id=?' : ''})
    order by c.legal_name,c.id`, own ? [user.id, user.id] : []);
  if (!clientId) return {clients, report: null};
  const period = readReportPeriod(params);
  const client = clientId==='*'?{id:'*',name:'Todos os clientes'}:clients.find(c => c.id === clientId);
  if (!client) throw new ApiError(404, 'Cliente sem vendas Frota disponíveis para seu perfil.');
  const rows = await loadFleetReportRows(user,period,payment,{clientId});
  const rowId = params.get('rowId')?.trim();
  if (rowId && !rows.some(row => row.id === rowId)) throw new ApiError(404, 'Venda não disponível neste cliente e período para seu perfil.');
  return {clients, report: buildFleetClientReport(client,period.from,period.to,rowId?rows.filter(row=>row.id===rowId):rows,payment)};
}

export async function loadFleetReportPlates(user: CurrentUser) {
  const own = user.role==='VENDEDOR';
  const rows = await queryAll<{plate:string}>(`select distinct plate from (
    select ${normalizedPlateSql} as plate from fleet_freights f cross join lateral ${cargoSource('f')} ${own?'where f.seller_id=?':''}
    union all
    select ${normalizedPlateSql} as plate from freight_sales s cross join lateral ${cargoSource('s')} where ${legacySale} ${own?'and s.seller_id=?':''}
  ) plates where plate${validPlateSql} order by plate`,own?[user.id,user.id]:[]);
  return rows.map(row=>row.plate);
}

export async function loadFleetVehicleReport(user: CurrentUser, params: URLSearchParams): Promise<FleetVehicleReport> {
  const raw = params.get('plate');
  const plate = raw==='*' ? raw : cargoPlateKey(raw);
  if (plate!=='*' && plate.length!==7) throw new ApiError(400, 'Selecione uma placa válida.');
  const period = readReportPeriod(params), payment = readReportPayment(params);
  const source = await loadFleetReportRows(user,period,payment,{plate});
  const rowsByPlate = source.map(row=>({...row,vehicles:row.vehicles.filter(v=>{
    const key = cargoPlateKey(v.plate);
    return plate==='*' ? key.length===7 : key===plate;
  })}));
  const report = buildFleetClientReport({id:'*',name:'Todos os clientes'},period.from,period.to,rowsByPlate,payment);
  return {plate, from:report.from, to:report.to, paymentFilter:report.paymentFilter, totals:report.totals,
    rows:report.rows.map(({id,saleNumber,createdDate,clientName,vehicles,amountCents,paid})=>({id,saleNumber,createdDate,clientName,vehicles,amountCents,paid}))};
}
