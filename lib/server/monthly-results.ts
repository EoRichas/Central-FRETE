import type { MonthlyClosing, MonthlySource } from '@/lib/domain/fleet-results';
import { queryAll, queryFirst } from '@/lib/server/d1';

// One statement supplies a consistent snapshot, also used inside the closing INSERT.
export const MONTHLY_SOURCE_SQL = `with month as (select ?::text as competency),
trip_members as (select id,trip_id,actual_fuel_cost_cents,
 count(*) over(partition by trip_id) as members,
 row_number() over(partition by trip_id order by id COLLATE "C") as position
 from fleet_freights where trip_id is not null)
select jsonb_build_object(
 'competency', m.competency,
 'freights', coalesce((select jsonb_agg(jsonb_build_object(
   'id', f.id, 'client', f.client_name, 'revenueCents', f.freight_amount_cents,
   'directCostCents', f.driver_commission_cents + f.yard_cost_cents + f.pickup_cost_cents + f.delivery_cost_cents + f.other_cost_cents,
   'standaloneCostCents', case when f.trip_id is null then coalesce(f.actual_fuel_cost_cents,0) + f.toll_cents else 0 end,
   'fuelPending', f.trip_id is null and f.actual_fuel_cost_cents is null
 ) order by f.id) from fleet_freights f where left(f.billing_date,7)=m.competency), '[]'::jsonb),
 'trips', coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,
   'costCents',coalesce((select sum(coalesce(f.actual_fuel_cost_cents,
 t.fuel_cost_cents / f.members + case when f.position <= mod(t.fuel_cost_cents,f.members) then 1 else 0 end))
 from trip_members f where f.trip_id=t.id),t.fuel_cost_cents)+t.toll_cents+t.other_cost_cents) order by t.id)
   from fleet_trips t where left(t.operation_date,7)=m.competency), '[]'::jsonb),
 'entries', coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,
   'description',e.description,'amountCents',e.amount_cents) order by e.id)
   from company_monthly_entries e where e.competency=m.competency),'[]'::jsonb),
 'unbilledCount', (select count(*) from fleet_freights f where left(f.pickup_date,7)=m.competency and f.billing_date is null)
) as snapshot from month m`;

export async function loadMonthlyReport(competency: string) {
  const [source, history] = await Promise.all([
    queryFirst<{ snapshot: MonthlySource }>(MONTHLY_SOURCE_SQL, [competency]),
    queryAll<MonthlyClosing>(`select c.id,c.competency,c.snapshot,c.closed_at as closedAt,
      u.name as closedByName,c.reopened_at as reopenedAt,c.reopen_reason as reopenReason
      from company_monthly_closings c join users u on u.id=c.closed_by
      where c.competency=? order by c.closed_at desc,c.id`, [competency]),
  ]);
  if (!source) throw new Error('Não foi possível apurar a competência.');
  return { current: source.snapshot, history };
}
