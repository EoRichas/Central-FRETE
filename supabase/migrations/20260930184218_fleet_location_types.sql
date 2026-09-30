BEGIN;
ALTER TABLE public.fleet_freights
 ADD COLUMN IF NOT EXISTS origin_location_type text CHECK (origin_location_type IN ('PATIO','PORTA','PONTO_DE_ENCONTRO')),
 ADD COLUMN IF NOT EXISTS destination_location_type text CHECK (destination_location_type IN ('PATIO','PORTA','PONTO_DE_ENCONTRO'));
COMMIT;
