BEGIN;
ALTER TABLE public.fleet_freights
  ADD COLUMN IF NOT EXISTS client_id text REFERENCES public.clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fleet_freights_client_id_idx ON public.fleet_freights(client_id);
-- Historical names remain untouched. Never infer an identity from a name.
COMMIT;
