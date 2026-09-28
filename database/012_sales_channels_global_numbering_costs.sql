BEGIN;
SELECT pg_advisory_xact_lock(hashtext('central-frete-sales-v2'));
LOCK TABLE public.freight_sales IN EXCLUSIVE MODE;
ALTER TABLE public.freight_sales ADD COLUMN IF NOT EXISTS sale_channel text NOT NULL DEFAULT 'CEGONHA'
 CHECK (sale_channel IN ('CEGONHA','FROTA'));
CREATE INDEX IF NOT EXISTS freight_sales_channel_competency_idx ON public.freight_sales(sale_channel,competency);
CREATE TABLE IF NOT EXISTS public.global_sale_number_counter (
 id integer PRIMARY KEY CHECK(id=1), last_value bigint NOT NULL CHECK(last_value BETWEEN 200 AND 9007199254740000)
);
INSERT INTO public.global_sale_number_counter(id,last_value)
 SELECT 1,greatest(200,coalesce(max(sale_number::numeric),0)) FROM public.freight_sales WHERE sale_number ~ '^[0-9]+$'
 ON CONFLICT(id) DO UPDATE SET last_value=greatest(global_sale_number_counter.last_value,excluded.last_value);
-- Only unissued annual sales are converted. Issued identifiers and snapshots stay intact.
DROP TRIGGER IF EXISTS freight_sale_number ON public.freight_sales;
DO $$
DECLARE sale_record record; next_number bigint;
BEGIN
 FOR sale_record IN SELECT s.id,s.sale_number FROM public.freight_sales s
  WHERE s.sale_number ~ '^[0-9]{4}-[0-9]+$' AND NOT EXISTS (
   SELECT 1 FROM public.service_orders o JOIN public.service_order_versions v ON v.order_id=o.id WHERE o.sale_id=s.id)
  ORDER BY s.sale_date,s.created_at,s.id
 LOOP
  UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1 RETURNING last_value INTO next_number;
  UPDATE public.freight_sales SET sale_number=next_number::text WHERE id=sale_record.id;
  INSERT INTO public.audit_logs(id,entity_type,entity_id,action,actor_email,previous_value,new_value)
  VALUES(gen_random_uuid()::text,'FREIGHT_SALE',sale_record.id,'SALE_RENUMBERED','migration:012',
   jsonb_build_object('saleNumber',sale_record.sale_number)::text,jsonb_build_object('saleNumber',next_number::text)::text);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.assign_sale_number() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sequence_value bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.sale_number IS NULL THEN
  UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1 RETURNING last_value INTO sequence_value;
  IF sequence_value IS NULL THEN RAISE EXCEPTION 'Contador global não inicializado.'; END IF;
  NEW.sale_number:=sequence_value::text;
 ELSIF NEW.sale_number ~ '^[0-9]+$' THEN
  -- Explicit identifiers remain available only for the existing administrative import.
  UPDATE public.global_sale_number_counter SET last_value=greatest(last_value,NEW.sale_number::bigint) WHERE id=1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER freight_sale_number BEFORE INSERT OR UPDATE OF sale_number ON public.freight_sales FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();
ALTER TABLE public.global_sale_number_counter ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.global_sale_number_counter FROM anon,authenticated;
REVOKE ALL ON FUNCTION public.assign_sale_number() FROM PUBLIC;

-- Preserve recorded confirmation of legacy CTE/MDF amounts. No invented historical split.
UPDATE public.freight_costs SET confirmed=1 WHERE category IN ('NOTA_FISCAL_IMPOSTO','SEGURO_ALLIANZ','ICMS');
UPDATE public.freight_costs SET payment_status=CASE WHEN confirmed=1 THEN 'PAGO' ELSE 'EM_ABERTO' END;
UPDATE public.freight_sales s SET costs_pending=CASE WHEN EXISTS(SELECT 1 FROM public.freight_costs c WHERE c.sale_id=s.id AND c.confirmed=0) THEN 1 ELSE 0 END;
CREATE OR REPLACE FUNCTION public.normalize_sale_cost_payment() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.category IN ('NOTA_FISCAL_IMPOSTO','SEGURO_ALLIANZ','ICMS') THEN
  NEW.confirmed:=1; NEW.payment_status:='PAGO';
 ELSIF TG_OP='UPDATE' AND NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NEW.payment_status IN ('PAGO','EM_ABERTO') THEN
  NEW.confirmed:=CASE WHEN NEW.payment_status='PAGO' THEN 1 ELSE 0 END;
 ELSE
  NEW.payment_status:=CASE WHEN NEW.confirmed=1 THEN 'PAGO' ELSE 'EM_ABERTO' END;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sale_cost_payment_status ON public.freight_costs;
CREATE TRIGGER sale_cost_payment_status BEFORE INSERT OR UPDATE ON public.freight_costs FOR EACH ROW EXECUTE FUNCTION public.normalize_sale_cost_payment();
REVOKE ALL ON FUNCTION public.normalize_sale_cost_payment() FROM PUBLIC;
COMMIT;
