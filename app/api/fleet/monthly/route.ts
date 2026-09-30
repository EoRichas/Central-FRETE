import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { loadMonthlyReport, MONTHLY_SOURCE_SQL } from '@/lib/server/monthly-results';
import { resultCompetency } from '@/lib/server/fleet-results-validation';
import { currentCompetency } from '@/lib/domain/dates';
import { mutateMonthly } from '@/lib/server/monthly-actions';

export async function GET(request: Request) {
  try {
    const user = await authorize(request, ['ADMIN','GERENCIA','FINANCEIRO']);
    const competency = resultCompetency(new URL(request.url).searchParams.get('competency') || currentCompetency());
    return Response.json({ ...await loadMonthlyReport(competency), canManage: ['ADMIN','GERENCIA','FINANCEIRO'].includes(user.role) });
  } catch (error) { return jsonError(error); }
}
export async function POST(request:Request) { return mutateMonthly(request,'FROTA',MONTHLY_SOURCE_SQL); }
