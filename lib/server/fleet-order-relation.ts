import type { ServiceOrderVersion } from '@/lib/domain/service-order';
import { buildFleetClientReport } from '@/lib/domain/fleet-client-report';
import { renderFleetClientPdf } from './reports/fleet-client-pdf';

/** A client-only immutable row in the issued OS. Linked freights are authoritative. */
export function fleetOrderRelationSql(kind: 'fleet' | 'sale') {
  const fleet = kind === 'fleet', hasFleet = fleet ? 'true' : 'f.id is not null';
  const field = (name: string, sale: string) => fleet ? `f.${name}` : `case when ${hasFleet} then f.${name} else ${sale} end`;
  const received = fleet ? `case when f.payment_status='PAGO' then f.freight_amount_cents else 0 end`
    : `case when f.id is not null then case when f.payment_status='PAGO' then f.freight_amount_cents else 0 end
       else greatest(0,coalesce((select sum(case when p.type='ESTORNO' then -p.amount_cents else p.amount_cents end) from payment_transactions p where p.sale_id=s.id and p.status='CONFIRMADO'),0)) end`;
  const amount = field('freight_amount_cents', 's.freight_amount_cents');
  const dates = `case when f.payment_status='PAGO' and f.paid_at is not null then jsonb_build_array(case when length(f.paid_at)=10 then f.paid_at else (f.paid_at::timestamptz at time zone 'America/Sao_Paulo')::date::text end) else '[]'::jsonb end`;
  const saleDates = `coalesce((select jsonb_agg(d.day order by d.day) from (select distinct case when length(p.occurred_at)=10 then p.occurred_at else (p.occurred_at::timestamptz at time zone 'America/Sao_Paulo')::date::text end as day from payment_transactions p where p.sale_id=s.id and p.status='CONFIRMADO' and p.type<>'ESTORNO') d),'[]'::jsonb)`;
  const cargo = field('cargo_vehicles', 's.cargo_vehicles'), model = field('cargo_vehicle_model', 's.vehicle'), plate = field('cargo_plate', 's.plate');
  const name = fleet ? 'f.client_name' : "coalesce(c.legal_name,f.client_name,'Não informado')";
  return `jsonb_build_object('fleetRelation',jsonb_build_object(
    'id',${field('id', 's.id')},'saleNumber',${field('sale_number', 's.sale_number')},
    'createdDate',(${field('created_at', 's.created_at')}::timestamptz at time zone 'America/Sao_Paulo')::date::text,
    'clientId',coalesce(${field('client_id', 's.client_id')},${field('id', 's.id')}),'clientName',${name},
    'vehicles',coalesce(${cargo},jsonb_build_array(jsonb_build_object('model',${model},'plate',${plate},'identification',null))),
    'returnFreight',${field('return_freight','false')},'driverName',${field('driver_name', 'null::text')},'serviceSituation',${field('service_situation', 's.service_situation')},
    'situation',${field('operational_status', 's.operational_status')},'departureDate',${field('pickup_date', 'null::text')},
    'amountCents',${amount},'receivedCents',${received},'receivedDates',${fleet ? dates : `case when f.id is not null then ${dates} else ${saleDates} end`},
    'paid',case when (${received})>=(${amount}) then 'Sim' when (${received})>0 then 'Parcial' else 'Não' end,
    'notes',coalesce(${field('notes', 's.notes')},'')))`;
}

export async function renderFleetOrderRelation(order: ServiceOrderVersion, includeObservations: boolean) {
  const row = order.snapshot.fleetRelation;
  if (!row) throw new Error('OS da relação sem dados da venda.');
  const report = buildFleetClientReport({id: row.clientId, name: row.clientName}, row.createdDate, row.createdDate, [row]);
  return renderFleetClientPdf(report, includeObservations && row.notes ? [{saleId: row.id, text: row.notes}] : [], order.snapshot.saleNumber);
}
