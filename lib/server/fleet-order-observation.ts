import type { CurrentUser } from '@/lib/contracts';
import type { ServiceOrderVersion } from '@/lib/domain/service-order';
import { ApiError, getD1, queryFirst } from './d1';

/** Called only with a canonical row already authorized by loadFleetClientReport. */
export async function saveFleetOrderObservation(user: CurrentUser, rowId: string, include: boolean, text: string | null) {
  const fleet = rowId.startsWith('freight:');
  const id = rowId.slice(fleet ? 8 : 5);
  if (!fleet && !rowId.startsWith('sale:')) throw new ApiError(400, 'Venda inválida.');
  const table = fleet ? 'fleet_freights' : 'freight_sales';
  const db = await getD1();
  const result = await db.batch([
    db.prepare(`update ${table} set order_include_observation=?,order_observation=coalesce(?,order_observation)
      where id=? ${user.role === 'VENDEDOR' ? 'and seller_id=?' : ''} returning id`)
      .bind(include, text, id, ...(user.role === 'VENDEDOR' ? [user.id] : [])),
    db.prepare(`insert into audit_logs(id,entity_type,entity_id,action,actor_user_id,actor_email,new_value)
      select ?,?::text,id,'ORDER_OBSERVATION_UPDATED',?,?,? from ${table}
      where id=? ${user.role === 'VENDEDOR' ? 'and seller_id=?' : ''}`)
      .bind(crypto.randomUUID(), fleet ? 'FLEET_FREIGHT' : 'SALE', user.id, user.email,
        JSON.stringify({included: include}), id, ...(user.role === 'VENDEDOR' ? [user.id] : [])),
  ]);
  if (!result[0].results.length) throw new ApiError(404, 'Venda não disponível para seu perfil.');
}

/** Apply the current OS note without changing any issued version/sale annotation. */
export async function orderWithSavedObservation(order: ServiceOrderVersion, source: 'sale' | 'fleet', id: string) {
  const row = order.snapshot.fleetRelation;
  if (!row) return {order, include: true};
  const fleet = source === 'fleet' || row.id !== id;
  const saved = await queryFirst<{text: string | null; included: boolean | null}>(
    `select order_observation as text,order_include_observation as included from ${fleet ? 'fleet_freights' : 'freight_sales'} where id=?`, [row.id]);
  return {order: {...order, snapshot: {...order.snapshot, fleetRelation: {...row, notes: saved?.text ?? row.notes}}}, include: saved?.included ?? false};
}
