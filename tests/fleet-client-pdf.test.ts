import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { buildFleetClientReport, type FleetClientReportRow } from '../lib/domain/fleet-client-report.ts';
import { renderFleetClientPdf } from '../lib/server/reports/fleet-client-pdf.ts';

const row: FleetClientReportRow = {id: 'freight:test', saleNumber: '201', createdDate: '2026-10-01', clientId: 'test', clientName: 'CLIENTE DE EXEMPLO', vehicles: [{model: 'FIAT STRADA', plate: 'AAA1A11', identification: null}], driverName: 'MOTORISTA DE EXEMPLO', serviceSituation: 'ENTREGA', situation: 'Em rota', departureDate: '2026-10-02', amountCents: 150000, receivedCents: 50000, receivedDates: ['2026-10-02', '2026-10-03'], paid: 'Parcial', notes: 'Observação de exemplo da venda.'};
test('OS da relação segue retrato e pagina vendas, nomes e observações extensas', async () => {
  const short = buildFleetClientReport({id: 'test', name: row.clientName}, '2026-10-01', '2026-10-31', [row, {...row, id: 'freight:two', saleNumber: '202', paid: 'Sim', receivedCents: 150000}]);
  const bytes = await renderFleetClientPdf(short, [{saleId: row.id, text: row.notes}]);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1); assert.ok(pdf.getPage(0).getWidth() < pdf.getPage(0).getHeight());
  assert.match(pdf.getTitle()!, /Relatório de vendas - Relação de serviços/);
  const many = buildFleetClientReport({id: 'test', name: 'CLIENTE COM RAZÃO SOCIAL EXTENSA '.repeat(4)}, '2026-10-01', '2026-10-31', Array.from({length: 40}, (_, i) => ({...row, id: `freight:${i}`, saleNumber: String(201 + i), vehicles: [{model: 'DESCRIÇÃO DE VEÍCULO TRANSPORTADO '.repeat(3), plate: 'AAA1A11', identification: null}]})));
  const extended = await renderFleetClientPdf(many, [{saleId: many.rows[0].id, text: 'Observação com várias informações e condições para o cliente. '.repeat(90)}]);
  assert.ok((await PDFDocument.load(extended)).getPageCount() >= 5);
  if (process.env.CENTRAL_QA_OUTPUT) {
    await mkdir(process.env.CENTRAL_QA_OUTPUT, {recursive: true});
    await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/frota-cliente.pdf`, bytes);
    await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/frota-cliente-extenso.pdf`, extended);
  }
});

test('relação contém nove campos, tipos de serviço, baixas reais e somente observações selecionadas', async () => {
  const report = buildFleetClientReport({id: 'test', name: row.clientName}, '2026-10-01', '2026-10-31', [
    {...row, id: 'freight:one', driverName: 'João Silva', paid: 'Sim', receivedCents: 150000},
    {...row, id: 'freight:two', driverName: null, serviceSituation: 'RETIRA', paid: 'Não', receivedCents: 0, receivedDates: [], notes: 'NOTA INTERNA OMITIDA'},
    {...row, id: 'sale:three', serviceSituation: 'EMBARQUE', vehicles: [{model: 'Modelo A', plate: 'AAA1A11', identification: null}, {model: 'Modelo B', plate: 'BBB2B22', identification: null}], paid: 'Parcial'},
  ]);
  const texts: string[] = [], original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function(value, options) { texts.push(value); return original.call(this, value, options); };
  try {
    const pdf = await PDFDocument.load(await renderFleetClientPdf(report, [{saleId: 'freight:one', text: 'OBSERVAÇÃO SELECIONADA'}]));
    assert.equal(pdf.getPageCount(), 1);
    for (const field of ['DATA', 'MOTORISTA', 'CLIENTE', 'VEÍCULO', 'PLACA', 'SITUAÇÃO', 'CLIENTE / OBSERVAÇÃO', 'VALOR', 'SERVIÇO', 'CONFIRMAÇÃO', 'DO PAGAMENTO', 'ENTREGA', 'RETIRA', 'EMBARQUE', 'João Silva', 'CONFIRMADO', 'PENDENTE', 'PARCIAL', 'OBSERVAÇÃO SELECIONADA', 'Modelo B', 'BBB2B22', '01/10/2026']) assert.ok(texts.join("").replace(/\s+/g,"").includes(field.replace(/\s+/g,"")), field);
    assert.ok(!texts.some(t => t.includes('NOTA INTERNA OMITIDA') || t.includes('Em rota')));
    assert.ok(!texts.some(t => t.includes('Observação de exemplo da venda.')));
    assert.equal(texts.filter(t => t === 'Modelo B').length, 1);
    assert.equal(report.rows[0].situation, 'Em rota');
  } finally { PDFPage.prototype.drawText = original; }
});

