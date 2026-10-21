import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { PDFDocument } from 'pdf-lib';
import { buildFleetClientReport, type FleetClientReportRow } from '../lib/domain/fleet-client-report.ts';
import { renderFleetClientPdf } from '../lib/server/reports/fleet-client-pdf.ts';

const row: FleetClientReportRow = {id: 'freight:test', saleNumber: '201', createdDate: '2026-10-01', clientId: 'test', clientName: 'CLIENTE DE EXEMPLO', vehicles: [{model: 'FIAT STRADA', plate: 'AAA1A11', identification: null}], driverName: 'MOTORISTA DE EXEMPLO', situation: 'Em rota', departureDate: '2026-10-02', amountCents: 150000, receivedCents: 50000, receivedDates: ['2026-10-02', '2026-10-03'], paid: 'Parcial', notes: 'Observação de exemplo da venda.'};
test('PDF do cliente segue retrato e pagina vendas, nomes e observações extensas', async () => {
  const short = buildFleetClientReport({id: 'test', name: row.clientName}, '2026-10-01', '2026-10-31', [row, {...row, id: 'freight:two', saleNumber: '202', paid: 'Sim', receivedCents: 150000}]);
  const bytes = await renderFleetClientPdf(short, [{saleId: row.id, text: row.notes}]);
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1); assert.ok(pdf.getPage(0).getHeight() > pdf.getPage(0).getWidth());
  assert.match(pdf.getTitle()!, /Relatório de vendas/);
  const many = buildFleetClientReport({id: 'test', name: 'CLIENTE COM RAZÃO SOCIAL EXTENSA '.repeat(4)}, '2026-10-01', '2026-10-31', Array.from({length: 40}, (_, i) => ({...row, id: `freight:${i}`, saleNumber: String(201 + i), vehicles: [{model: 'DESCRIÇÃO DE VEÍCULO TRANSPORTADO '.repeat(3), plate: 'AAA1A11', identification: null}]})));
  const extended = await renderFleetClientPdf(many, [{saleId: many.rows[0].id, text: 'Observação com várias informações e condições para o cliente. '.repeat(90)}]);
  assert.ok((await PDFDocument.load(extended)).getPageCount() >= 5);
  if (process.env.CENTRAL_QA_OUTPUT) {
    await mkdir(process.env.CENTRAL_QA_OUTPUT, {recursive: true});
    await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/frota-cliente.pdf`, bytes);
    await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/frota-cliente-extenso.pdf`, extended);
  }
});
