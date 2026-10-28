BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(hashtext('central-driver-commission-payments-20261028'));
ALTER TABLE public.fleet_drivers ADD COLUMN IF NOT EXISTS pix_details text CHECK(length(pix_details)<=2000);
CREATE TABLE IF NOT EXISTS public.driver_commission_payments (
 freight_id text PRIMARY KEY REFERENCES public.fleet_freights(id) ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'EM_ABERTO' CHECK(status IN ('EM_ABERTO','PAGO')),
 paid_at text,paid_by text REFERENCES public.users(id) ON DELETE SET NULL,
 pix_details text CHECK(length(pix_details)<=2000),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='EM_ABERTO' AND paid_at IS NULL AND paid_by IS NULL) OR (status='PAGO' AND paid_at IS NOT NULL))
);
ALTER TABLE public.driver_commission_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_commission_payments FROM PUBLIC,anon,authenticated;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='central_app') THEN
  GRANT SELECT,INSERT,UPDATE,DELETE ON public.driver_commission_payments TO central_app;
  DROP POLICY IF EXISTS central_backend_access ON public.driver_commission_payments;
  CREATE POLICY central_backend_access ON public.driver_commission_payments TO central_app USING(true) WITH CHECK(true);
  GRANT SELECT(pix_details),UPDATE(pix_details) ON public.fleet_drivers TO central_app;
 END IF;
END $$;
COMMIT;
