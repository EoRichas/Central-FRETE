BEGIN;

UPDATE public.fleet_drivers
SET vehicle_id = NULL
WHERE vehicle_id IS NOT NULL;

COMMIT;
