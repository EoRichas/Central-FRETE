BEGIN;
-- Additive, nullable for historical sales. No status is inferred or overwritten.
ALTER TABLE fleet_freights ADD COLUMN IF NOT EXISTS service_situation text
  CHECK (service_situation IN ('RETIRA','ENTREGA','EMBARQUE'));
ALTER TABLE freight_sales ADD COLUMN IF NOT EXISTS service_situation text
  CHECK (service_situation IN ('RETIRA','ENTREGA','EMBARQUE'));
COMMIT;
