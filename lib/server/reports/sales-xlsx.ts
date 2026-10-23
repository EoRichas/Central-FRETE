import type { FleetClientReport } from '@/lib/domain/fleet-client-report';
import type { SalesReport } from '@/lib/domain/reports';
import { providerKindLabel } from '@/lib/domain/provider-services';
import { formatDate } from '@/lib/format';
import { renderXlsx,type SheetData } from './xlsx';
export function renderClientSalesXlsx(report:FleetClientReport,includeProviders=false){
 const subtitle=`${report.client.name} · Criação de ${formatDate(report.from)} a ${formatDate(report.to)}`;
 const sheets:SheetData[]=[{name:'Vendas',title:'Central Express · Relatório de cobrança',subtitle,totals:true,
  columns:[{label:'Venda',width:16},{label:'Criação',width:15},{label:'Motorista',width:28},{label:'Cliente',width:32},{label:'Veículo / placa',width:30},{label:'Serviço',width:16},{label:'Observação da OS',width:55},{label:'Valor do serviço',kind:'money',width:22},{label:'Recebido',kind:'money',width:22},{label:'Saldo pendente',kind:'money',width:22},{label:'Pago',width:15},{label:'Datas de recebimento',width:25}],
  rows:report.rows.map(r=>[r.saleNumber,formatDate(r.createdDate),r.driverName,r.clientName,r.vehicles.map(v=>`${v.model} / ${v.plate||v.identification||'Sem placa'}`).join('\n'),r.serviceSituation||r.situation,r.orderIncludeObservation?r.orderObservation:'',r.amountCents/100,r.receivedCents/100,Math.max(0,r.amountCents-r.receivedCents)/100,r.paid,r.receivedDates.map(formatDate).join(', ')])}];
 if(includeProviders)sheets.push({name:'Prestadores',title:'Prestadores por venda',subtitle,totals:true,columns:[{label:'Venda',width:16},{label:'Cliente',width:32},{label:'Prestador',width:35},{label:'Identificação',width:30},{label:'Serviço',width:18},{label:'Valor',kind:'money',width:22}],rows:report.rows.flatMap(r=>(r.providerServices??[]).map(p=>[r.saleNumber,r.clientName,p.providerName,p.referenceName,providerKindLabel(p.kind),p.amountCents/100]))});
 return renderXlsx(sheets);
}
export function renderGeneralSalesXlsx(report:SalesReport,showCommission:boolean){return renderXlsx([{name:'Vendas',title:'Central Express · Vendas Geral',subtitle:'Valores e registros conforme os filtros consultados.',totals:true,columns:[{label:'Venda',width:16},{label:'Canal',width:16},{label:'Data',width:15},{label:'Cliente',width:35},{label:'Vendedor',width:28},{label:'Receita',kind:'money',width:22},{label:'Custo',kind:'money',width:22},{label:'Margem',kind:'money',width:22},...(showCommission?[{label:'Comissão',kind:'money' as const,width:22}]:[])],rows:report.sales.map(r=>[r.saleNumber,r.saleChannel,formatDate(r.saleDate),r.clientName,r.sellerName,r.freightAmountCents/100,r.financial.transportCostCents/100,r.financial.marginCents/100,...(showCommission?[r.financial.commissionCents/100]:[])])}]);}
