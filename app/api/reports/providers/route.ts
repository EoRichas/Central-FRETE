import { authorize } from '@/lib/server/auth';
import { jsonError } from '@/lib/server/d1';
import { loadProviderReport } from '@/lib/server/provider-report';
import { renderXlsx,xlsxResponse } from '@/lib/server/reports/xlsx';
import { providerKindLabel } from '@/lib/domain/provider-services';
import { formatDate,formatMoney } from '@/lib/format';
import { renderProviderPdf } from '@/lib/server/reports/provider-pdf';
import { pdfResponse } from '@/lib/server/reports/pdf-layout';
export async function GET(request:Request){try{
 const user=await authorize(request),params=new URL(request.url).searchParams;
 const report=await loadProviderReport(user,params);
 if(params.get('format')==='xlsx')return xlsxResponse(renderXlsx([{name:'Prestadores',title:'Central Express · Coletas e entregas por transportador',subtitle:`Coleta de ${formatDate(report.from)} a ${formatDate(report.to)} · Total dos prestadores: ${formatMoney(report.totalCents)}`,totals:false,columns:[{label:'Prestador',width:35},{label:'Identificação',width:28},{label:'Venda',width:16},{label:'Criação',width:15},{label:'Coleta',width:15},{label:'Motorista',width:28},{label:'Cliente',width:32},{label:'Veículo / placa',width:35},{label:'Situação',width:18},{label:'Observação da OS',width:45},{label:'Valor do frete',kind:'money',width:22},{label:'Recebido da venda',kind:'money',width:22},{label:'Data do recebimento',width:22},{label:'Pago',width:15},{label:'Serviço',width:18},{label:'Valor',kind:'money',width:22}],rows:report.rows.map(r=>[r.providerName,r.referenceName,r.saleNumber,formatDate(r.createdDate),formatDate(r.date),r.driverName,r.clientName,r.vehicles.map(v=>`${v.model||''} / ${v.plate||v.identification||''}`).join('\n'),r.serviceSituation,r.orderIncludeObservation?r.orderObservation:'',r.saleAmountCents/100,r.paymentStatus==='PAGO'?r.saleAmountCents/100:0,r.paymentStatus==='PAGO'&&r.paidAt?formatDate(r.paidAt):'',r.paymentStatus==='PAGO'?'Sim':'Não',providerKindLabel(r.kind),r.amountCents/100])}]),`Prestadores-${report.from}-${report.to}.xlsx`);
 if(params.get('format')==='pdf'){
  return pdfResponse(await renderProviderPdf(report),`Prestadores-${report.from}-${report.to}.pdf`);
 }
 return Response.json({report},{headers:{'cache-control':'private, no-store'}});
}catch(error){return jsonError(error);}}
