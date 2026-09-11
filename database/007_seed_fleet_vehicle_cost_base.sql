-- Central Frete: restaura a Base mensal de custo/km da frota a partir da planilha operacional.
-- Idempotente: atualiza os mesmos pares placa/competência sem duplicar registros.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('central-frete-fleet-base-v1'));

WITH base(plate, competency, distance_meters, monthly_cost_cents, include_in_rate_average) AS (
  VALUES
    ('AZK1C05','2026-04',4948000,617413,1),('AZK1C05','2026-05',3193000,617413,1),('AZK1C05','2026-06',4698000,809110,1),
    ('BBE4769','2026-04',5601000,1011187,1),('BBE4769','2026-05',7929000,1044053,1),('BBE4769','2026-06',3721000,1073319,1),
    ('BDC3H60','2026-04',14345000,1054963,1),('BDC3H60','2026-05',9667000,1154584,1),('BDC3H60','2026-06',9702000,1232532,1),
    ('BEK3J88','2026-04',6178000,948860,1),('BEK3J88','2026-05',2934000,940460,1),('BEK3J88','2026-06',8247000,1002560,1),
    ('DCU2D79','2026-04',3010000,1352830,1),('DCU2D79','2026-05',5960000,1372171,1),('DCU2D79','2026-06',6065000,1272830,1),
    ('DTD5G90','2026-04',2545000,1341944,1),('DTD5G90','2026-05',2853000,1260832,1),('DTD5G90','2026-06',1350000,1260832,1),
    ('EVO8D37','2026-04',2817000,416920,1),('EVO8D37','2026-05',2563000,481999,1),('EVO8D37','2026-06',4179000,638299,1),
    ('FFN5J29','2026-03',4607000,1556010,1),('FFN5J29','2026-04',3283000,1627853,1),('FFN5J29','2026-05',1909000,1275153,1),
    ('FUT1D23','2026-04',4807000,1250351,1),('FUT1D23','2026-05',4192000,1292851,1),('FUT1D23','2026-06',5981000,1597637,1),
    ('HMV9G57','2026-04',1601000,986825,1),('HMV9G57','2026-05',7341000,928424,1),('HMV9G57','2026-06',6862000,985438,1),
    ('KOA6G16','2026-04',1015000,724824,1),('KOA6G16','2026-05',129000,488791,0),('KOA6G16','2026-06',1151000,848278,1),
    ('MKY8629','2026-04',2502000,328031,1),('MKY8629','2026-05',3023000,423360,1),('MKY8629','2026-06',4673000,647100,1),
    ('MME1A12','2026-04',9652000,916139,1),('MME1A12','2026-05',13386000,530518,1),('MME1A12','2026-06',2443000,244300,1)
)
INSERT INTO public.fleet_vehicle_costs (
  id,
  vehicle_id,
  competency,
  distance_meters,
  monthly_cost_cents,
  include_in_rate_average
)
SELECT
  'base-' || lower(v.plate) || '-' || replace(b.competency, '-', ''),
  v.id,
  b.competency,
  b.distance_meters,
  b.monthly_cost_cents,
  b.include_in_rate_average
FROM base b
JOIN public.fleet_vehicles v ON v.plate = b.plate
ON CONFLICT (vehicle_id, competency) DO UPDATE SET
  distance_meters = EXCLUDED.distance_meters,
  monthly_cost_cents = EXCLUDED.monthly_cost_cents,
  include_in_rate_average = EXCLUDED.include_in_rate_average,
  updated_at = to_char(timezone('UTC', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

COMMIT;
