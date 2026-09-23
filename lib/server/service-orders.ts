import type { CurrentUser } from '@/lib/contracts';
import type { ServiceOrderSnapshot, ServiceOrderVersion, ServiceOrderReport } from '@/lib/domain/service-order';
import { ApiError, getD1, queryAll, queryFirst } from '@/lib/server/d1';
import { getSale } from '@/lib/server/repository';

export function orderIssuer(): ServiceOrderSnapshot['issuer'] {
  return { name: 'Central Express', document: process.env.CENTRAL_EXPRESS_DOCUMENT?.trim() || null,
    address: process.env.CENTRAL_EXPRESS_ADDRESS?.trim() || null,
    contact: process.env.CENTRAL_EXPRESS_CONTACT?.trim() || null };
}
// One SQL statement captures all document fields from the same MVCC snapshot, including
// linked fleet cargo and client address. No costs, commissions or internal finance are disclosed.
export const ORDER_SOURCE_SQL = `select jsonb_build_object(
 'schemaVersion',1,'issuer',?::jsonb,'saleId',s.id,'saleNumber',s.sale_number,'saleDate',s.sale_date,
 'clientName',c.legal_name,'clientDocument',c.cpf_cnpj,
 'clientAddress',(select concat_ws(', ',a.street,a.number,nullif(a.complement,''),a.district,a.city,a.state,a.cep)
   from client_addresses a where a.client_id=c.id order by (a.type='COBRANCA') desc,a.is_primary desc,a.id limit 1),
 'origin',s.origin,'destination',s.destination,'pickupAddress',s.pickup_address_snapshot,'deliveryAddress',s.delivery_address_snapshot,
 'cargoVehicles',case when f.id is not null then coalesce(f.cargo_vehicles,jsonb_build_array(jsonb_build_object('model',f.cargo_vehicle_model,'plate',f.cargo_plate,'identification',null)))
   else coalesce(s.cargo_vehicles,jsonb_build_array(jsonb_build_object('model',s.vehicle,'plate',s.plate,'identification',null))) end,
 'freightAmountCents',s.freight_amount_cents,'paymentCondition',s.payment_condition,
 'installments',coalesce((select jsonb_agg(jsonb_build_object('dueDate',i.due_date,'paymentMethod',i.payment_method,'amountCents',i.expected_amount_cents) order by i.installment_number,i.id)
   from receivable_installments i where i.sale_id=s.id),'[]'::jsonb),
 'financialDueDate',s.financial_due_date,'operationalDeadlineDays',s.operational_deadline_days,'deliveryDeadline',s.delivery_deadline,'notes',s.notes
) || case when s.origin_location_type is null then '{}'::jsonb else jsonb_build_object('originLocationType',s.origin_location_type) end as snapshot from freight_sales s left join clients c on c.id=s.client_id
left join fleet_freights f on f.id=s.fleet_freight_id where s.id=?`;

export async function authorizeOrder(user: CurrentUser, saleId: string) {
  if (user.role === 'OPERACIONAL') throw new ApiError(403, 'Seu perfil não permite acessar documentos de vendas.');
  if (!await getSale(user, saleId)) throw new ApiError(404, 'Venda não encontrada.');
}
export async function readOrderVersion(saleId: string, version?: number) {
  return queryFirst<ServiceOrderVersion>(`select v.order_id as orderId,v.version,v.created_at::text as createdAt,v.snapshot
    from service_order_versions v join service_orders o on o.id=v.order_id
    where o.sale_id=? ${version ? 'and v.version=?' : ''} order by v.version desc limit 1`, version ? [saleId,version] : [saleId]);
}
export async function orderReport(saleId: string): Promise<ServiceOrderReport> {
  const latest = await readOrderVersion(saleId);
  const source = await queryFirst<{snapshot: ServiceOrderSnapshot}>(ORDER_SOURCE_SQL,[JSON.stringify(orderIssuer()),saleId]);
  const versions = await queryAll<{version:number;createdAt:string}>(`select v.version,v.created_at::text as createdAt
    from service_order_versions v join service_orders o on o.id=v.order_id where o.sale_id=? order by v.version desc`,[saleId]);
  return { latest, versions, stale: Boolean(latest && JSON.stringify(latest.snapshot) !== JSON.stringify(source?.snapshot)) };
}
/** 1:1 identity; immutable versions. Sale edits never rewrite an emitted document.
 * The sale row lock serializes issuance and sale edits. Repeating an unchanged issuance
 * returns the existing version. A changed source creates the next version atomically.
 */
export async function issueOrder(saleId: string, user: CurrentUser) {
  const db = await getD1();
  await db.batch([
    db.prepare('select id from freight_sales where id=? for update').bind(saleId),
    db.prepare('insert into service_orders(id,sale_id,created_by) values(?,?,?) on conflict(sale_id) do nothing').bind(crypto.randomUUID(),saleId,user.id),
    db.prepare(`with source as (${ORDER_SOURCE_SQL}), latest as (
      select v.version,v.snapshot from service_order_versions v join service_orders o on o.id=v.order_id
      where o.sale_id=? order by v.version desc limit 1)
      insert into service_order_versions(order_id,version,snapshot,created_by)
      select o.id,coalesce((select version from latest),0)+1,source.snapshot,?
      from service_orders o cross join source where o.sale_id=?
      and not exists(select 1 from latest where latest.snapshot=source.snapshot)`)
      .bind(JSON.stringify(orderIssuer()),saleId,saleId,user.id,saleId),
  ]);
  return orderReport(saleId);
}
