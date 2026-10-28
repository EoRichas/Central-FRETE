import { formatDate,formatMoney } from '@/lib/format';
import { groupDriverCommissions,type DriverCommissionReport } from '@/lib/domain/driver-commissions';
import { ReportPdf } from './pdf-layout';
export async function renderDriverCommissionsPdf(report:DriverCommissionReport,by:'driver'|'vehicle'){
 const p=await ReportPdf.create(by==='driver'?'Relatório motorista':'Relatório veículo',[
  ['Período',`${formatDate(report.from)} a ${formatDate(report.to)}`],...(by==='driver'?[["Motorista",report.driverLabel] as [string,string]]:[["Veículo",report.vehicleLabel] as [string,string]])],true,'Comissões geradas pelos fretes no período de coleta',true);
 const groups=groupDriverCommissions(report.rows,by),amount=report.rows.reduce((n,r)=>n+r.freightAmountCents,0),commission=report.rows.reduce((n,r)=>n+r.driverCommissionCents,0);
 p.kpis([{label:'FRETES',value:String(report.rows.length),detail:'Pela data de coleta'}, {label:'COMISSÃO MOTORISTAS',value:formatMoney(commission),detail:'Comissão gerada nos fretes'}]);
 p.note('Comissões pela coleta, incluindo fretes ainda não faturados. Este relatório não confirma pagamento ao motorista.');
 p.section(by==='driver'?'Resumo por motorista':'Resumo por veículo');
 p.table([{label:by==='driver'?'Motorista':'Veículo',width:207},{label:'Fretes',width:45,align:'right'},{label:'Valor fretes (R$)',width:137,align:'right'},{label:'Comissão (R$)',width:138,align:'right'}],
  [...groups.map(g=>[g.name,String(g.freights),formatMoney(g.amountCents),formatMoney(g.commissionCents)]),['TOTAL',String(report.rows.length),formatMoney(amount),formatMoney(commission)]],{total:true});
 p.section('Detalhamento dos fretes');
 p.table([{label:'Data / venda',width:75},{label:by==='driver'?'Motorista':'Veículo',width:147},{label:'Cliente',width:135},{label:'Valor frete (R$)',width:85,align:'right'},{label:'Comissão (R$)',width:85,align:'right'}],report.rows.map(r=>[`${formatDate(r.pickupDate)}\nVenda ${r.saleNumber}`,by==='driver'?(r.driverName||'Não informado'):(r.vehiclePlate||'Não informado'),r.clientName,formatMoney(r.freightAmountCents),formatMoney(r.driverCommissionCents)]));
 return p.save();
}
