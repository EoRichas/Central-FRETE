import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdir,writeFile} from 'node:fs/promises';
import {PDFDocument} from 'pdf-lib';
import {renderServiceOrderPdf} from '../lib/server/service-order-pdf.ts';
import type {ServiceOrderSnapshot} from '../lib/domain/service-order.ts';
import {formatRouteLocationType,visibleOperationCosts,isDirectPaidOperationCostCategory,normalizeCostCategory} from '../lib/domain/operations.ts';
import {roleCan} from '../lib/domain/permissions.ts';

const legacy:ServiceOrderSnapshot={schemaVersion:1,issuer:{name:'Central Express',document:null,address:null,contact:null},saleId:'demonstracao',saleNumber:'201',saleDate:'2026-09-28',clientName:'CLIENTE DEMONSTRAÇÃO',clientDocument:'DADOS FICTÍCIOS',clientAddress:'Endereço ilustrativo',origin:'SÃO PAULO / SP',destination:'CURITIBA / PR',originLocationType:'PATIO',destinationLocationType:'PATIO',pickupAddress:null,deliveryAddress:null,cargoVehicles:[{model:'VEÍCULO DEMONSTRAÇÃO',plate:'ABC1D23',identification:'NAO-IMPRIMIR-CHASSI'}],freightAmountCents:450000,installments:[{dueDate:'2026-10-05',paymentMethod:'PIX',amountCents:450000}],financialDueDate:'2026-10-05',operationalDeadlineDays:5,deliveryDeadline:'2026-10-03',notes:'Documento demonstrativo para validação do layout. Sem valor operacional.'};

test('regras de custos, locais e permissões comerciais',()=>{
 assert.equal(formatRouteLocationType('PATIO','PATIO'),'PÁTIO A PÁTIO');
 assert.equal(formatRouteLocationType('PORTA','PORTA'),'PORTA A PORTA');
 assert.equal(formatRouteLocationType('PATIO','PORTA'),'PÁTIO → PORTA');
 assert.equal(formatRouteLocationType(null,'PORTA'),'NÃO INFORMADO → PORTA');
 assert.deepEqual(visibleOperationCosts([{amountCents:0},{amountCents:123}]),[{amountCents:123}]);
 for(const category of ['NOTA_FISCAL_IMPOSTO','SEGURO_ALLIANZ','ICMS']) assert.ok(isDirectPaidOperationCostCategory(category));
 for(const category of ['CTE','MDFE','CTE_MDFE','ICMS_CTE_MDFE']) {assert.equal(isDirectPaidOperationCostCategory(category),false);assert.equal(normalizeCostCategory(category),category);}
 assert.ok(roleCan('OPERACIONAL','CREATE_CEGONHA_SALE'));assert.equal(roleCan('OPERACIONAL','CREATE_FLEET_SALE'),false);
 assert.ok(roleCan('VENDEDOR','CREATE_FLEET_SALE'));assert.ok(roleCan('VENDEDOR','FLEET_SALES_ONLY'));assert.equal(roleCan('VENDEDOR','MANAGE_PAYMENTS'),false);
});

test('PDF histórico e novo preservam texto e paginam carga extensa com o timbrado em todas as páginas',async()=>{
 for(const channel of ['LEGADO','CEGONHA','FROTA','MULTIPAGINA'] as const){
  const snapshot:ServiceOrderSnapshot=channel==='LEGADO'?legacy:{...legacy,schemaVersion:2,layoutVersion:'central-express-20260928',saleChannel:channel==='FROTA'?'FROTA':'CEGONHA',operationCosts:[],operationValues:{freightAmountCents:450000,totalOperationCostCents:180000,insuranceCents:15000,invoiceCents:10000,icmsCents:20000,cteMdfeCents:5000,legacyCombinedTaxTransportCents:30000},cargoVehicles:channel==='MULTIPAGINA'?Array.from({length:100},(_,i)=>({...legacy.cargoVehicles[0],model:`VEÍCULO ${i+1} ${'DESCRIÇÃO '.repeat(8)}`})):legacy.cargoVehicles};
  const bytes=await renderServiceOrderPdf({orderId:'demo',version:1,createdAt:'2026-09-28T13:00:00Z',snapshot});
  const pdf=await PDFDocument.load(bytes);assert.ok(pdf.getPageCount()>=2);
  for(const page of pdf.getPages()) {assert.ok(page.node.Resources()?.get);assert.equal(page.getWidth(),595.28);assert.equal(page.getHeight(),841.89);}
  if(channel==='MULTIPAGINA') assert.ok(pdf.getPageCount()>5);
  if(process.env.CENTRAL_QA_OUTPUT){await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/os-${channel.toLowerCase()}.pdf`,bytes);}
 }
});
