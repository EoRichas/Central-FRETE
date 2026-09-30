BEGIN;
ALTER TABLE public.company_monthly_entries DROP CONSTRAINT IF EXISTS company_monthly_entries_scope_check;
ALTER TABLE public.company_monthly_entries ADD CONSTRAINT company_monthly_entries_scope_check CHECK (scope IN ('GENERAL','FROTA','CEGONHA'));
ALTER TABLE public.company_monthly_closings DROP CONSTRAINT IF EXISTS company_monthly_closings_scope_check;
ALTER TABLE public.company_monthly_closings ADD CONSTRAINT company_monthly_closings_scope_check CHECK (scope IN ('GENERAL','FROTA','CEGONHA'));
COMMIT;
