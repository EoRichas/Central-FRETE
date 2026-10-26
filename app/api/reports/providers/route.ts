import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { loadProviderReport } from '@/lib/server/provider-report';
import { renderXlsx,xlsxResponse } from '@/lib/server/reports/xlsx';
import { providerKindLabel } from '@/lib/domain/provider-services';
import { formatDate,formatMoney } from '@/lib/format';
import { ReportPdf,pdfResponse } from '@/lib/server/reports/pdf-layout';
export async function GET(request:Request){try{
 const user=await authorize(request),params=new URL(request.url).searchParams;
 const report=await loadProviderReport(user,params);
 if(params.get('format')==='xlsx')return xlsxResponse(renderXlsx([{name:'Prestadores',title:'Central Express · Coletas e entregas por transportador',subtitle:`Coleta de ${formatDate(report.from)} a ${formatDate(report.to)}`,totals:true,columns:[{label:'Prestador',width:35},{label:'Identificação',width:28},{label:'Venda',width:16},{label:'Coleta',width:15},{label:'Cliente',width:32},{label:'Serviço',width:18},{label:'Valor',kind:'money',width:22}],rows:report.rows.map(r=>[r.providerName,r.referenceName,r.saleNumber,formatDate(r.date),r.clientName,providerKindLabel(r.kind),r.amountCents/100])}]),`Prestadores-${report.from}-${report.to}.xlsx`);
 if(params.get('format')==='pdf'){
  const p=await ReportPdf.create('Coletas e entregas por transportador',[['Coleta de',formatDate(report.from)],['Até',formatDate(report.to)]],true);
  p.table([{label:'Prestador / referência',width:190},{label:'Venda / data',width:100},{label:'Cliente',width:220},{label:'Serviço',width:100},{label:'Valor',width:p.width-610,align:'right'}],report.rows.map(r=>[`${r.providerName}${r.referenceName?' / '+r.referenceName:''}`,`${r.saleNumber}\n${formatDate(r.date)}`,r.clientName,providerKindLabel(r.kind),formatMoney(r.amountCents)]));p.note(`Total: ${formatMoney(report.totalCents)}`);
  return pdfResponse(await p.save(),`Prestadores-${report.from}-${report.to}.pdf`);
 }
 return Response.json({report},{headers:{'cache-control':'private, no-store'}});
}catch(error){return jsonError(error);}}
