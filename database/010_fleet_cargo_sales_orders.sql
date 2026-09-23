BEGIN;
SELECT pg_advisory_xact_lock(hashtext('central-frete-cargo-orders-v1'));
ALTER TABLE public.fleet_freights
 ADD COLUMN IF NOT EXISTS cargo_vehicles jsonb CHECK (jsonb_typeof(cargo_vehicles) = 'array' AND jsonb_array_length(cargo_vehicles) BETWEEN 1 AND 100),
 ADD COLUMN IF NOT EXISTS fuel_liters_milli bigint CHECK (fuel_liters_milli BETWEEN 0 AND 1000000000),
 ADD COLUMN IF NOT EXISTS fuel_pump_amount_cents bigint CHECK (fuel_pump_amount_cents BETWEEN 0 AND 9000000000000);
-- Real fuel reuses actual_fuel_cost_cents. Never add a second amount for the same expense.
-- Legacy trip costs are apportioned deterministically; per-freight actual fuel replaces its share.
ALTER TABLE public.fleet_freights DROP CONSTRAINT IF EXISTS fleet_freight_trip_costs;
ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freight_trip_costs
 CHECK (trip_id IS NULL OR (vehicle_id IS NOT NULL AND driver_id IS NOT NULL AND toll_cents = 0));
ALTER TABLE public.freight_sales
 ADD COLUMN IF NOT EXISTS cargo_vehicles jsonb CHECK (jsonb_typeof(cargo_vehicles) = 'array' AND jsonb_array_length(cargo_vehicles) BETWEEN 1 AND 100),
 ADD COLUMN IF NOT EXISTS fleet_freight_id text REFERENCES public.fleet_freights(id),
 ADD COLUMN IF NOT EXISTS payment_condition text CHECK (length(payment_condition) <= 200);
CREATE UNIQUE INDEX IF NOT EXISTS sale_fleet_freight_unique ON public.freight_sales(fleet_freight_id) WHERE fleet_freight_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.sale_number_counters (
 year integer PRIMARY KEY CHECK (year BETWEEN 1 AND 9999),
 last_value bigint NOT NULL CHECK (last_value BETWEEN 0 AND 9007199254740000)
);
-- Seed only new-format numbers. Legacy identifiers are preserved verbatim.
INSERT INTO public.sale_number_counters(year,last_value)
 SELECT split_part(sale_number,'-',1)::integer, max(split_part(sale_number,'-',2)::bigint)
 FROM public.freight_sales WHERE sale_number ~ '^[0-9]{4}-[0-9]{1,15}$'
 GROUP BY 1 ON CONFLICT (year) DO UPDATE SET last_value=greatest(sale_number_counters.last_value,excluded.last_value);
CREATE OR REPLACE FUNCTION public.assign_sale_number() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sequence_value bigint; sale_year integer;
BEGIN
 IF TG_OP = 'UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 -- Imports with explicit legacy numbers remain supported. API creates always submit NULL.
 IF NEW.sale_number IS NULL THEN
  sale_year := extract(year FROM NEW.sale_date::date)::integer;
  INSERT INTO public.sale_number_counters(year,last_value) VALUES(sale_year,1)
   ON CONFLICT (year) DO UPDATE SET last_value=sale_number_counters.last_value+1
   RETURNING last_value INTO sequence_value;
  NEW.sale_number := sale_year::text || '-' || sequence_value::text;
 ELSIF NEW.sale_number ~ '^[0-9]{4}-[0-9]{1,15}$' THEN
  INSERT INTO public.sale_number_counters(year,last_value)
   VALUES(split_part(NEW.sale_number,'-',1)::integer,split_part(NEW.sale_number,'-',2)::bigint)
   ON CONFLICT(year) DO UPDATE SET last_value=greatest(sale_number_counters.last_value,excluded.last_value);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS freight_sale_number ON public.freight_sales;
CREATE TRIGGER freight_sale_number BEFORE INSERT OR UPDATE OF sale_number ON public.freight_sales
 FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();
CREATE TABLE IF NOT EXISTS public.service_orders (
 id text PRIMARY KEY,
 sale_id text NOT NULL UNIQUE REFERENCES public.freight_sales(id),
 created_by text NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.service_order_versions (
 order_id text NOT NULL REFERENCES public.service_orders(id),
 version integer NOT NULL CHECK (version > 0),
 snapshot jsonb NOT NULL,
 created_by text NOT NULL REFERENCES public.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(order_id,version)
);
ALTER TABLE public.sale_number_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sale_number_counters, public.service_orders, public.service_order_versions FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_sale_number() FROM PUBLIC;
COMMIT;
