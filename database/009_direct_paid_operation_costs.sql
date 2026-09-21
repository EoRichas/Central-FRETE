BEGIN;

UPDATE public.freight_costs
SET confirmed = 1,
    payment_status = 'NAO_APLICAVEL',
    updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE category IN ('SEGURO_ALLIANZ', 'ICMS', 'CTE', 'MDFE', 'CTE_MDFE', 'ICMS_CTE_MDFE')
  AND (confirmed <> 1 OR payment_status <> 'NAO_APLICAVEL');

UPDATE public.freight_sales AS sale
SET costs_pending = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.freight_costs AS cost
        WHERE cost.sale_id = sale.id
          AND cost.confirmed = 0
      ) THEN 1
      ELSE 0
    END,
    updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
WHERE EXISTS (
  SELECT 1
  FROM public.freight_costs AS cost
  WHERE cost.sale_id = sale.id
    AND cost.category IN ('SEGURO_ALLIANZ', 'ICMS', 'CTE', 'MDFE', 'CTE_MDFE', 'ICMS_CTE_MDFE')
);

COMMIT;
