BEGIN;
-- Additive: do not repurpose historical ICMS/CTE or overwrite sale notes.
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS damages_cost_cents bigint NOT NULL DEFAULT 0 CHECK (damages_cost_cents BETWEEN 0 AND 9000000000000);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS order_observation text CHECK (length(order_observation) <= 6000);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS order_include_observation boolean;
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS order_observation text CHECK (length(order_observation) <= 6000);
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS order_include_observation boolean;
-- Existing protected tables retain their grants/RLS. No new public API/policy.
UPDATE public.fleet_settings SET fuel_price_cents=745,average_consumption_milli_km_per_liter=4000
WHERE fuel_price_cents=738 AND average_consumption_milli_km_per_liter=3200;
COMMIT;