test('relação compacta comporta cinco vendas com totais e preserva notas ao paginar',async()=>{
 const rows=Array.from({length:10},(_,i)=>({...row,id:`dense:${i}`,driverName:`MOTORISTA ${i+1}`,receivedDates:['2026-10-02'],notes:`NOTA CURTA ${i+1}`}));
 const report=(items:typeof rows)=>buildFleetClientReport({id:'test',name:row.clientName},'2026-10-01','2026-10-31',items);
 const texts:string[]=[],original=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(value,options){texts.push(value);if(options?.y!==undefined)assert.ok(options.y>=20,'Texto abaixo do rodapé');return original.call(this,value,options);};
 try {
  const five=await renderFleetClientPdf(report(rows.slice(0,5)),rows.slice(0,5).map(r=>({saleId:r.id,text:r.notes})));
  assert.equal((await PDFDocument.load(five)).getPageCount(),1);
  for(let i=1;i<=5;i++)assert.ok(texts.includes(`NOTA CURTA ${i}`));
  assert.ok(texts.includes('VALOR TOTAL'));texts.length=0;
  const ten=await renderFleetClientPdf(report(rows),rows.map(r=>({saleId:r.id,text:r.notes})));
  assert.equal((await PDFDocument.load(ten)).getPageCount(),1);
  for(let i=1;i<=10;i++)assert.equal(texts.filter(t=>t===`NOTA CURTA ${i}`).length,1);
  texts.length=0;
  await renderFleetClientPdf(report(rows.slice(0,1)),[{saleId:rows[0].id,text:'CONDIÇÃO DO CLIENTE '.repeat(500)+'FIM DA OBSERVAÇÃO'}]);
  assert.ok(texts.join(' ').includes('FIM DA OBSERVAÇÃO'));
  const single=await PDFDocument.load(await renderFleetClientPdf(report(rows.slice(0,1)),[],'123'));
  assert.equal(single.getPageCount(),1);assert.match(single.getTitle()!,/^OS 123/);
  if(process.env.CENTRAL_DENSE_QA_OUTPUT){await mkdir(process.env.CENTRAL_DENSE_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_DENSE_QA_OUTPUT}/cinco-vendas.pdf`,five);await writeFile(`${process.env.CENTRAL_DENSE_QA_OUTPUT}/dez-vendas.pdf`,ten);}
 }finally{PDFPage.prototype.drawText=original;}
});

test('cabeçalho de cobrança fica somente na primeira página, inclusive quando a última contém totais',async()=>{
 const rows=Array.from({length:32},(_,i)=>({...row,id:`headers:${i}`,driverName:`MOTORISTA ${i+1}`,receivedDates:['2026-10-02'],notes:`NOTA ${i+1}`}));
 const report=buildFleetClientReport({id:'test',name:row.clientName},'2026-10-01','2026-10-31',rows);
 const pages=new Map<PDFPage,{text:string;y:number}[]>(),draw=PDFPage.prototype.drawText;
 PDFPage.prototype.drawText=function(value,options){const items=pages.get(this)??[];items.push({text:value,y:options?.y??0});pages.set(this,items);return draw.call(this,value,options);};
 try{
  const bytes=await renderFleetClientPdf(report,rows.map(r=>({saleId:r.id,text:r.notes})));
  const pdf=await PDFDocument.load(bytes),texts=[...pages.values()];assert.ok(pdf.getPageCount()>=3);assert.equal(texts.length,pdf.getPageCount());
  texts.forEach((items,i)=>{assert.equal(items.some(t=>t.text==='CENTRAL EXPRESS'),i===0,`Cabeçalho da página ${i+1}`);assert.ok(items.every(t=>t.y>=20),'Texto fora da página');});
  for(const items of texts.slice(1,-1))assert.ok(items.some(t=>t.text.startsWith('MOTO')&&t.y>700),'Espaço superior recuperado');
  for(let i=1;i<=32;i++)assert.equal(texts.flat().filter(t=>t.text===`NOTA ${i}`).length,1);
  assert.ok(texts[texts.length-1].some(t=>t.text==='VALOR TOTAL'));
  if(process.env.CENTRAL_DENSE_QA_OUTPUT)await writeFile(`${process.env.CENTRAL_DENSE_QA_OUTPUT}/cabecalhos.pdf`,bytes);
 }finally{PDFPage.prototype.drawText=draw;}
});

test('frete retorno aparece somente no espelho individual marcado', async () => {
 const report = (marked: boolean) => buildFleetClientReport({id:'test',name:row.clientName},'2026-10-01','2026-10-31',[{...row,returnFreight:marked}]);
 const texts: string[] = [], draw = PDFPage.prototype.drawText;
 PDFPage.prototype.drawText = function(value, options) {texts.push(value);return draw.call(this,value,options);};
 try {
  for (const [marked, order, expected] of [[true,'201',true],[false,'201',false],[true,undefined,false]] as const) {
   texts.length=0; await renderFleetClientPdf(report(marked),[],order);
   assert.equal(texts.join('').replace(/\s/g,'').includes('Freteretornoaproveitado'),expected);
  }
 } finally {PDFPage.prototype.drawText=draw;}
});
