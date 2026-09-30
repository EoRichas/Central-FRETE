BEGIN;
ALTER TABLE public.fleet_vehicles ADD COLUMN IF NOT EXISTS model text CHECK (model IS NULL OR length(model) <= 120);
COMMIT;
