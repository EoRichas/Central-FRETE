BEGIN;
SET LOCAL lock_timeout = '10s';
SELECT pg_advisory_xact_lock(hashtext('central-frete-sales-v2'));
LOCK TABLE public.freight_sales, public.fleet_freights IN EXCLUSIVE MODE;
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS sale_number text;
DROP TRIGGER IF EXISTS fleet_freight_number ON public.fleet_freights;
DO $$
DECLARE freight record; assigned_number text;
BEGIN
 FOR freight IN SELECT f.id FROM public.fleet_freights f WHERE f.sale_number IS NULL ORDER BY f.pickup_date,f.created_at,f.id LOOP
  SELECT s.sale_number INTO assigned_number FROM public.freight_sales s WHERE s.fleet_freight_id=freight.id;
  IF assigned_number IS NULL THEN
   UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1 RETURNING last_value::text INTO assigned_number;
  END IF;
  IF assigned_number IS NULL THEN RAISE EXCEPTION 'Contador global não inicializado.'; END IF;
  UPDATE public.fleet_freights SET sale_number=assigned_number WHERE id=freight.id;
  INSERT INTO public.audit_logs(id,entity_type,entity_id,action,actor_email,new_value)
   VALUES(gen_random_uuid()::text,'FLEET_FREIGHT',freight.id,'SALE_NUMBER_ASSIGNED','migration:015',jsonb_build_object('saleNumber',assigned_number)::text);
 END LOOP;
END $$;
ALTER TABLE public.fleet_freights ALTER COLUMN sale_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_freight_number_unique ON public.fleet_freights(sale_number);
CREATE OR REPLACE FUNCTION public.assign_fleet_freight_number() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.sale_number IS NOT NULL THEN RAISE EXCEPTION 'O número da venda é gerado automaticamente.' USING ERRCODE='23514'; END IF;
 UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1 RETURNING last_value::text INTO NEW.sale_number;
 IF NEW.sale_number IS NULL THEN RAISE EXCEPTION 'Contador global não inicializado.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fleet_freight_number BEFORE INSERT OR UPDATE OF sale_number ON public.fleet_freights FOR EACH ROW EXECUTE FUNCTION public.assign_fleet_freight_number();
REVOKE ALL ON FUNCTION public.assign_fleet_freight_number() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.assign_sale_number() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE freight_number text;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.sale_number IS DISTINCT FROM OLD.sale_number THEN RAISE EXCEPTION 'O número da venda não pode ser alterado.' USING ERRCODE='23514'; END IF;
  IF NEW.fleet_freight_id IS NOT DISTINCT FROM OLD.fleet_freight_id OR NEW.fleet_freight_id IS NULL THEN RETURN NEW; END IF;
 ELSE
  IF NEW.sale_number IS NOT NULL THEN RAISE EXCEPTION 'O número da venda é gerado automaticamente.' USING ERRCODE='23514'; END IF;
 END IF;
 IF NEW.fleet_freight_id IS NOT NULL THEN
  SELECT sale_number INTO freight_number FROM public.fleet_freights WHERE id=NEW.fleet_freight_id FOR UPDATE;
  IF freight_number IS NULL THEN RAISE EXCEPTION 'Frete da frota não encontrado.' USING ERRCODE='23514'; END IF;
  IF TG_OP='UPDATE' AND NEW.sale_number IS DISTINCT FROM freight_number THEN
   RAISE EXCEPTION 'Esta venda e o frete possuem números diferentes. O vínculo não pode alterar a numeração.' USING ERRCODE='23514';
  END IF;
  NEW.sale_number:=freight_number;
 ELSIF TG_OP='INSERT' THEN
  UPDATE public.global_sale_number_counter SET last_value=last_value+1 WHERE id=1 RETURNING last_value::text INTO NEW.sale_number;
  IF NEW.sale_number IS NULL THEN RAISE EXCEPTION 'Contador global não inicializado.'; END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS freight_sale_number ON public.freight_sales;
CREATE TRIGGER freight_sale_number BEFORE INSERT OR UPDATE OF sale_number,fleet_freight_id ON public.freight_sales FOR EACH ROW EXECUTE FUNCTION public.assign_sale_number();
REVOKE ALL ON FUNCTION public.assign_sale_number() FROM PUBLIC;

ALTER TABLE public.service_orders ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS fleet_freight_id text REFERENCES public.fleet_freights(id);
CREATE UNIQUE INDEX IF NOT EXISTS service_orders_fleet_unique ON public.service_orders(fleet_freight_id);
ALTER TABLE public.service_orders DROP CONSTRAINT IF EXISTS service_order_single_owner;
ALTER TABLE public.service_orders ADD CONSTRAINT service_order_single_owner CHECK ((sale_id IS NOT NULL)::int + (fleet_freight_id IS NOT NULL)::int = 1);
-- A newly linked commercial sale inherits the existing document and history.
CREATE OR REPLACE FUNCTION public.adopt_fleet_service_order() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
BEGIN
 IF NEW.fleet_freight_id IS NOT NULL THEN
  WITH adopted AS (
   UPDATE public.service_orders SET sale_id=NEW.id,fleet_freight_id=null WHERE fleet_freight_id=NEW.fleet_freight_id RETURNING id
  ) INSERT INTO public.audit_logs(id,entity_type,entity_id,action,actor_email,new_value)
   SELECT gen_random_uuid()::text,'SERVICE_ORDER',id,'FLEET_SALE_LINKED','trigger:fleet-sale-link',jsonb_build_object('saleId',NEW.id,'fleetFreightId',NEW.fleet_freight_id)::text FROM adopted;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS adopt_fleet_order ON public.freight_sales;
CREATE TRIGGER adopt_fleet_order AFTER INSERT OR UPDATE OF fleet_freight_id ON public.freight_sales FOR EACH ROW EXECUTE FUNCTION public.adopt_fleet_service_order();
REVOKE ALL ON FUNCTION public.adopt_fleet_service_order() FROM PUBLIC;
COMMIT;
