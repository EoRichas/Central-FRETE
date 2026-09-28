BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_phone_format;
ALTER TABLE public.users ADD CONSTRAINT users_phone_format CHECK (phone IS NULL OR phone ~ '^[0-9]{10,13}$');
-- Preserve the plate and costs even after deleting the master record.
ALTER TABLE public.fleet_trips ADD COLUMN IF NOT EXISTS vehicle_plate text;
UPDATE public.fleet_trips t SET vehicle_plate=v.plate FROM public.fleet_vehicles v WHERE t.vehicle_id=v.id AND t.vehicle_plate IS NULL;
ALTER TABLE public.fleet_vehicle_costs ADD COLUMN IF NOT EXISTS vehicle_plate text;
UPDATE public.fleet_vehicle_costs c SET vehicle_plate=v.plate FROM public.fleet_vehicles v WHERE c.vehicle_id=v.id AND c.vehicle_plate IS NULL;
ALTER TABLE public.fleet_trips ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE public.fleet_vehicle_costs ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE public.fleet_trips DROP CONSTRAINT IF EXISTS fleet_trips_vehicle_id_fkey;
ALTER TABLE public.fleet_trips ADD CONSTRAINT fleet_trips_vehicle_id_fkey FOREIGN KEY(vehicle_id) REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.fleet_vehicle_costs DROP CONSTRAINT IF EXISTS fleet_vehicle_costs_vehicle_id_fkey;
ALTER TABLE public.fleet_vehicle_costs ADD CONSTRAINT fleet_vehicle_costs_vehicle_id_fkey FOREIGN KEY(vehicle_id) REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.fleet_drivers DROP CONSTRAINT IF EXISTS fleet_drivers_vehicle_id_fkey;
ALTER TABLE public.fleet_drivers ADD CONSTRAINT fleet_drivers_vehicle_id_fkey FOREIGN KEY(vehicle_id) REFERENCES public.fleet_vehicles(id) ON DELETE SET NULL;
ALTER TABLE public.fleet_freights DROP CONSTRAINT IF EXISTS fleet_freight_trip_costs;
ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freight_trip_costs CHECK (trip_id IS NULL OR (driver_id IS NOT NULL AND toll_cents=0));
-- Runs for all deletion paths, including future administrative maintenance.
CREATE OR REPLACE FUNCTION public.preserve_deleted_vehicle_plate() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE public.fleet_trips SET vehicle_plate=OLD.plate WHERE vehicle_id=OLD.id;
 UPDATE public.fleet_vehicle_costs SET vehicle_plate=OLD.plate WHERE vehicle_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.preserve_deleted_vehicle_plate() FROM PUBLIC;
DROP TRIGGER IF EXISTS preserve_deleted_vehicle_plate ON public.fleet_vehicles;
CREATE TRIGGER preserve_deleted_vehicle_plate BEFORE DELETE ON public.fleet_vehicles FOR EACH ROW EXECUTE FUNCTION public.preserve_deleted_vehicle_plate();
COMMIT;
