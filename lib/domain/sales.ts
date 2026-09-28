export const SALE_CHANNELS = ["CEGONHA", "FROTA"] as const;
export type SaleChannel = (typeof SALE_CHANNELS)[number];
export const SALE_SORTS = ["number-asc", "date-desc", "date-asc", "value-desc", "value-asc"] as const;
export type SaleSort = (typeof SALE_SORTS)[number];
// Whitelisted SQL expressions; never interpolate a client-provided expression.
export const SALE_ORDER_SQL: Record<SaleSort, string> = {
  "number-asc": "case when s.sale_number ~ '^[0-9]+$' then s.sale_number::numeric end asc nulls last, s.sale_number asc, s.id asc",
  "date-desc": "s.sale_date desc, s.id asc",
  "date-asc": "s.sale_date asc, s.id asc",
  "value-desc": "s.freight_amount_cents desc, s.id asc",
  "value-asc": "s.freight_amount_cents asc, s.id asc",
};
