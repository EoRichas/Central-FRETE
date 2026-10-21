import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { buildFleetClientReport, type FleetClientReportRow } from '../lib/domain/fleet-client-report.ts';
import { renderFleetClientPdf } from '../lib/server/reports/fleet-client-pdf.ts';

const row: FleetClientReportRow = {id: 'freight:test', saleNumber: '201', createdDate: '2026-10-01', clientId: 'test', clientName: 'CLIENTE DE EXEMPLO', vehicles: [{model: 'FIAT STRADA', plate: 'AAA1A11', identification: null}], driverName: 'MOTORISTA DE EXEMPLO', serviceSituation: 'ENTREGA', situation: 'Em rota', departureDate: '2026-10-02', amountCents: 150000, receivedCents: 50000, receivedDates: ['2026-10-02', '2026-10-03'], paid: 'Parcial', notes: 'Observação de exemplo da venda.'};
test('OS da relação segue paisagem e pagina vendas, nomes e observações extensas', async () => {
  const short = buildFleetClientReport({id: 'test', name: row.clientName}, '2026-10-01', '2026-10-31', [row, {...row, id: 'freight:two', saleNumber: '202', paid: 'Sim', receivedCents: 150000}]);
  const bytes = await renderFleetClientPdf(short, [{saleId: row.id, text: row.notes}]);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1); assert.ok(pdf.getPage(0).getWidth() > pdf.getPage(0).getHeight());
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
    for (const field of ['DATA', 'MOTORISTA', 'CLIENTE', 'VEÍCULO', 'PLACA', 'SITUAÇÃO', 'CLIENTE / OBSERVAÇÃO', 'VALOR', 'SERVIÇO', 'CONFIRMAÇÃO', 'DO PAGAMENTO', 'ENTREGA', 'RETIRA', 'EMBARQUE', 'João Silva', 'CONFIRMADO', 'PENDENTE', 'PARCIAL', 'OBSERVAÇÃO SELECIONADA', 'Modelo B', 'BBB2B22', '01/10/2026']) assert.ok(texts.includes(field), field);
    assert.ok(!texts.some(t => t.includes('NOTA INTERNA OMITIDA') || t.includes('Em rota')));
    assert.ok(!texts.some(t => t.includes('Observação de exemplo da venda.')));
    assert.equal(texts.filter(t => t === 'Modelo B').length, 1);
    assert.equal(report.rows[0].situation, 'Em rota');
  } finally { PDFPage.prototype.drawText = original; }
});
