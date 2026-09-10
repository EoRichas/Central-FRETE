-- Central Frete: permite preservar bases mensais da planilha sem obrigar todos os meses a compor a média do rateio.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('central-frete-fleet-cost-average-flag-v1'));

ALTER TABLE public.fleet_vehicle_costs
ADD COLUMN IF NOT EXISTS include_in_rate_average integer NOT NULL DEFAULT 1
CHECK (include_in_rate_average IN (0, 1));

COMMIT;
