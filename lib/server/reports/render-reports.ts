import type { SalesReport } from '@/lib/domain/reports';
import { calculateMonthlyResult, type MonthlySource, type MonthlyClosing } from '@/lib/domain/fleet-results';
import { competencyLabel, formatDate, formatMoney, formatPercent } from '@/lib/format';
import { ReportPdf, reportColors as colors, type ReportColumn } from './pdf-layout';
const num=(value:number)=>formatMoney(value).replace(/^(-?)R\$\s*/, '$1');
const pct=(result:number,revenue:number)=>formatPercent(revenue?Math.round(result*10000/revenue):0);
const cols=(labels:string[],widths:number[],rightFrom=1):ReportColumn[]=>labels.map((label,i)=>({label,width:widths[i],align:i>=rightFrom?'right':'left'}));
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
function summaryName(p:ReportPdf,value:string,width:number){
 const lines=p.wrap(value,width,8);
 if(lines.length<=2)return value;
 // The complete name remains in the detailed tables.
 let last=lines[1];while(p.wrap(`${last}…`,width,8).length>1)last=last.slice(0,-1);
 return `${lines[0]}\n${last}…`;
}

export async function renderSalesReportPdf(report:SalesReport,competency:string,channel:string,showCommission=true) {
 const p=await ReportPdf.create('Relatório gerencial',[['Competência',competencyLabel(competency)],['Canal',channel],['Base','Vendas do período'],['Moeda','Real (R$)']]);
 const {totals:t}=report;
 p.kpis([{label:'FATURAMENTO',value:formatMoney(t.freight),detail:'Valor total das vendas'},
 {label:'CUSTO TOTAL',value:formatMoney(t.cost),detail:'Despesas + comissão dos vendedores'},
 {label:'MARGEM',value:formatMoney(t.margin),detail:`${formatPercent(t.marginBps)} sobre o faturamento`},
 {label:'VENDAS',value:String(report.sales.length),detail:`${report.clients.length} clientes`}]);
 const top=p.y,clientColumns=cols(['Cliente','Vendas','Receita (R$)','Custo (R$)','Margem (R$)','Margem %'],[109,45,77,74,76,63]);
 const clientRow=(r:SalesReport['clients'][number])=>[r.name,String(r.sales),num(r.freight),num(r.cost),num(r.margin),formatPercent(r.marginBps)];
 const topClients=report.clients.slice(0,5),more=report.clients.length>5||topClients.some(r=>summaryName(p,r.name,95)!==r.name);
 p.text(more?'01  Principais clientes':'01  Resultado por cliente',p.left,top,11,true,colors.navy);
 const leftBottom=p.table(clientColumns,[...topClients.map(r=>[summaryName(p,r.name,95),...clientRow(r).slice(1)]),[report.clients.length>5?'SUBTOTAL':'TOTAL',String(sum(topClients.map(r=>r.sales))),num(sum(topClients.map(r=>r.freight))),num(sum(topClients.map(r=>r.cost))),num(sum(topClients.map(r=>r.margin))),pct(sum(topClients.map(r=>r.margin)),sum(topClients.map(r=>r.freight)))]],{top:top-19,total:true,rowHeight:26});
 const x=p.left+467,w=p.width-467;
 p.text(report.expenses.length>8?'02  Maiores custos':'02  Composição do custo',x,top,11,true,colors.navy);
 report.expenses.slice(0,8).forEach((r,i)=>{const y=top-26-i*24;const label=p.wrap(r.name,w-100,7.2).slice(0,2);label.forEach((s,j)=>p.text(s,x,y-j*8,7.2));p.text(formatMoney(r.value),x+w,y,7.5,true,colors.navy,'right');p.rect(x,y-13,w,3);p.rect(x,y-13,w*r.value/Math.max(1,report.expenses[0].value),3,colors.blue);});
 p.y=Math.min(leftBottom,top-26-Math.min(8,report.expenses.length)*24)-4;
 p.note('Margem = faturamento - custos lançados - comissão do vendedor. Não equivale ao lucro líquido da empresa.');
 if(report.pendingCosts)p.note(`Resultado parcial: ${report.pendingCosts} venda(s) com custos pendentes.`);
 if(more||report.expenses.length>8)p.note('A composição completa está nas páginas seguintes.');
 p.newPage('Detalhamento das vendas incluídas no relatório');p.section('03  Vendas do período');
 if(showCommission)p.table(cols(['Venda','Data','Cliente','Vendedor(a)','Comissão %','Comissão (R$)','Receita (R$)','Custo (R$)','Margem (R$)'],[42,66,130,99,65,90,94,94,p.width-680],4),[
 ...report.sales.map(s=>[s.saleNumber,formatDate(s.saleDate),s.clientName||'Não informado',s.sellerName,formatPercent(s.commissionBasisPoints),num(s.financial.commissionCents),num(s.freightAmountCents),num(s.financial.transportCostCents),num(s.financial.marginCents)]),
 ['TOTAL','','','','',num(report.commissions),num(t.freight),num(t.cost),num(t.margin)]],{total:true});
 else p.table(cols(['Venda','Data','Cliente','Vendedor(a)','Receita (R$)','Custo (R$)','Margem (R$)'],[42,66,170,135,110,110,p.width-633],4),[...report.sales.map(s=>[s.saleNumber,formatDate(s.saleDate),s.clientName||'Não informado',s.sellerName,num(s.freightAmountCents),num(s.financial.transportCostCents),num(s.financial.marginCents)]),['TOTAL','','','',num(t.freight),num(t.cost),num(t.margin)]],{total:true});
 p.note('Custo total inclui despesas cadastradas e comissão do vendedor. Os totais correspondem ao resumo.');
 if(more){p.section('Resultado completo por cliente');p.table(cols(clientColumns.map(c=>c.label),[240,55,130,120,130,p.width-675]),report.clients.map(clientRow));}
 if(report.expenses.length>8){p.section('Composição completa do custo');p.table(cols(['Categoria','Valor (R$)'],[p.width-160,160]),report.expenses.map(r=>[r.name,num(r.value)]));}
 return p.save();
}

