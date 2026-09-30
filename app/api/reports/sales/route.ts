import { canViewSellerCommission } from "@/lib/domain/permissions";
import { saleForViewer } from "@/lib/server/seller-commission";
import { authorize } from '@/lib/server/auth';
import { ApiError, jsonError } from '@/lib/server/d1';
import { currentCompetency, isCompetency } from '@/lib/domain/dates';
import { SALE_CHANNELS } from '@/lib/domain/sales';
import { enumValue } from '@/lib/server/validation';
import { listSales } from '@/lib/server/repository';
import { buildSalesReport } from '@/lib/domain/reports';
import { renderSalesReportPdf } from '@/lib/server/reports/render-reports';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';
export async function GET(request:Request){try{
 const user=await authorize(request,['ADMIN','GERENCIA','FINANCEIRO','VENDEDOR']);
 const url=new URL(request.url),competency=url.searchParams.get('competency')||currentCompetency();
 if(!isCompetency(competency))throw new ApiError(400,'Competência inválida.');
 const saleChannel=url.searchParams.has('saleChannel')?enumValue(url.searchParams.get('saleChannel'),'Canal',SALE_CHANNELS):undefined;
 const report=buildSalesReport(await listSales(user,{competency,saleChannel,all:true}),canViewSellerCommission(user.role));
 if(url.searchParams.get('format')==='pdf')return pdfResponse(await renderSalesReportPdf(report,competency,saleChannel==='FROTA'?'Frota':saleChannel==='CEGONHA'?'Cegonha':'Todos',canViewSellerCommission(user.role)),`Relatorio-Central-${saleChannel??'Todos'}-${competency}.pdf`);
 const {commissions,...visibleReport} = report; void commissions;
 return Response.json({showCommission:canViewSellerCommission(user.role),report:canViewSellerCommission(user.role) ? report : {...visibleReport,sales:report.sales.map(s=>saleForViewer(s,user))}},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return jsonError(error);}}
