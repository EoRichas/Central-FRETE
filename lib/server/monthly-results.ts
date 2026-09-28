import type { MonthlyClosing, MonthlySource, MonthlyReport } from '@/lib/domain/fleet-results';
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
   'directCostCents', f.driver_commission_cents + f.yard_cost_cents + f.pickup_cost_cents + f.delivery_cost_cents + f.other_cost_cents + f.insurance_cost_cents + f.invoice_cost_cents + f.icms_cost_cents + f.cte_mdfe_cost_cents,
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
  const [source, history, periods, vehicleHistory] = await Promise.all([
    queryFirst<{ snapshot: MonthlySource }>(MONTHLY_SOURCE_SQL, [competency]),
    queryAll<MonthlyClosing>(`select c.id,c.competency,c.snapshot,c.closed_at as closedAt,
      u.name as closedByName,c.reopened_at as reopenedAt,c.reopen_reason as reopenReason
      from company_monthly_closings c join users u on u.id=c.closed_by
      where c.competency=? order by c.closed_at desc,c.id`, [competency]),
    queryAll<MonthlyReport['periods'][number]>(`with periods as (
      select competency from company_monthly_closings
      union select competency from company_monthly_entries
      union select competency from fleet_vehicle_costs
      union select left(billing_date,7) from fleet_freights where billing_date is not null
      union select left(pickup_date,7) from fleet_freights
      union select left(operation_date,7) from fleet_trips
    ) select p.competency,
      exists(select 1 from company_monthly_closings c where c.competency=p.competency and c.reopened_at is null) as closed,
      exists(select 1 from fleet_vehicle_costs v where v.competency=p.competency) as hasVehicleHistory
      from periods p order by p.competency desc`),
    queryAll<MonthlyReport['vehicleHistory'][number]>(`select c.id,v.plate as vehiclePlate,c.competency,
      c.distance_meters as distanceMeters,c.monthly_cost_cents as monthlyCostCents
      from fleet_vehicle_costs c join fleet_vehicles v on v.id=c.vehicle_id
      where c.competency=? order by v.plate,c.id`,[competency]),
  ]);
  if (!source) throw new Error('Não foi possível apurar a competência.');
  return { current: source.snapshot, history, periods, vehicleHistory };
}
