BEGIN;
SET LOCAL lock_timeout = '5s';
SELECT pg_advisory_xact_lock(hashtext('central-frete-operation-integrity-v1'));
ALTER TABLE public.fleet_freights
 ADD COLUMN IF NOT EXISTS route_distance_meters bigint CHECK (route_distance_meters BETWEEN 0 AND 100000000),
 ADD COLUMN IF NOT EXISTS odometer_start_meters bigint CHECK (odometer_start_meters BETWEEN 0 AND 1000000000000),
 ADD COLUMN IF NOT EXISTS odometer_end_meters bigint CHECK (odometer_end_meters BETWEEN 0 AND 1000000000000);
ALTER TABLE public.fleet_freights DROP CONSTRAINT IF EXISTS fleet_freights_odometer_check;
ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freights_odometer_check CHECK (
 odometer_start_meters IS NULL OR odometer_end_meters IS NULL OR
 (odometer_end_meters >= odometer_start_meters AND distance_meters = odometer_end_meters - odometer_start_meters AND distance_meters <= 100000000));
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS destination_location_type text
 CHECK (destination_location_type IN ('PATIO','PORTA','PONTO_DE_ENCONTRO'));
ALTER TABLE public.fleet_settings ALTER COLUMN match_window_days SET DEFAULT 0;
-- Keep historical columns and all vehicle cost rows intact.
ALTER TABLE public.freight_sales DROP CONSTRAINT IF EXISTS freight_sales_fleet_freight_id_fkey;
ALTER TABLE public.freight_sales ADD CONSTRAINT freight_sales_fleet_freight_id_fkey FOREIGN KEY(fleet_freight_id) REFERENCES public.fleet_freights(id) ON DELETE SET NULL;
ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_orders_sale_id_fkey;
ALTER TABLE public.service_orders ADD CONSTRAINT service_orders_sale_id_fkey FOREIGN KEY(sale_id) REFERENCES public.freight_sales(id) ON DELETE CASCADE;
ALTER TABLE public.service_order_versions DROP CONSTRAINT IF EXISTS service_order_versions_order_id_fkey;
ALTER TABLE public.service_order_versions ADD CONSTRAINT service_order_versions_order_id_fkey FOREIGN KEY(order_id) REFERENCES public.service_orders(id) ON DELETE CASCADE;
ALTER TABLE public.fleet_freights DROP CONSTRAINT IF EXISTS fleet_freights_proof_attachment_id_fkey;
ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freights_proof_attachment_id_fkey FOREIGN KEY(proof_attachment_id) REFERENCES public.fleet_attachments(id) ON DELETE SET NULL;
ALTER TABLE public.fleet_attachments DROP CONSTRAINT IF EXISTS fleet_attachments_freight_id_fkey;
ALTER TABLE public.fleet_attachments ADD CONSTRAINT fleet_attachments_freight_id_fkey FOREIGN KEY(freight_id) REFERENCES public.fleet_freights(id) ON DELETE CASCADE;

-- Durable outbox: database deletion and cleanup scheduling commit together.
CREATE TABLE IF NOT EXISTS public.storage_cleanup_jobs (
 storage_key text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0, last_attempt_at timestamptz
);
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.storage_cleanup_jobs FROM anon, authenticated;
CREATE OR REPLACE FUNCTION public.queue_deleted_proof() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE object_key text;
BEGIN
 IF TG_TABLE_NAME = 'payment_transactions' THEN object_key := OLD.proof_key;
 ELSE object_key := OLD.storage_key; END IF;
 IF object_key IS NOT NULL THEN
  INSERT INTO public.storage_cleanup_jobs(storage_key) VALUES(object_key) ON CONFLICT DO NOTHING;
 END IF;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.queue_deleted_proof() FROM PUBLIC;
DROP TRIGGER IF EXISTS queue_deleted_proof ON public.sale_attachments;
CREATE TRIGGER queue_deleted_proof AFTER DELETE ON public.sale_attachments FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_proof();
DROP TRIGGER IF EXISTS queue_deleted_proof ON public.fleet_attachments;
CREATE TRIGGER queue_deleted_proof AFTER DELETE ON public.fleet_attachments FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_proof();
DROP TRIGGER IF EXISTS queue_deleted_proof ON public.payment_transactions;
CREATE TRIGGER queue_deleted_proof AFTER DELETE ON public.payment_transactions FOR EACH ROW EXECUTE FUNCTION public.queue_deleted_proof();
-- Detaching a sale preserves the cargo it displayed immediately before deletion.
CREATE OR REPLACE FUNCTION public.preserve_detached_sale_cargo() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 UPDATE public.freight_sales SET cargo_vehicles=coalesce(OLD.cargo_vehicles,jsonb_build_array(jsonb_build_object('model',OLD.cargo_vehicle_model,'plate',OLD.cargo_plate,'identification',null))),
 vehicle=OLD.cargo_vehicle_model,plate=OLD.cargo_plate WHERE fleet_freight_id=OLD.id;
 RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.preserve_detached_sale_cargo() FROM PUBLIC;
DROP TRIGGER IF EXISTS preserve_detached_sale_cargo ON public.fleet_freights;
CREATE TRIGGER preserve_detached_sale_cargo BEFORE DELETE ON public.fleet_freights FOR EACH ROW EXECUTE FUNCTION public.preserve_detached_sale_cargo();
COMMIT;
