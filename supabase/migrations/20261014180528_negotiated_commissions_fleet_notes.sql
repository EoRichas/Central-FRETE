BEGIN;
-- NULL keeps the historical percentage calculation; zero is an explicit agreement.
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS commission_override_cents bigint
  CHECK (commission_override_cents BETWEEN 0 AND 9000000000000);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS seller_commission_override_cents bigint
  CHECK (seller_commission_override_cents BETWEEN 0 AND 9000000000000);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS notes text
  CHECK (char_length(notes) <= 5000);
-- Existing rows and registered commission rates are deliberately preserved.
COMMIT;
