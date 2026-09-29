BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('central-frete-results-v1'));
ALTER TABLE public.company_monthly_entries ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'GENERAL' CHECK (scope IN ('GENERAL','FROTA'));
ALTER TABLE public.company_monthly_closings ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'GENERAL' CHECK (scope IN ('GENERAL','FROTA'));
-- Preserve snapshot bytes. Only unequivocally fleet-only history can enter the fleet archive.
UPDATE public.company_monthly_closings c SET scope='FROTA'
WHERE scope='GENERAL'
  AND jsonb_array_length(coalesce(c.snapshot->'entries','[]'::jsonb))=0
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(c.snapshot->'sales','[]'::jsonb)) s WHERE coalesce(s->>'saleChannel','')<>'FROTA');
DROP INDEX IF EXISTS public.company_monthly_one_closed;
CREATE UNIQUE INDEX IF NOT EXISTS company_monthly_one_closed_scope ON public.company_monthly_closings(competency,scope) WHERE reopened_at IS NULL;
CREATE INDEX IF NOT EXISTS company_monthly_entries_scope_month ON public.company_monthly_entries(scope,competency);
COMMIT;
