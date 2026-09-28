import { roleCan } from "@/lib/domain/permissions";
import type { CurrentUser } from '@/lib/contracts';
import type { ServiceOrderSnapshot, ServiceOrderVersion, ServiceOrderReport } from '@/lib/domain/service-order';
import { ApiError, getD1, queryAll, queryFirst } from '@/lib/server/d1';
import { getSale } from '@/lib/server/repository';

export function orderIssuer(phone: string | null = null): ServiceOrderSnapshot['issuer'] {
  return { name: 'Central Express', document: process.env.CENTRAL_EXPRESS_DOCUMENT?.trim() || null,
    address: process.env.CENTRAL_EXPRESS_ADDRESS?.trim() || null,
    contact: phone, contactSource: 'USER' };
}
// Only client-facing fields belong to new document snapshots. Internal costs do not
// invalidate the client document. Historical versions remain unchanged.
export const ORDER_SOURCE_SQL = `select jsonb_build_object(
 'schemaVersion',3,'layoutVersion','central-express-client-20260928','saleChannel',s.sale_channel,'issuer',?::text::jsonb,'saleId',s.id,'saleNumber',s.sale_number,'saleDate',s.sale_date,
 'clientEmail',(select cc.email from client_contacts cc where cc.client_id=c.id and nullif(trim(cc.email),'') is not null order by cc.is_primary desc,cc.id limit 1),'clientName',coalesce(c.legal_name,f.client_name),'clientDocument',c.cpf_cnpj,
 'clientAddress',(select concat_ws(', ',a.street,a.number,nullif(a.complement,''),a.district,a.city,a.state,a.cep)
   from client_addresses a where a.client_id=c.id order by (a.type='COBRANCA') desc,a.is_primary desc,a.id limit 1),
 'origin',s.origin,'destination',s.destination,'pickupAddress',s.pickup_address_snapshot,'deliveryAddress',s.delivery_address_snapshot,
 'cargoVehicles',case when f.id is not null then coalesce(f.cargo_vehicles,jsonb_build_array(jsonb_build_object('model',f.cargo_vehicle_model,'plate',f.cargo_plate,'identification',null)))
   else coalesce(s.cargo_vehicles,jsonb_build_array(jsonb_build_object('model',s.vehicle,'plate',s.plate,'identification',null))) end,
 'freightAmountCents',s.freight_amount_cents,
 'installments',coalesce((select jsonb_agg(jsonb_build_object('dueDate',i.due_date,'paymentMethod',i.payment_method,'amountCents',i.expected_amount_cents) order by i.installment_number,i.id)
   from receivable_installments i where i.sale_id=s.id),'[]'::jsonb),
 'financialDueDate',s.financial_due_date,'operationalDeadlineDays',s.operational_deadline_days,'deliveryDeadline',null,'notes',s.notes
) || case when s.origin_location_type is null then '{}'::jsonb else jsonb_build_object('originLocationType',s.origin_location_type) end || case when s.destination_location_type is null then '{}'::jsonb else jsonb_build_object('destinationLocationType',s.destination_location_type) end as snapshot from freight_sales s left join clients c on c.id=s.client_id
left join fleet_freights f on f.id=s.fleet_freight_id where s.id=?`;

export async function authorizeOrder(user: CurrentUser, saleId: string) {
  if (!roleCan(user.role, 'VIEW_SERVICE_ORDERS')) throw new ApiError(403, 'Seu perfil não permite acessar documentos de vendas.');
  if (!await getSale(user, saleId)) throw new ApiError(404, 'Venda não encontrada.');
}
const FLEET_ORDER_SOURCE_SQL = `select jsonb_build_object(
 'schemaVersion',3,'layoutVersion','central-express-client-20260928','saleChannel','FROTA',
 'issuer',?::text::jsonb,'saleId',f.id,'saleNumber',f.sale_number,'saleDate',f.pickup_date,
 'clientName',f.client_name,'clientEmail',null,'clientDocument',null,'clientAddress',null,
 'origin',f.origin,'destination',f.destination,'pickupAddress',null,'deliveryAddress',null,
 'cargoVehicles',coalesce(f.cargo_vehicles,jsonb_build_array(jsonb_build_object('model',f.cargo_vehicle_model,'plate',f.cargo_plate,'identification',null))),
 'freightAmountCents',f.freight_amount_cents,'installments','[]'::jsonb,'financialDueDate',null,
 'operationalDeadlineDays',null,'deliveryDeadline',null,'notes',null
) as snapshot from fleet_freights f where f.id=? and not exists(select 1 from freight_sales s where s.fleet_freight_id=f.id)`;

