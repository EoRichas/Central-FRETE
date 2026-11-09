BEGIN;
SET LOCAL lock_timeout = '5s';

-- A date chosen by the operator never replaces the actual audit timestamp.
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS report_creation_date date;
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS report_creation_date date;

COMMIT;