export async function renderMonthlyReportPdf(source:MonthlySource,closing?:MonthlyClosing) {
 if(source.sales?.some(s=>s.saleChannel!=='FROTA'))throw new Error('Este fechamento contém vendas fora da Frota.');
 const t=calculateMonthlyResult(source),allCosts=t.variableCostCents+t.fixedCostCents;
 const p=await ReportPdf.create('Fechamento mensal da Frota',[['Competência',competencyLabel(source.competency)],['Escopo','Somente Frota'],['Situação',closing?(closing.reopenedAt?'Fechamento reaberto':'Fechamento salvo'):'Apuração atual'],['Moeda','Real (R$)']]);
 p.kpis([{label:'RECEITA DA FROTA',value:formatMoney(t.revenueCents),detail:`${source.freights.length} fretes + ${source.sales?.length??0} vendas sem vínculo`},
 {label:'DESPESAS TOTAIS',value:formatMoney(allCosts),detail:'Custos variáveis e fixos da Frota'},
 {label:'RESULTADO DO MÊS',value:formatMoney(t.resultCents),detail:'Receita menos despesas da Frota'},
 {label:'MARGEM DO MÊS',value:pct(t.resultCents,t.revenueCents),detail:'Resultado / receita da Frota'}]);
 const groups=new Map<string,{name:string;count:number;value:number}>();
 for(const f of source.freights){const key=f.driverId??`historical:${f.driverName??'Não detalhado'}`;const g=groups.get(key)??{name:f.driverName||'Não detalhado no histórico',count:0,value:0};g.count++;g.value+=f.driverCommissionCents??0;groups.set(key,g);}
 const drivers=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
 const detailed=source.freights.every(f=>f.driverCommissionCents!==undefined);
 const fuel=sum(source.freights.map(f=>f.fuelCostCents??0)),toll=sum(source.freights.map(f=>f.tollCostCents??0));
 const tripCosts=sum(source.trips.map(t=>t.costCents)),undetailed=t.transportCostCents-fuel-toll-tripCosts;
 const parts:[string,number][]=[['Receita dos fretes operacionais',t.fleetRevenueCents],['Vendas Frota sem vínculo com fretes',t.salesRevenueCents]];
 if(t.otherRevenueCents)parts.push(['Outras receitas da Frota',t.otherRevenueCents]);
 if(detailed)parts.push(['Comissões dos motoristas',-t.driverCommissionCents],['Demais despesas diretas dos fretes',-(t.directCostCents-t.driverCommissionCents)]);
 else parts.push(['Comissões e despesas diretas dos fretes',-t.directCostCents]);
 for(const [name,v] of [['Combustível realizado',fuel],['Pedágios',toll],['Custos compartilhados das viagens',tripCosts],['Transporte não detalhado no histórico',undetailed],['Custos das vendas Frota, incluindo comissões',t.salesCostCents],['Outras despesas variáveis da Frota',t.otherVariableCents],['Custos fixos da Frota',t.fixedCostCents]] as [string,number][])if(v)parts.push([name,-v]);
 parts.push(['RESULTADO DO MÊS',t.resultCents]);
 const top=p.y;p.text('01  Composição do fechamento',p.left,top,11,true,colors.navy);
 const compositionRows=parts.map(([name,v])=>[name,num(v)]);
 // Large compositions continue after the summary instead of overflowing a side column.
 const compact=compositionRows.length>11;
 const summary=compact?[["Receita da Frota",num(t.revenueCents)],["Custos variáveis",num(-t.variableCostCents)],["Custos fixos",num(-t.fixedCostCents)],["RESULTADO DO MÊS",num(t.resultCents)]]:compositionRows;
 const bottom=p.table(cols(['Composição','Valor (R$)'],[333,116]),summary,{top:top-19,rowHeight:20,total:true});
 const x=p.left+472,w=p.width-472;p.text('02  Comissões dos motoristas',x,top,11,true,colors.navy);
 const listed=drivers.slice(0,4);
 const fullDrivers=drivers.length>4||listed.some(d=>summaryName(p,d.name,w-159)!==d.name);
 p.table(cols(['Motorista','Fretes','Comissão (R$)'],[w-145,43,102]),[...listed.map(d=>[summaryName(p,d.name,w-159),String(d.count),detailed?num(d.value):'Não detalhada']),[drivers.length>4?'SUBTOTAL':'TOTAL',String(sum(listed.map(d=>d.count))),detailed?num(sum(listed.map(d=>d.value))):'Não detalhada']],{x,top:top-19,total:true,rowHeight:23});
 p.note('Comissões geradas pelos fretes. Não indica pagamento ao motorista.',w,x,7.2);
 p.note('Fretes por faturamento; coleta provisória se a data estiver ausente. Vendas pela competência. Custos compartilhados pela data da viagem.',w,x,7.2);
 p.y=Math.min(p.y,bottom)-2;
 if(t.pendingFuelCount||t.pendingSalesCount||source.unbilledCount)p.note(`APURAÇÃO PARCIAL: ${source.unbilledCount} frete(s) sem faturamento; ${t.pendingFuelCount} sem combustível realizado; ${t.pendingSalesCount} venda(s) com custos pendentes.`);
 else p.note('Somente receitas e despesas atribuídas à Frota. Vendas vinculadas não são contadas novamente.');

 p.newPage('Registros que compõem as receitas e os custos');
 if(closing)p.note(`Fechado por ${closing.closedByName} em ${formatDate(closing.closedAt)}.${closing.reopenedAt?` Reaberto: ${closing.reopenReason}`:''}`);
 p.section('03  Fretes operacionais');
 const freightRows=source.freights.map(f=>[f.saleNumber||'Não disponível',formatDate(f.date),f.client,f.driverName||'Não detalhado',num(f.revenueCents),f.driverCommissionCents===undefined?'Não detalhada':num(f.driverCommissionCents),num(f.directCostCents-(f.driverCommissionCents??0)),num(f.standaloneCostCents),num(f.revenueCents-f.directCostCents-f.standaloneCostCents)]);
 p.table(cols(['Venda','Data base','Cliente','Motorista','Receita (R$)','Comissão (R$)','Diretos (R$)','Transporte direto (R$)','Saldo (R$)'],[47,63,111,101,90,90,80,94,p.width-676],4),[...freightRows,['TOTAL','','','',num(t.fleetRevenueCents),detailed?num(t.driverCommissionCents):'Não detalhada',num(t.directCostCents-t.driverCommissionCents),num(sum(source.freights.map(f=>f.standaloneCostCents))),num(t.fleetRevenueCents-t.directCostCents-sum(source.freights.map(f=>f.standaloneCostCents)))]],{rowHeight:22,total:true});
 p.note('Saldos antes dos custos compartilhados de viagens e das despesas mensais. Diretos excluem comissão quando ela está detalhada. Transporte direto inclui combustível realizado e pedágios de fretes sem viagem vinculada.');
 p.section('04  Vendas Frota sem vínculo operacional');
 p.table(cols(['Venda','Data','Cliente','Receita (R$)','Custos e comissão (R$)','Saldo (R$)'],[55,77,237,130,145,p.width-644],3),[...(source.sales??[]).map(s=>[s.saleNumber||'Não disponível',formatDate(s.date),s.client||'Não informado',num(s.revenueCents),num(s.costCents),num(s.revenueCents-s.costCents)]),['TOTAL','','',num(t.salesRevenueCents),num(t.salesCostCents),num(t.salesRevenueCents-t.salesCostCents)]],{rowHeight:22,total:true});
 if(source.trips.length){p.section('Custos compartilhados das viagens');p.table(cols(['Viagem','Data','Custo (R$)'],[p.width-230,100,130],2),source.trips.map(t=>[t.name,formatDate(t.date),num(t.costCents)]));}
 if(source.entries.length){p.section('Lançamentos mensais da Frota');p.table(cols(['Descrição','Tipo','Valor (R$)'],[p.width-285,145,140],2),source.entries.map(e=>[e.description,{REVENUE:'Outra receita',VARIABLE:'Custo variável',FIXED:'Custo fixo'}[e.kind],num(e.amountCents)]));}
 if(fullDrivers){p.section('Comissões por motorista: relação completa');p.table(cols(['Motorista','Fretes','Comissão (R$)'],[p.width-230,80,150]),drivers.map(d=>[d.name,String(d.count),detailed?num(d.value):'Não detalhada']));}
 if(compact){p.section('Composição completa do fechamento');p.table(cols(['Composição','Valor (R$)'],[p.width-170,170]),compositionRows,{total:true});}
 p.note(`Conferência: ${formatMoney(t.revenueCents)} de receitas - ${formatMoney(allCosts)} de despesas = ${formatMoney(t.resultCents)} de resultado.`);
 return p.save();
}
