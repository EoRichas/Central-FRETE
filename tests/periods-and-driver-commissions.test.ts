import assert from 'node:assert/strict';
import test from 'node:test';
import { isCalendarDate,exclusivePeriodEnd,inDatePeriod } from '../lib/domain/date-period.ts';
import { fleetFinancialStatus } from '../lib/domain/fleet.ts';
import { groupDriverCommissions,type DriverCommissionRow } from '../lib/domain/driver-commissions.ts';
import { renderDriverCommissionsPdf } from '../lib/server/reports/driver-commissions-pdf.ts';
import { PDFDocument,PDFPage } from 'pdf-lib';
import { mkdir,writeFile } from 'node:fs/promises';

test('período valida datas reais e inclui os dois extremos na troca do ano',()=>{
 assert.equal(isCalendarDate('2026-02-29'),false);assert.equal(isCalendarDate('2028-02-29'),true);assert.equal(isCalendarDate('2026-02-31'),false);
 assert.equal(exclusivePeriodEnd('2026-12-31'),'2027-01-01');
 const range={from:'2026-12-31',to:'2027-01-02'};
 assert.equal(inDatePeriod('2026-12-31',range),true);assert.equal(inDatePeriod('2027-01-02',range),true);assert.equal(inDatePeriod('2027-01-03',range),false);
});
test('situação financeira prioriza pagamento e separa faturado de aberto sem alterar o operacional',()=>{
 const row={paymentStatus:'EM_ABERTO',billingDate:null,operationalStatus:'EM_ROTA'};
 assert.equal(fleetFinancialStatus(row),'EM_ABERTO');assert.equal(fleetFinancialStatus({...row,billingDate:'2026-10-28'}),'FATURADO');
 assert.equal(fleetFinancialStatus({...row,operationalStatus:'FATURADO'}),'FATURADO');assert.equal(fleetFinancialStatus({...row,billingDate:'2026-10-28',paymentStatus:'PAGO'}),'PAGO');
 assert.equal(row.operationalStatus,'EM_ROTA');
});
const row:DriverCommissionRow={id:'1',saleNumber:'200',pickupDate:'2026-10-28',clientName:'CLIENTE DE EXEMPLO',driverId:'a',driverName:'MESMO NOME',vehicleId:'v1',vehiclePlate:'AAA1A11',freightAmountCents:10000,driverCommissionCents:1250};
test('comissões preservam IDs de homônimos e histórico e consolidam por motorista ou veículo',()=>{
 const rows=[row,{...row,id:'2',driverId:'b'},{...row,id:'3',driverId:null},{...row,id:'4',driverId:null,vehicleId:null}];
 const drivers=groupDriverCommissions(rows,'driver');assert.equal(drivers.length,3);assert.deepEqual(drivers.map(g=>g.commissionCents).sort((a,b)=>a-b),[1250,1250,2500]);
 assert.equal(groupDriverCommissions(rows,'vehicle').length,2);assert.equal(drivers.reduce((n,g)=>n+g.freights,0),4);
});
test('relatórios motorista e veículo usam retrato, mostram vendas, filtros e comissão sem cortar nomes longos',async()=>{
 const report={from:'2026-10-01',to:'2026-10-31',rows:[row,{...row,id:'2',saleNumber:'201',driverName:'NOME COMPLETO '.repeat(9),clientName:'CLIENTE COMPLETO '.repeat(12)}],drivers:[],vehicles:[],driverLabel:'Todos',vehicleLabel:'AAA1A11'};
 const texts:string[]=[],draw=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(value,options){texts.push(value);if(options?.y!==undefined)assert.ok(options.y>=20);return draw.call(this,value,options);};
 try{for(const by of ['driver','vehicle'] as const){texts.length=0;const bytes=await renderDriverCommissionsPdf(report,by),pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPage(0).getHeight()>pdf.getPage(0).getWidth());assert.match(pdf.getTitle()!,by==='driver'?/motorista/:/veículo/);assert.ok(texts.join(' ').includes('Venda 200'));assert.equal(texts.join(' ').includes('AAA1A11'),by==='vehicle');assert.ok(texts.join(' ').includes('25,00'));assert.ok(texts.join(' ').includes('01/10/2026'));if(process.env.CENTRAL_QA_OUTPUT){await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/comissao-${by}.pdf`,bytes);}}}
 finally{PDFPage.prototype.drawText=draw;}
});

test('PDFs separados de motorista e veículo mantêm cabeçalho somente na primeira página, inclusive na última',async()=>{
 const rows=Array.from({length:110},(_,i)=>({...row,id:String(i),saleNumber:String(500+i),driverName:'MOTORISTA TESTE',clientName:`CLIENTE TESTE ${i}`}));
 const report={from:'2026-10-01',to:'2026-10-31',rows,drivers:[],vehicles:[],driverLabel:'MOTORISTA TESTE',vehicleLabel:'AAA1A11'};
 const pages=new Map<PDFPage,{text:string;y:number}[]>(),draw=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(text,options){const lines=pages.get(this)??[];lines.push({text,y:options?.y??0});pages.set(this,lines);return draw.call(this,text,options);};
 try{for(const by of ['driver','vehicle'] as const){pages.clear();const bytes=await renderDriverCommissionsPdf(report,by),pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>2);
  const rendered=[...pages.values()];assert.equal(rendered.length,pdf.getPageCount());rendered.forEach((lines,i)=>{assert.equal(lines.some(t=>t.text==='CENTRAL EXPRESS'),i===0);assert.ok(lines.every(t=>t.y>=20));if(i>0)assert.ok(lines.some(t=>t.text.includes('Venda')&&t.y>700),'Continuação usa o espaço do cabeçalho');});
  const all=rendered.flat().map(t=>t.text).join(' ');assert.equal(all.includes('AAA1A11'),by==='vehicle');assert.equal(all.includes('MOTORISTA TESTE'),by==='driver');
  for(let i=0;i<rows.length;i++)assert.equal(rendered.flat().filter(t=>t.text===`Venda ${500+i}`).length,1);
  if(process.env.CENTRAL_QA_OUTPUT){await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/comissao-${by}-multipagina.pdf`,bytes);}
 }}finally{PDFPage.prototype.drawText=draw;}
});
