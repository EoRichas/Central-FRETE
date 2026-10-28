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
 try{for(const by of ['driver','vehicle'] as const){texts.length=0;const bytes=await renderDriverCommissionsPdf(report,by),pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPage(0).getHeight()>pdf.getPage(0).getWidth());assert.match(pdf.getTitle()!,by==='driver'?/motorista/:/veículo/);assert.ok(texts.join(' ').includes('Venda 200'));assert.ok(texts.join(' ').includes('AAA1A11'));assert.ok(texts.join(' ').includes('25,00'));assert.ok(texts.join(' ').includes('01/10/2026'));if(process.env.CENTRAL_QA_OUTPUT){await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/comissao-${by}.pdf`,bytes);}}}
 finally{PDFPage.prototype.drawText=draw;}
});
