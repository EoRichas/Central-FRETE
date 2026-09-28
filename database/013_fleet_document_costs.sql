BEGIN;
ALTER TABLE fleet_freights ADD COLUMN IF NOT EXISTS insurance_cost_cents bigint NOT NULL DEFAULT 0 CHECK (insurance_cost_cents BETWEEN 0 AND 9000000000000);
ALTER TABLE fleet_freights ADD COLUMN IF NOT EXISTS invoice_cost_cents bigint NOT NULL DEFAULT 0 CHECK (invoice_cost_cents BETWEEN 0 AND 9000000000000);
ALTER TABLE fleet_freights ADD COLUMN IF NOT EXISTS icms_cost_cents bigint NOT NULL DEFAULT 0 CHECK (icms_cost_cents BETWEEN 0 AND 9000000000000);
ALTER TABLE fleet_freights ADD COLUMN IF NOT EXISTS cte_mdfe_cost_cents bigint NOT NULL DEFAULT 0 CHECK (cte_mdfe_cost_cents BETWEEN 0 AND 9000000000000);
COMMIT;