type OrderSource = 'sale' | 'fleet';
const orderSources = {
 sale: {table:'freight_sales', owner:'sale_id', sql:ORDER_SOURCE_SQL, auditKey:'saleId'},
 fleet: {table:'fleet_freights', owner:'fleet_freight_id', sql:FLEET_ORDER_SOURCE_SQL, auditKey:'fleetFreightId'},
} as const;

export async function readOrderVersion(id: string, version?: number, source: OrderSource = 'sale') {
  const spec=orderSources[source];
  return queryFirst<ServiceOrderVersion>(`select v.order_id as orderId,v.version,v.created_at::text as createdAt,v.snapshot
    from service_order_versions v join service_orders o on o.id=v.order_id
    where o.${spec.owner}=? ${version ? 'and v.version=?' : ''} order by v.version desc limit 1`, version ? [id,version] : [id]);
}
export async function orderReport(id: string, kind: OrderSource = 'sale', userId?: string): Promise<ServiceOrderReport> {
  const spec=orderSources[kind];
  const latest = await readOrderVersion(id,undefined,kind);
  const user = userId ? await queryFirst<{phone:string|null}>("select phone from users where id=?",[userId]) : null;
  const source = await queryFirst<{snapshot: ServiceOrderSnapshot}>(spec.sql,[JSON.stringify(orderIssuer(userId ? user?.phone ?? null : latest?.snapshot.issuer?.contact ?? null)),id]);
  const versions = await queryAll<{version:number;createdAt:string}>(`select v.version,v.created_at::text as createdAt
    from service_order_versions v join service_orders o on o.id=v.order_id where o.${spec.owner}=? order by v.version desc`,[id]);
  return { latest, versions, stale: Boolean(latest && JSON.stringify(latest.snapshot) !== JSON.stringify(source?.snapshot)) };
}
/** A row lock serializes issuance with edits and linking. Existing snapshots are immutable. */
export async function issueOrder(id: string, user: CurrentUser, kind: OrderSource = 'sale') {
  const spec=orderSources[kind];
  const contact = await queryFirst<{phone:string|null}>("select phone from users where id=?",[user.id]);
  const db = await getD1();
  await db.batch([
    db.prepare(`select id from ${spec.table} where id=? for update`).bind(id),
    db.prepare(`insert into service_orders(id,${spec.owner},created_by)
      select ?,id,? from ${spec.table} where id=?
      ${kind==='fleet' ? 'and not exists(select 1 from freight_sales s where s.fleet_freight_id=fleet_freights.id)' : ''}
      on conflict(${spec.owner}) do nothing`).bind(crypto.randomUUID(),user.id,id),
    db.prepare(`with source as (${spec.sql}), latest as (
      select v.version,v.snapshot from service_order_versions v join service_orders o on o.id=v.order_id
      where o.${spec.owner}=? order by v.version desc limit 1), issued as (
      insert into service_order_versions(order_id,version,snapshot,created_by)
      select o.id,coalesce((select version from latest),0)+1,source.snapshot,?
      from service_orders o cross join source where o.${spec.owner}=?
      and not exists(select 1 from latest where latest.snapshot=source.snapshot)
      returning order_id,version)
      insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,new_value)
      select gen_random_uuid()::text,'SERVICE_ORDER',order_id,'VERSION_ISSUED',?,?,jsonb_build_object('version',version,'${spec.auditKey}',?::text)::text from issued`)
      .bind(JSON.stringify(orderIssuer(contact?.phone ?? null)),id,id,user.id,id,user.id,user.email,id),
  ]);
  return orderReport(id,kind,user.id);
}

export async function fleetOrderTarget(id: string) {
  const freight=await queryFirst<{saleId:string|null}>(`select (select s.id from freight_sales s where s.fleet_freight_id=f.id) as saleId from fleet_freights f where f.id=?`,[id]);
  if(!freight) throw new ApiError(404,'Frete da frota não encontrado.');
  return freight.saleId ? {id:freight.saleId,kind:'sale' as const} : {id,kind:'fleet' as const};
}
