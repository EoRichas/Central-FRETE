import type { CurrentUser, SaleRecord } from '@/lib/contracts';
import type { FleetFreight } from '@/lib/domain/fleet';
import { canViewSellerCommission } from '@/lib/domain/permissions';
import { ApiError, queryAll, queryFirst } from '@/lib/server/d1';
import { integerInRange } from '@/lib/server/validation';

export function commissionProfileValue(value: unknown, fallback = 700) {
  if (value === undefined) return fallback;
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) throw new ApiError(400, 'Informe a comissão entre 0 e 100%, com até duas casas decimais.');
  return integerInRange(Math.round(Number(text) * 100), 'Comissão (%)', 0, 10000);
}

type Seller = { id: string; name: string; commissionBasisPoints: number };
export async function resolveSaleSeller(user: CurrentUser, payload: Record<string, unknown>, previous?: Pick<SaleRecord, 'sellerId' | 'sellerName' | 'commissionBasisPoints'>): Promise<Seller | {id: null; name: string; commissionBasisPoints: number}> {
  if (user.role !== 'ADMIN') {
    const actor = await queryFirst<Seller>(`select id,name,case when role='VENDEDOR' then commission_basis_points else 0 end as commissionBasisPoints from users where id=? and active=1`, [user.id]);
    if (!actor) throw new ApiError(403, 'Usuário inativo.');
    return actor;
  }
  const id = String(payload.sellerId ?? '').trim();
  const name = String(payload.sellerName ?? '').trim().toUpperCase();
  if (previous && ((id && id === previous.sellerId) || (!id && name === previous.sellerName.toUpperCase()))) {
    return {id: previous.sellerId, name: previous.sellerName, commissionBasisPoints: previous.commissionBasisPoints};
  }
  const matches = await queryAll<Seller>(`select id,name,commission_basis_points as commissionBasisPoints from users where role='VENDEDOR' and active=1 and ${id ? 'id=?' : 'upper(name)=?'} limit 2`, [id || name]);
  if (matches.length !== 1) throw new ApiError(400, 'Selecione um vendedor ativo no cadastro.');
  return matches[0];
}

// Resource ownership uses immutable IDs. A reused name must never grant access.
export function saleOwnership(user: CurrentUser, alias = 's'): {sql: string; params: unknown[]} {
  if (user.role === 'VENDEDOR') return {sql: `${alias}.seller_id = ?`, params: [user.id]};
  if (user.role === 'OPERACIONAL') return {sql: `${alias}.created_by = ?`, params: [user.id]};
  return {sql: '1=1', params: []};
}

export async function assertFleetAccess(user: CurrentUser, id: string) {
  const scope = user.role === 'VENDEDOR' ? 'and seller_id=?' : user.role === 'OPERACIONAL' ? 'and created_by=?' : '';
  const row = await queryFirst<{id:string}>(`select id from fleet_freights where id=? ${scope}`, scope ? [id,user.id] : [id]);
  if (!row) throw new ApiError(404, 'Frete da frota não encontrado.');
}

export function saleForViewer(sale: SaleRecord, user: CurrentUser) {
  if (canViewSellerCommission(user.role)) return sale;
  const { commissionBasisPoints: _rate, financial, ...rest } = sale;
  const { commissionCents: _commission, ...visibleFinancial } = financial;
  void _rate; void _commission;
  return {...rest, financial: visibleFinancial};
}

export function freightForViewer(freight: FleetFreight, user: CurrentUser) {
  if (canViewSellerCommission(user.role)) return freight;
  const {sellerCommissionBasisPoints: _rate, sellerCommissionCents: _commission, ...rest} = freight;
  void _rate; void _commission;
  return rest;
}
