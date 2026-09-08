BEGIN;

SELECT pg_advisory_xact_lock(hashtext('central-frete-schema-v4-operational-role'));

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('ADMIN', 'GERENCIA', 'VENDEDOR', 'FINANCEIRO', 'OPERACIONAL'));

COMMIT;
