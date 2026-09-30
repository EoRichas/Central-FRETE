import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { loadSalesReport } from '@/lib/server/sales-report';
import { renderSalesReportPdf } from '@/lib/server/reports/render-reports';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';

function csvCell(value:unknown) {
  let text=String(value ?? '');
  if(/^[\s]*[=+\-@]/.test(text))text=`'${text}`;
  return `"${text.replaceAll('"','""')}"`;
}
export async function GET(request:Request){try{
  const user=await authorize(request,['ADMIN','GERENCIA','FINANCEIRO','VENDEDOR']);
  const params=new URL(request.url).searchParams;
  const {report,showCommission,sellers,period,channel,seller}=await loadSalesReport(user,params);
  if(params.get('format')==='pdf')return pdfResponse(await renderSalesReportPdf(report,period,channel,showCommission,seller),'Relatorio-Vendas-Central.pdf');
  if(params.get('format')==='csv') {
    const money=(n:number)=>(n/100).toFixed(2).replace('.',',');
    const rows=[['Venda','Canal','Data','Cliente','Vendedor',...(showCommission?['Comissão %','Comissão (R$)']:[]),'Receita (R$)','Custo (R$)','Margem (R$)','Custos pendentes'],
      ...report.sales.map(s=>[s.saleNumber,s.saleChannel,s.saleDate,s.clientName,s.sellerName,...(showCommission?[money(s.commissionBasisPoints),money(s.financial.commissionCents)]:[]),money(s.freightAmountCents),money(s.financial.transportCostCents),money(s.financial.marginCents),s.costsPending?'Sim':'Não'])];
    return new Response(`\uFEFF${rows.map(r=>r.map(csvCell).join(';')).join('\r\n')}`,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="Relatorio-Vendas-Central.csv"','cache-control':'private, no-store'}});
  }
  const {commissions,...visibleReport}=report; void commissions;
  const visibleSales=report.sales.map(s=>{const {commissionBasisPoints,financial,...rest}=s;const {commissionCents,...visibleFinancial}=financial;void commissionBasisPoints;void commissionCents;return {...rest,financial:visibleFinancial};});
  return Response.json({showCommission,sellers,report:showCommission?report:{...visibleReport,sales:visibleSales}},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return jsonError(error);}}
