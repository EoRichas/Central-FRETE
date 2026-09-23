BEGIN;
SELECT pg_advisory_xact_lock(hashtext('central-frete-sale-origin-location-v1'));

ALTER TABLE public.freight_sales
  ADD COLUMN IF NOT EXISTS origin_location_type text
  CHECK (origin_location_type IN ('PATIO', 'PORTA', 'PONTO_DE_ENCONTRO'));

COMMIT;
