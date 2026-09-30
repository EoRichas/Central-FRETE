import type { MonthlyClosing, MonthlySource, MonthlyReport } from '@/lib/domain/fleet-results';
import { queryAll, queryFirst } from './d1';

// Captured by the closing INSERT in one database statement, without mixing channels.
export const CEGONHA_MONTHLY_SOURCE_SQL = `with month as (select ?::text as competency)
select jsonb_build_object('scope','CEGONHA','dateBasis','SALE_DATE','competency',m.competency,
 'sales',coalesce((select jsonb_agg(jsonb_build_object(
   'id',s.id,'saleNumber',s.sale_number,'saleChannel',s.sale_channel,'client',c.legal_name,'date',s.sale_date,
   'revenueCents',s.freight_amount_cents,
   'costCents',round(s.freight_amount_cents::numeric*s.commission_basis_points/10000)::bigint + coalesce((select sum(fc.amount_cents) from freight_costs fc where fc.sale_id=s.id),0),
   'costsPending',s.costs_pending=1) order by s.sale_date,s.id)
   from freight_sales s left join clients c on c.id=s.client_id where s.competency=m.competency and s.sale_channel='CEGONHA'),'[]'::jsonb),
 'freights','[]'::jsonb,'trips','[]'::jsonb,
 'entries',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'description',e.description,'amountCents',e.amount_cents) order by e.id)
   from company_monthly_entries e where e.competency=m.competency and e.scope='CEGONHA'),'[]'::jsonb),
 'unbilledCount',0) as snapshot from month m`;

export async function loadCegonhaMonthlyReport(competency:string):Promise<Omit<MonthlyReport,'canManage'>> {
 const [source,history,periods]=await Promise.all([
   queryFirst<{snapshot:MonthlySource}>(CEGONHA_MONTHLY_SOURCE_SQL,[competency]),
   queryAll<MonthlyClosing>(`select c.id,c.competency,c.snapshot,c.closed_at as closedAt,u.name as closedByName,c.reopened_at as reopenedAt,c.reopen_reason as reopenReason
     from company_monthly_closings c join users u on u.id=c.closed_by where c.competency=? and c.scope='CEGONHA' order by c.closed_at desc,c.id`,[competency]),
   queryAll<MonthlyReport['periods'][number]>(`with periods as (
     select competency from freight_sales where sale_channel='CEGONHA'
     union select competency from company_monthly_closings where scope='CEGONHA'
     union select competency from company_monthly_entries where scope='CEGONHA')
     select p.competency,exists(select 1 from company_monthly_closings c where c.competency=p.competency and c.scope='CEGONHA' and c.reopened_at is null) as closed,false as hasVehicleHistory from periods p order by p.competency desc`),
 ]);
 if(!source)throw new Error('Não foi possível apurar a competência.');
 return {current:source.snapshot,history,periods,vehicleHistory:[],unassignedEntries:[],legacyClosings:[]};
}
