import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { currentCompetency } from '@/lib/domain/dates';
import { resultCompetency } from '@/lib/server/fleet-results-validation';
import { loadCegonhaMonthlyReport, CEGONHA_MONTHLY_SOURCE_SQL } from '@/lib/server/cegonha-monthly';
import { mutateMonthly } from '@/lib/server/monthly-actions';
export async function GET(request:Request) {try{
 await authorize(request,['ADMIN','GERENCIA','FINANCEIRO']);
 const competency=resultCompetency(new URL(request.url).searchParams.get('competency') || currentCompetency());
 return Response.json({...await loadCegonhaMonthlyReport(competency),canManage:true},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return jsonError(error);}}
export async function POST(request:Request) {return mutateMonthly(request,'CEGONHA',CEGONHA_MONTHLY_SOURCE_SQL);}
