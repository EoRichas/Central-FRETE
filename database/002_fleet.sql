-- Central Frete: módulo de controle operacional da frota.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('central-frete-fleet-v1'));

CREATE TABLE IF NOT EXISTS public.fleet_settings (
  id text PRIMARY KEY CHECK (id = 'GLOBAL'),
  fuel_price_cents integer NOT NULL CHECK (fuel_price_cents BETWEEN 0 AND 1000000),
  average_consumption_milli_km_per_liter integer NOT NULL
    CHECK (average_consumption_milli_km_per_liter BETWEEN 1 AND 100000),
  fallback_fixed_cost_per_km_cents integer NOT NULL
    CHECK (fallback_fixed_cost_per_km_cents BETWEEN 0 AND 1000000),
  match_window_days integer NOT NULL CHECK (match_window_days BETWEEN 0 AND 90),
  office_monthly_cost_cents bigint CHECK (office_monthly_cost_cents >= 0),
  updated_by text REFERENCES public.users (id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

INSERT INTO public.fleet_settings (
  id,
  fuel_price_cents,
  average_consumption_milli_km_per_liter,
  fallback_fixed_cost_per_km_cents,
  match_window_days,
  office_monthly_cost_cents
) VALUES ('GLOBAL', 738, 3200, 45, 3, NULL)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS fleet_settings_updated_by_idx
  ON public.fleet_settings (updated_by);

CREATE TABLE IF NOT EXISTS public.fleet_vehicles (
  id text PRIMARY KEY,
  plate text NOT NULL CHECK (plate ~ '^[A-Z0-9]{7}$'),
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_plate_unique
  ON public.fleet_vehicles (plate);
CREATE INDEX IF NOT EXISTS fleet_vehicles_active_idx
  ON public.fleet_vehicles (active, plate);

CREATE TABLE IF NOT EXISTS public.fleet_drivers (
  id text PRIMARY KEY,
  name text NOT NULL,
  active integer NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_name_unique
  ON public.fleet_drivers (name);
CREATE INDEX IF NOT EXISTS fleet_drivers_active_idx
  ON public.fleet_drivers (active, name);

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_costs (
  id text PRIMARY KEY,
  vehicle_id text NOT NULL REFERENCES public.fleet_vehicles (id) ON DELETE CASCADE,
  competency text NOT NULL CHECK (competency ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  distance_meters bigint NOT NULL CHECK (distance_meters > 0),
  monthly_cost_cents bigint NOT NULL CHECK (monthly_cost_cents >= 0),
  created_by text REFERENCES public.users (id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_costs_vehicle_competency_unique
  ON public.fleet_vehicle_costs (vehicle_id, competency);
CREATE INDEX IF NOT EXISTS fleet_vehicle_costs_competency_idx
  ON public.fleet_vehicle_costs (competency);
CREATE INDEX IF NOT EXISTS fleet_vehicle_costs_created_by_idx
  ON public.fleet_vehicle_costs (created_by);

CREATE TABLE IF NOT EXISTS public.fleet_freights (
  id text PRIMARY KEY,
  vehicle_id text REFERENCES public.fleet_vehicles (id) ON DELETE SET NULL,
  vehicle_plate text NOT NULL,
  driver_id text REFERENCES public.fleet_drivers (id) ON DELETE SET NULL,
  driver_name text NOT NULL,
  client_name text NOT NULL,
  cargo_vehicle_model text,
  cargo_plate text,
  origin text NOT NULL,
  destination text NOT NULL,
  pickup_date text NOT NULL,
  delivery_date text,
  billing_date text,
  operational_status text NOT NULL CHECK (
    operational_status IN (
      'SEM_PREVISAO',
      'COLETA_AGENDADA',
      'EM_ROTA',
      'NO_PATIO',
      'AGUARDANDO_CARGA',
      'ENTREGUE',
      'FATURADO',
      'COLETA_FRUSTRADA'
    )
  ),
  priority text NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('NORMAL', 'URGENTE', 'ATRASADO')),
  freight_amount_cents bigint NOT NULL CHECK (freight_amount_cents >= 0),
  distance_meters bigint NOT NULL CHECK (distance_meters >= 0),
  toll_cents bigint NOT NULL DEFAULT 0 CHECK (toll_cents >= 0),
  driver_commission_cents bigint NOT NULL DEFAULT 0 CHECK (driver_commission_cents >= 0),
  return_used integer NOT NULL DEFAULT 0 CHECK (return_used IN (0, 1)),
  source_key text,
  source_workbook text,
  source_row integer,
  created_by text REFERENCES public.users (id) ON DELETE SET NULL,
  updated_by text REFERENCES public.users (id) ON DELETE SET NULL,
  created_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at text NOT NULL DEFAULT (to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_freights_source_key_unique
  ON public.fleet_freights (source_key);
CREATE INDEX IF NOT EXISTS fleet_freights_pickup_date_idx
  ON public.fleet_freights (pickup_date DESC);
CREATE INDEX IF NOT EXISTS fleet_freights_vehicle_idx
  ON public.fleet_freights (vehicle_id, pickup_date DESC);
CREATE INDEX IF NOT EXISTS fleet_freights_driver_idx
  ON public.fleet_freights (driver_id, pickup_date DESC);
CREATE INDEX IF NOT EXISTS fleet_freights_status_idx
  ON public.fleet_freights (operational_status, priority);
CREATE INDEX IF NOT EXISTS fleet_freights_created_by_idx
  ON public.fleet_freights (created_by);
CREATE INDEX IF NOT EXISTS fleet_freights_updated_by_idx
  ON public.fleet_freights (updated_by);

-- O frontend não acessa essas tabelas pela Data API. Toda leitura e escrita
-- passa pelas rotas autenticadas do servidor, conectadas ao PostgreSQL.
ALTER TABLE public.fleet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_freights ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.fleet_settings,
  public.fleet_vehicles,
  public.fleet_drivers,
  public.fleet_vehicle_costs,
  public.fleet_freights
FROM anon, authenticated;

COMMIT;
