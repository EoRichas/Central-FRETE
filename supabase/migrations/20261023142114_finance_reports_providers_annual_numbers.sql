BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(hashtext('central-frete-finance-reports-20261023'));
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS provider_services jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(provider_services)='array' AND jsonb_array_length(provider_services)<=30);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS return_freight boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.sale_commission_payments (
 source_kind text NOT NULL CHECK(source_kind IN ('sale','freight')),source_id text NOT NULL,
 status text NOT NULL DEFAULT 'EM_ABERTO' CHECK(status IN ('EM_ABERTO','PAGO')),
 paid_at text,paid_by text REFERENCES public.users(id) ON DELETE SET NULL,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(source_kind,source_id)
);
-- Preserve previously recorded settlements. Later changes address one sale.
INSERT INTO public.sale_commission_payments(source_kind,source_id,status,paid_at,paid_by)
 SELECT s.kind,s.id,cs.status,cs.paid_at,cs.paid_by FROM (
  SELECT 'sale'::text AS kind,id,seller_name,competency FROM public.freight_sales WHERE NOT(sale_channel='FROTA' AND fleet_freight_id IS NOT NULL)
  UNION ALL SELECT 'freight',id,seller_name,left(pickup_date,7) FROM public.fleet_freights
 ) s JOIN public.seller_commission_statuses cs ON cs.seller_name=upper(s.seller_name) AND cs.competency=s.competency ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS public.finance_payment_batches (
 id text PRIMARY KEY,actor_user_id text NOT NULL REFERENCES public.users(id),fingerprint text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.annual_sale_number_counters (
 year integer PRIMARY KEY CHECK(year BETWEEN 2027 AND 9999),last_value bigint NOT NULL CHECK(last_value BETWEEN 1 AND 9007199254740000)
);
-- Seed any already issued annual identifier, without changing it.
INSERT INTO public.annual_sale_number_counters(year,last_value)
 SELECT split_part(sale_number,'-',1)::integer,max(split_part(sale_number,'-',2)::bigint) FROM (
  SELECT sale_number FROM public.freight_sales UNION ALL SELECT sale_number FROM public.fleet_freights
 ) numbered WHERE sale_number ~ '^[0-9]{4}-[0-9]+$' AND split_part(sale_number,'-',1)::integer>=2027 AND split_part(sale_number,'-',2)::bigint>0
 GROUP BY split_part(sale_number,'-',1)::integer
 ON CONFLICT(year) DO UPDATE SET last_value=greatest(annual_sale_number_counters.last_value,excluded.last_value);
-- Existing identifiers stay immutable. First annual reset: January 2027.
CREATE OR REPLACE FUNCTION public.reserve_sale_number_for_year(number_year integer) RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE allocated bigint;
BEGIN
 IF number_year NOT BETWEEN 2026 AND 9999 THEN RAISE EXCEPTION 'Ano de numeração inválido.' USING ERRCODE='23514'; END IF;
 IF number_year=2026 THEN
  UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1 RETURNING last_value INTO allocated;
  IF allocated IS NULL THEN RAISE EXCEPTION 'Contador global não inicializado.'; END IF;
  RETURN allocated::text;
 END IF;
 INSERT INTO public.annual_sale_number_counters(year,last_value) VALUES(number_year,1)
 ON CONFLICT(year) DO UPDATE SET last_value=annual_sale_number_counters.last_value+1 RETURNING last_value INTO allocated;
 RETURN number_year::text||'-'||allocated::text;
END $$;
REVOKE ALL ON FUNCTION public.reserve_sale_number_for_year(integer) FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.assign_fleet_freight_number() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.sale_number IS NOT NULL THEN RAISE EXCEPTION 'O número da venda é gerado automaticamente.' USING ERRCODE='23514'; END IF;
 NEW.sale_number:=public.reserve_sale_number_for_year(extract(year from current_timestamp at time zone 'America/Sao_Paulo')::integer);
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.assign_sale_number() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE freight_number text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514'; END IF;
  IF NEW.fleet_freight_id IS NOT DISTINCT FROM OLD.fleet_freight_id OR NEW.fleet_freight_id IS NULL THEN RETURN NEW; END IF;
 ELSIF NEW.sale_number IS NOT NULL THEN RAISE EXCEPTION 'O número da venda é gerado automaticamente.' USING ERRCODE='23514';
 END IF;
 IF NEW.fleet_freight_id IS NOT NULL THEN
  SELECT sale_number INTO freight_number FROM public.fleet_freights WHERE id=NEW.fleet_freight_id FOR UPDATE;
  IF freight_number IS NULL THEN RAISE EXCEPTION 'Frete da frota não encontrado.' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.sale_number IS DISTINCT FROM freight_number THEN RAISE EXCEPTION 'Esta venda e o frete possuem números diferentes. O vínculo não pode alterar a numeração.' USING ERRCODE='23514'; END IF;
  NEW.sale_number:=freight_number;
 ELSIF TG_OP='INSERT' THEN
  NEW.sale_number:=public.reserve_sale_number_for_year(extract(year from current_timestamp at time zone 'America/Sao_Paulo')::integer);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.assign_sale_number(),public.assign_fleet_freight_number() FROM PUBLIC;
ALTER TABLE public.sale_commission_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.annual_sale_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sale_commission_payments,public.finance_payment_batches,public.annual_sale_number_counters FROM anon,authenticated;
DO $$DECLARE table_name text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='central_app') THEN
  FOREACH table_name IN ARRAY ARRAY['sale_commission_payments','finance_payment_batches','annual_sale_number_counters'] LOOP
   EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO central_app',table_name);
   EXECUTE format('DROP POLICY IF EXISTS central_backend_access ON public.%I',table_name);
   EXECUTE format('CREATE POLICY central_backend_access ON public.%I TO central_app USING(true) WITH CHECK(true)',table_name);
  END LOOP;
  GRANT SELECT(provider_services,return_freight),UPDATE(provider_services,return_freight) ON public.fleet_freights TO central_app;
  GRANT EXECUTE ON FUNCTION public.reserve_sale_number_for_year(integer),public.assign_sale_number(),public.assign_fleet_freight_number() TO central_app;
 END IF;
END $$;
COMMIT;
