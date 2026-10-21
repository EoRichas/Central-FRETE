import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFleetClientReport, creationDate, reportObservations, type FleetClientReportRow } from '../lib/domain/fleet-client-report.ts';
import { buildSalesReport, consolidateReportSales, partialResultMessage, type ReportSale } from '../lib/domain/reports.ts';
import { latestIncomingMessage, loadSupportNotifications, supportMessageUnread } from '../lib/client/support-notifications.ts';
import type { FleetFreight } from '../lib/domain/fleet.ts';

const row: FleetClientReportRow = {id: 'freight:one', saleNumber: '211', createdDate: '2026-10-01', clientId: 'one', clientName: 'Cliente', vehicles: [{model: 'A', plate: 'AAA1A11', identification: null}], driverName: 'Motorista', situation: 'Em rota', departureDate: '2026-09-20', amountCents: 10000, receivedCents: 5000, receivedDates: ['2026-10-02'], paid: 'Parcial', notes: 'Observação existente'};

test('relatório usa criação em São Paulo, cliente por ID e inclui os dois limites', () => {
  assert.equal(creationDate('2026-10-01T02:59:59Z'), '2026-09-30');
  assert.equal(creationDate('2026-10-01T03:00:00Z'), '2026-10-01');
  assert.throws(() => creationDate('inválida'));
  const report = buildFleetClientReport({id: 'one', name: 'Cliente'}, '2026-10-01', '2026-10-31', [row, {...row, id: 'two', createdDate: '2026-10-31', receivedCents: 15000}, {...row, id: 'foreign', clientId: 'homonym'}, {...row, id: 'outside', createdDate: '2026-09-30'}]);
  assert.deepEqual(report.rows.map(r => r.id), ['freight:one', 'two']);
  assert.deepEqual(report.totals, {sales: 2, vehicles: 2, amountCents: 20000, receivedCents: 20000, balanceCents: 5000});
  assert.equal(row.notes, 'Observação existente');
  assert.deepEqual(reportObservations(report, ['freight:one', 'foreign']).map(r => r.id), ['freight:one']);
  assert.deepEqual(report.totals.sales, 2); // Observations do not filter the financial report.
});

test('combustível é motivo exclusivo da Frota; custos reais da Cegonha não são escondidos', () => {
  const sale: ReportSale & {fleetFreightId: null} = {id: 'c', fleetFreightId: null, saleChannel: 'CEGONHA', saleNumber: '201', saleDate: '2026-10-01', sellerId: null, sellerName: 'Nome', clientName: 'Cliente', freightAmountCents: 10000, commissionBasisPoints: 0, costsPending: true, costs: [], financial: {commissionCents: 0, transportCostCents: 1000, marginCents: 9000, marginBasisPoints: 9000}};
  const freight = {id: 'f', saleNumber: '202', pickupDate: '2026-10-01', clientName: 'Cliente', freightAmountCents: 5000, totalCostCents: 2000, netRevenueCents: 3000, marginBasisPoints: 6000, fuelCostSource: 'ESTIMADO'} as FleetFreight;
  const report = buildSalesReport(consolidateReportSales([sale], [freight]));
  assert.equal(report.pendingCosts, 2); assert.equal(report.pendingCostCount, 1); assert.equal(report.pendingFuelCount, 1);
  assert.match(partialResultMessage(report), /1 venda\(s\) com custos pendentes/);
  assert.match(partialResultMessage(report), /1 frete\(s\) da Frota com combustível estimado/);
  const cegonha = buildSalesReport(consolidateReportSales([sale], []));
  assert.equal(cegonha.pendingFuelCount, 0); assert.doesNotMatch(partialResultMessage(cegonha), /combustível/);
  assert.equal(buildSalesReport([{...report.sales[0], saleChannel: 'CEGONHA', pendingReason: 'FUEL'} as ReportSale]).pendingFuelCount, 0);
  assert.equal(partialResultMessage(buildSalesReport([{...cegonha.sales[0], costsPending: false}])), '');
});

test('notificação ignora respostas próprias e a leitura é isolada por usuário e conversa', () => {
  assert.equal(latestIncomingMessage([{id: 'a', author_label: 'Você'}]), null);
  assert.equal(latestIncomingMessage([{id: 'a', author_label: 'Suporte'}, {id: 'b', author_label: 'Você'}]), 'a');
  const item = {chatId: 'chat1', messageId: 'a'};
  const values = new Map([['cf-support-read:user1:chat1', 'a']]);
  const storage = {getItem: (key: string) => values.get(key) ?? null};
  assert.equal(supportMessageUnread('user1', item, storage), false);
  assert.equal(supportMessageUnread('user2', item, storage), true);
  assert.equal(supportMessageUnread('user1', {...item, chatId: 'chat2'}, storage), true);
  assert.equal(supportMessageUnread('user1', {...item, messageId: 'new'}, storage), true);
  assert.equal(supportMessageUnread('user1', item, {getItem: () => {throw new Error('Storage disabled');}}), true);
});

test('notificação consulta o chat sem marcar leitura, trata encerramento e não transforma falha em ausência de mensagem', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (url, options) => {
    calls.push(String(url)); assert.equal(options?.method, undefined); assert.equal(options?.credentials, 'same-origin');
    if (String(url).endsWith('/chats')) return Response.json({chats: [{id: 'one'}, {id: 'closed'}]});
    if (String(url).endsWith('/closed')) return Response.json({error: 'Encerrado'}, {status: 404});
    return Response.json({messages: [{id: 'support-message', body: 'Texto que não deve ser persistido no marcador', author_label: 'Suporte'}, {id: 'own', author_label: 'Você'}]});
  };
  const result = await loadSupportNotifications(new AbortController().signal, fetcher);
  assert.deepEqual(result, [{chatId: 'one', messageId: 'support-message'}]);
  assert.equal(calls.length, 3); assert.equal(JSON.stringify(result).includes('Texto'), false);
  assert.deepEqual(await loadSupportNotifications(new AbortController().signal, async () => Response.json({chats: []})), []);
  await assert.rejects(loadSupportNotifications(new AbortController().signal, async () => new Response(null, {status: 503})), /verificar/);
});
