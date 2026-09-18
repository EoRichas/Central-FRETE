BEGIN;
SELECT pg_advisory_xact_lock(hashtext('central-frete-results-v1'));
CREATE TABLE IF NOT EXISTS public.fleet_trips (
  id text PRIMARY KEY,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  vehicle_id text NOT NULL REFERENCES public.fleet_vehicles(id),
  driver_id text NOT NULL REFERENCES public.fleet_drivers(id),
  operation_date text NOT NULL CHECK (operation_date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  fuel_cost_cents bigint NOT NULL CHECK (fuel_cost_cents BETWEEN 0 AND 9000000000000),
  toll_cents bigint NOT NULL CHECK (toll_cents BETWEEN 0 AND 9000000000000),
  other_cost_cents bigint NOT NULL CHECK (other_cost_cents BETWEEN 0 AND 9000000000000),
  notes text NOT NULL DEFAULT '',
  created_by text REFERENCES public.users(id),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE (id, vehicle_id, driver_id)
);
ALTER TABLE public.fleet_freights
  ADD COLUMN IF NOT EXISTS trip_id text,
  ADD COLUMN IF NOT EXISTS yard_cost_cents bigint NOT NULL DEFAULT 0 CHECK (yard_cost_cents BETWEEN 0 AND 9000000000000),
  ADD COLUMN IF NOT EXISTS pickup_cost_cents bigint NOT NULL DEFAULT 0 CHECK (pickup_cost_cents BETWEEN 0 AND 9000000000000),
  ADD COLUMN IF NOT EXISTS delivery_cost_cents bigint NOT NULL DEFAULT 0 CHECK (delivery_cost_cents BETWEEN 0 AND 9000000000000),
  ADD COLUMN IF NOT EXISTS other_cost_cents bigint NOT NULL DEFAULT 0 CHECK (other_cost_cents BETWEEN 0 AND 9000000000000),
  ADD COLUMN IF NOT EXISTS actual_fuel_cost_cents bigint CHECK (actual_fuel_cost_cents BETWEEN 0 AND 9000000000000);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fleet_freight_trip_references') THEN
    ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freight_trip_references
      FOREIGN KEY (trip_id, vehicle_id, driver_id) REFERENCES public.fleet_trips(id, vehicle_id, driver_id);
    ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freight_trip_costs
      CHECK (trip_id IS NULL OR (vehicle_id IS NOT NULL AND driver_id IS NOT NULL AND toll_cents = 0 AND actual_fuel_cost_cents IS NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS fleet_freight_trip_idx ON public.fleet_freights(trip_id);
CREATE INDEX IF NOT EXISTS fleet_freight_billing_idx ON public.fleet_freights(billing_date);
CREATE INDEX IF NOT EXISTS fleet_trips_date_idx ON public.fleet_trips(operation_date);
CREATE TABLE IF NOT EXISTS public.company_monthly_entries (
  id text PRIMARY KEY,
  competency text NOT NULL CHECK (competency ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  kind text NOT NULL CHECK (kind IN ('REVENUE', 'VARIABLE', 'FIXED')),
  description text NOT NULL CHECK (length(description) BETWEEN 1 AND 200),
  amount_cents bigint NOT NULL CHECK (amount_cents BETWEEN 1 AND 9000000000000),
  created_by text REFERENCES public.users(id),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);
CREATE INDEX IF NOT EXISTS company_monthly_entries_month_idx ON public.company_monthly_entries(competency);
CREATE TABLE IF NOT EXISTS public.company_monthly_closings (
  id text PRIMARY KEY,
  competency text NOT NULL CHECK (competency ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  snapshot jsonb NOT NULL,
  closed_by text NOT NULL REFERENCES public.users(id),
  closed_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  reopened_by text REFERENCES public.users(id),
  reopened_at text,
  reopen_reason text,
  CHECK ((reopened_at IS NULL AND reopened_by IS NULL AND reopen_reason IS NULL)
    OR (reopened_at IS NOT NULL AND reopened_by IS NOT NULL AND length(reopen_reason) >= 5))
);
CREATE UNIQUE INDEX IF NOT EXISTS company_monthly_one_closed ON public.company_monthly_closings(competency) WHERE reopened_at IS NULL;
ALTER TABLE public.fleet_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_monthly_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_monthly_closings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fleet_trips, public.company_monthly_entries, public.company_monthly_closings FROM anon, authenticated;
COMMIT;
