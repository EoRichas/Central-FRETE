BEGIN;
SET LOCAL lock_timeout='10s';
SELECT pg_advisory_xact_lock(hashtext('central-fleet-awaiting-embark-status-20261030'));
-- Keep every historical value; extend the allowed operational states only.
ALTER TABLE public.fleet_freights DROP CONSTRAINT IF EXISTS fleet_freights_operational_status_check;
ALTER TABLE public.fleet_freights ADD CONSTRAINT fleet_freights_operational_status_check CHECK (
 operational_status IN ('SEM_PREVISAO','COLETA_AGENDADA','EM_ROTA','NO_PATIO',
 'AGUARDANDO_CARGA','AGUARDANDO_EMBARQUE','ENTREGUE','FATURADO','COLETA_FRUSTRADA')
);
COMMIT;
