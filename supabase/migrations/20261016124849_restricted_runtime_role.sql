BEGIN;

-- Backend-only role. Credentials are provisioned separately, never in migrations.
-- Existing application connections continue to work during the staged rollout.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'central_app') THEN
    CREATE ROLE central_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='central_app'
    AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit OR rolreplication OR rolbypassrls)) THEN
    RAISE EXCEPTION 'central_app already exists with incompatible privileges';
  END IF;
END $$;
ALTER ROLE central_app SET search_path = public, pg_catalog;
ALTER ROLE central_app SET statement_timeout = '15s';
ALTER ROLE central_app SET lock_timeout = '5s';
ALTER ROLE central_app SET idle_in_transaction_session_timeout = '10s';
GRANT USAGE ON SCHEMA public TO central_app;

-- Explicit allowlist: new tables must be reviewed before runtime access is added.
-- This application authorizes users in its server, not through Supabase Auth.
-- No policy or membership is granted to anon, authenticated or authenticator.
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'auth_login_limits', 'auth_sessions', 'billing_email_outbox',
    'billing_payments', 'billing_periods', 'client_addresses', 'client_contacts',
    'clients', 'company_monthly_closings', 'company_monthly_entries',
    'financial_accounts', 'fleet_attachments', 'fleet_drivers', 'fleet_freights',
    'fleet_settings', 'fleet_trips', 'fleet_vehicle_costs', 'fleet_vehicles',
    'freight_costs', 'freight_sales',
    'global_sale_number_counter', 'import_runs', 'payment_transactions',
    'providers', 'receivable_installments', 'sale_attachments',
    'sale_number_counters', 'seller_commission_statuses', 'seller_payment_profiles',
    'service_order_versions', 'service_orders', 'storage_cleanup_jobs', 'users'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO central_app', table_name);
    EXECUTE format('DROP POLICY IF EXISTS central_backend_access ON public.%I', table_name);
    EXECUTE format('CREATE POLICY central_backend_access ON public.%I TO central_app USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;

-- Audit events can be read/appended, but not rewritten or removed by runtime.
GRANT SELECT, INSERT ON public.audit_logs TO central_app;
DROP POLICY IF EXISTS central_backend_audit_read ON public.audit_logs;
CREATE POLICY central_backend_audit_read ON public.audit_logs FOR SELECT TO central_app USING (true);
DROP POLICY IF EXISTS central_backend_audit_append ON public.audit_logs;
CREATE POLICY central_backend_audit_append ON public.audit_logs FOR INSERT TO central_app WITH CHECK (true);

-- No DDL, TRUNCATE, ownership, schema-migration ledger, auth or storage grants.
COMMENT ON ROLE central_app IS 'Central backend runtime; no login until credential rollout; user authorization remains in the application.';
COMMIT;
