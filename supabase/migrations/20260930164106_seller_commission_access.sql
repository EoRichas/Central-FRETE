BEGIN;
-- The prior application default was 7%. Existing sale snapshots remain unchanged.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS commission_basis_points integer NOT NULL DEFAULT 700 CHECK (commission_basis_points BETWEEN 0 AND 10000);
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS seller_id text REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS seller_name text;
ALTER TABLE public.fleet_freights ADD COLUMN IF NOT EXISTS seller_commission_basis_points integer NOT NULL DEFAULT 0 CHECK (seller_commission_basis_points BETWEEN 0 AND 10000);
-- Recover unambiguous legacy commercial owners without granting access to homonyms.
UPDATE public.freight_sales s SET seller_id=u.id FROM public.users u
WHERE s.seller_id IS NULL AND u.role='VENDEDOR' AND upper(trim(s.seller_name))=upper(trim(u.name))
 AND (SELECT count(*) FROM public.users x WHERE x.role='VENDEDOR' AND upper(trim(x.name))=upper(trim(s.seller_name)))=1;
-- Link historical records only through recorded IDs, never ambiguous names.
UPDATE public.fleet_freights f SET seller_id=s.seller_id, seller_name=s.seller_name,
 seller_commission_basis_points=s.commission_basis_points
FROM public.freight_sales s WHERE s.fleet_freight_id=f.id AND s.sale_channel='FROTA' AND f.seller_name IS NULL;
UPDATE public.fleet_freights f SET seller_id=u.id,seller_name=u.name
FROM public.users u WHERE f.created_by=u.id AND u.role='VENDEDOR' AND f.seller_name IS NULL;
CREATE INDEX IF NOT EXISTS fleet_freights_seller_id_idx ON public.fleet_freights(seller_id);
CREATE INDEX IF NOT EXISTS freight_sales_created_by_idx ON public.freight_sales(created_by);
CREATE INDEX IF NOT EXISTS fleet_freights_created_by_idx ON public.fleet_freights(created_by);
COMMIT;
