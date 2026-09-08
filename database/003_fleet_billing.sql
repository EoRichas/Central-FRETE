BEGIN;
SELECT pg_advisory_xact_lock(hashtext('central-frete-fleet-billing-v1'));
ALTER TABLE public.fleet_drivers ADD COLUMN IF NOT EXISTS cpf text CHECK (cpf ~ '^[0-9]{11}$');
ALTER TABLE public.fleet_drivers ADD COLUMN IF NOT EXISTS address text;
ALTER TABLE public.fleet_drivers ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.fleet_drivers ADD COLUMN IF NOT EXISTS vehicle_id text REFERENCES public.fleet_vehicles(id) ON DELETE RESTRICT;
DROP INDEX IF EXISTS public.fleet_drivers_name_unique;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_cpf_unique ON public.fleet_drivers(cpf);
CREATE INDEX IF NOT EXISTS fleet_drivers_vehicle_idx ON public.fleet_drivers(vehicle_id);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'EM_ABERTO' CHECK (payment_status IN ('EM_ABERTO','PAGO'));
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS origin_cep text;
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS destination_cep text;
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS paid_at text;
CREATE TABLE IF NOT EXISTS public.fleet_attachments (
 id text PRIMARY KEY, freight_id text NOT NULL REFERENCES public.fleet_freights(id) ON DELETE RESTRICT,
 storage_key text NOT NULL UNIQUE, file_name text NOT NULL, size_bytes bigint NOT NULL,
 uploaded_by text REFERENCES public.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_attachments_freight_idx ON public.fleet_attachments(freight_id);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS proof_attachment_id text REFERENCES public.fleet_attachments(id) ON DELETE RESTRICT;
ALTER TABLE public.freight_costs ADD COLUMN IF NOT EXISTS proof_attachment_id text REFERENCES public.sale_attachments(id) ON DELETE RESTRICT;
CREATE TABLE IF NOT EXISTS public.billing_periods (
 company_id text NOT NULL, competency text NOT NULL CHECK (competency ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 amount_cents integer NOT NULL DEFAULT 14999 CHECK (amount_cents = 14999),
 external_reference text NOT NULL UNIQUE, preference_id text, checkout_url text,
 license_key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(company_id, competency)
);
CREATE TABLE IF NOT EXISTS public.billing_payments (
 payment_id text PRIMARY KEY, company_id text NOT NULL, competency text NOT NULL,
 status text NOT NULL, approved_at text, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id, competency) REFERENCES public.billing_periods(company_id, competency)
);
CREATE TABLE IF NOT EXISTS public.billing_email_outbox (
 id text PRIMARY KEY, company_id text NOT NULL, competency text NOT NULL,
 sent_at timestamptz, claimed_until timestamptz, attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(company_id, competency) REFERENCES public.billing_periods(company_id, competency)
);
ALTER TABLE public.fleet_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleet_attachments, public.billing_periods, public.billing_payments, public.billing_email_outbox FROM anon, authenticated;
COMMIT;
