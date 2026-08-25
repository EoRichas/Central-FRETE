import { commissionCents } from "./finance.ts";

export const SELLER_COMMISSION_BASIS_POINTS = 700;
export const OPERATIONAL_COMMISSION_BASIS_POINTS = 300;

export function sellerCommissionCents(totalSalesCents: number) {
  return commissionCents(totalSalesCents, SELLER_COMMISSION_BASIS_POINTS);
}

export function operationalCommissionCents(totalSalesCents: number) {
  return commissionCents(totalSalesCents, OPERATIONAL_COMMISSION_BASIS_POINTS);
}
