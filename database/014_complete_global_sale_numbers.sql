BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('central-frete-sales-v2'));
LOCK TABLE public.freight_sales IN EXCLUSIVE MODE;

-- Keep numbers already assigned by the global sequence. Convert every remaining
-- legacy identifier, including sales with issued service orders, in date order.
-- Issued service_order_versions and related records are never rewritten.
INSERT INTO public.global_sale_number_counter(id,last_value)
 SELECT 1,greatest(200,coalesce(max(CASE
   WHEN sale_number ~ '^[1-9][0-9]*$' THEN sale_number::numeric
   ELSE 0 END),0)) FROM public.freight_sales
 ON CONFLICT(id) DO UPDATE SET last_value=greatest(global_sale_number_counter.last_value,excluded.last_value);

DROP TRIGGER IF EXISTS freight_sale_number ON public.freight_sales;
DO $$
DECLARE sale_record record; next_number bigint;
BEGIN
 FOR sale_record IN SELECT id,sale_number,sale_channel FROM public.freight_sales
  WHERE NOT CASE WHEN sale_number ~ '^[1-9][0-9]*$'
    THEN sale_number::numeric >= 201 ELSE false END
  ORDER BY sale_date,created_at,id
 LOOP
  UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1
   RETURNING last_value INTO next_number;
  UPDATE public.freight_sales SET sale_number=next_number::text WHERE id=sale_record.id;
  INSERT INTO public.audit_logs(id,entity_type,entity_id,action,actor_email,previous_value,new_value)
   VALUES(gen_random_uuid()::text,'FREIGHT_SALE',sale_record.id,'SALE_RENUMBERED','migration:014',
    jsonb_build_object('saleNumber',sale_record.sale_number,'saleChannel',sale_record.sale_channel)::text,
    jsonb_build_object('saleNumber',next_number::text,'saleChannel',sale_record.sale_channel)::text);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.assign_sale_number() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE sequence_value bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN
   RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.sale_number IS NOT NULL THEN
  RAISE EXCEPTION 'O número da venda é gerado automaticamente.' USING ERRCODE='23514';
 END IF;
 UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1
  RETURNING last_value INTO sequence_value;
 IF sequence_value IS NULL THEN RAISE EXCEPTION 'Contador global não inicializado.'; END IF;
 NEW.sale_number:=sequence_value::text;
 RETURN NEW;
END $$;
CREATE TRIGGER freight_sale_number BEFORE INSERT OR UPDATE OF sale_number ON public.freight_sales
 FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();
REVOKE ALL ON FUNCTION public.assign_sale_number() FROM PUBLIC;
COMMIT;
