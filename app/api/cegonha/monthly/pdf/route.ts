import { authorize } from '@/lib/server/auth';
import { ApiError, jsonError, queryFirst } from '@/lib/server/d1';
import { currentCompetency } from '@/lib/domain/dates';
import { resultCompetency } from '@/lib/server/fleet-results-validation';
import { CEGONHA_MONTHLY_SOURCE_SQL } from '@/lib/server/cegonha-monthly';
import type { MonthlySource, MonthlyClosing } from '@/lib/domain/fleet-results';
import { renderCegonhaMonthlyReportPdf } from '@/lib/server/reports/render-reports';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';
export async function GET(request:Request){try{
 await authorize(request,['ADMIN','GERENCIA','FINANCEIRO']);
 const url=new URL(request.url),competency=resultCompetency(url.searchParams.get('competency')||currentCompetency()),id=url.searchParams.get('closingId');
 let source:MonthlySource,closing:MonthlyClosing|undefined;
 if(id){const saved=await queryFirst<MonthlyClosing>(`select c.id,c.competency,c.snapshot,c.closed_at as closedAt,u.name as closedByName,c.reopened_at as reopenedAt,c.reopen_reason as reopenReason from company_monthly_closings c join users u on u.id=c.closed_by where c.id=? and c.competency=? and c.scope='CEGONHA'`,[id,competency]);if(!saved)throw new ApiError(404,'Fechamento da Cegonha não encontrado.');closing=saved;source=saved.snapshot;}
 else {const row=await queryFirst<{snapshot:MonthlySource}>(CEGONHA_MONTHLY_SOURCE_SQL,[competency]);if(!row)throw new ApiError(404,'Apuração não encontrada.');source=row.snapshot;}
 return pdfResponse(await renderCegonhaMonthlyReportPdf(source,closing),`Fechamento-Cegonha-${competency}${closing?'-salvo':'-atual'}.pdf`);
}catch(error){return jsonError(error);}}
