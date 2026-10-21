import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as operations from '../lib/domain/operations.ts';
import * as permissions from '../lib/domain/permissions.ts';
import * as clientReport from '../lib/domain/fleet-client-report.ts';
const require = createRequire(import.meta.url);

function compile(file, overrides) {
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  const compiledModule = {exports: {}};
  new Function('require', 'module', 'exports', code)(id => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    throw new Error('Unexpected dependency: ' + id);
  }, compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
function hooks(values = []) {
  let cursor = 0;
  return {values, reset: () => {cursor = 0;}, react: {...React,
    useEffect: () => {}, useRef: initial => ({current: initial}),
    useState: initial => {const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === 'function' ? initial() : initial; return [values[slot], value => {values[slot] = typeof value === 'function' ? value(values[slot]) : value;}];},
  }};
}
function find(node, match) {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {for (const child of node) {const result = find(child, match); if (result) return result;} return null;}
  if (match(node)) return node;
  return find(node.props?.children, match);
}
const icon = () => null;
const ui = {PageHeader: ({title, actions}) => React.createElement('header', null, title, actions), LoadingState: () => null, ErrorState: () => null, EmptyState: () => null, StatusBadge: ({status}) => status, Field: ({children}) => children,
  Modal: ({open, children}) => open ? React.createElement('section', {role: 'dialog'}, children) : null};
const format = {formatDate: String, formatMoney: String, formatPercent: String};

test('detalhe do relatório abre a OS correta e retorna à mesma venda, sem exclusão', () => {
  for (const [id, source, resourceId] of [['freight:operation', 'fleet', 'operation'], ['sale:commercial', 'sale', 'commercial']]) {
    const state = hooks();
    const SaleDetailScreen = () => null, ServiceOrderScreen = () => null;
    const {FleetReportSaleDetail} = compile('components/fleet-report-sale-detail.tsx', {
      react: state.react, './sale-detail-screen': {SaleDetailScreen}, './service-order-screen': {ServiceOrderScreen},
      './fleet-freight-detail': {FleetFreightDetail: () => null}, './ui': ui,
      '@/lib/domain/permissions': permissions, './use-api': {useApi: () => ({loading: false, data: null})},
    });
    let returned = 0;
    const render = () => {state.reset(); return FleetReportSaleDetail({id, onBack: () => returned++});};
    let detail = render();
    assert.equal(detail.props.id, resourceId);
    if (source === 'sale') assert.equal(detail.props.hideDeleteActions, true);
    detail.props.onViewOrder();
    const order = render(); assert.equal(order.type, ServiceOrderScreen); assert.equal(order.props.source, source); assert.equal(order.props.id, resourceId);
    order.props.onBack(); detail = render(); assert.equal(detail.props.id, resourceId);
    detail.props.onBack(); assert.equal(returned, 1);
  }
});

test('seta preserva filtros; preparar relação envia o tipo escolhido e abre prévia sem download', async () => {
  const state = hooks(['client', '2026-10-01', '2026-10-31', 'clientId=client&from=2026-10-01&to=2026-10-31']);
  const FleetReportSaleDetail = () => null;
  const {FleetClientReportPanel} = compile('components/fleet-client-report.tsx', {
    react: state.react, './fleet-report-sale-detail': {FleetReportSaleDetail}, './icons': {Icons: new Proxy({}, {get: () => icon})}, './ui': ui,
    './fleet-client-report.module.css': {default: {}}, '@/lib/format': format,
    '@/lib/domain/fleet-client-report': clientReport,
    '@/lib/domain/dates': {currentCompetency: () => '2026-10', todaySaoPaulo: () => '2026-10-21'},
    './use-api': {useApi: () => ({loading: false, data: {clients: [{id: 'client', name: 'CLIENTE'}], report: {client: {name: 'CLIENTE'}, from: '2026-10-01', to: '2026-10-31', totals: {sales: 1, vehicles: 1, amountCents: 10000, receivedCents: 0, balanceCents: 10000}, rows: [{id: 'freight:operation', saleNumber: '201', vehicles: [], receivedDates: [], notes: ''}]}}})},
  });
  const render = () => {state.reset(); return FleetClientReportPanel();};
  let tree = render();
  find(tree, n => n.props?.['aria-label'] === 'Abrir venda 201').props.onClick();
  tree = render(); assert.equal(tree.type, FleetReportSaleDetail); assert.equal(tree.props.id, 'freight:operation');
  tree.props.onBack(); tree = render();
  assert.equal(find(tree, n => n.type === 'select').props.value, 'client');
  assert.equal(find(tree, n => n.type === 'input' && n.props.max).props.value, '2026-10-01');
  assert.equal(find(tree, n => n.type === 'input' && n.props.min).props.value, '2026-10-31');
  assert.ok(find(tree, n => n.type === 'button' && n.props.children === 'Gerar PDF para o cliente'));
  assert.equal(state.values[3], 'clientId=client&from=2026-10-01&to=2026-10-31');
  find(tree, n => n.type === 'button' && n.props.children === 'Gerar PDF para o cliente').props.onClick();
  tree = render();
  const service = find(tree, n => n.type === 'select' && n.props.disabled === false);
  assert.equal(service.props.required, true); assert.equal(service.props.value, '');
  service.props.onChange({target: {value: 'ENTREGA'}}); tree = render();
  const original = globalThis.fetch; let payload;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, '/api/fleet/client-report?clientId=client&from=2026-10-01&to=2026-10-31');
    payload = JSON.parse(options.body);
    return new Response(new Blob(['%PDF'], {type: 'application/pdf'}));
  };
  try {
    await find(tree, n => n.type === 'form' && n.props.className === 'modal-body form-stack').props.onSubmit({preventDefault() {}});
    assert.deepEqual(payload, {includeObservations: false, situations: [{saleId: 'freight:operation', situation: 'ENTREGA'}], observations: []});
    tree = render();
    assert.ok(find(tree, n => n.type === 'iframe' && n.props.title === 'Prévia da OS da relação'));
    assert.ok(find(tree, n => n.type === 'a' && n.props.children === 'Salvar PDF'));
    find(tree, n => n.props?.title === 'OS da relação').props.onClose();
  } finally { globalThis.fetch = original; }
});

test('consulta comercial mantém informações e OS; excluir recebimento fica oculto só no relatório', () => {
  for (const hideDeleteActions of [true, false]) {
    const payment = {id: 'payment', type: 'RECEBIMENTO', status: 'CONFIRMADO', amountCents: 10000, occurredAt: '2026-10-01', paymentMethod: 'PIX'};
    const state = hooks([false, payment]);
    const sale = {id: 'sale', saleNumber: '201', saleChannel: 'FROTA', origin: 'ORIGEM', destination: 'DESTINO', sellerName: 'VENDEDOR', notes: 'OBSERVAÇÃO DA VENDA', cargoVehicles: [], costs: [], payments: [payment], installments: [], attachments: [], financial: {status: 'PAGO'}};
    const {SaleDetailScreen} = compile('components/sale-detail-screen.tsx', {
      react: state.react, '@/lib/domain/permissions': permissions, '@/lib/domain/operations': operations, '@/lib/format': format,
      '@/lib/domain/proof-files': {isProofMimeType: () => false, automaticProofId: () => null},
      '@/components/proof-upload': {ProofUpload: () => null, UploadButton: () => null}, '@/components/icons': {Icons: new Proxy({}, {get: () => icon})}, '@/components/ui': ui,
      'next/link': {__esModule: true, default: ({href, children, ...props}) => React.createElement('a', {href, ...props}, children)},
      '@/components/use-api': {useApi: url => ({loading: false, data: url === '/api/me' ? {user: {role: 'ADMIN'}} : {sale}})},
    });
    const html = renderToStaticMarkup(React.createElement(SaleDetailScreen, {id: 'sale', hideDeleteActions, onBack: () => {}, onViewOrder: () => {}}));
    assert.ok(html.includes('OBSERVAÇÃO DA VENDA')); assert.ok(html.includes('Visualizar OS')); assert.ok(html.includes('Editar frete')); assert.ok(html.includes('Voltar ao relatório'));
    assert.equal(html.includes('Excluir recebimento'), !hideDeleteActions);
  }
});

test('OS abre prévia inline, com impressão e download separados e sem emissão automática', () => {
  for (const source of ['fleet', 'sale']) {
    let mutations = 0; const endpoints = [];
    const {ServiceOrderScreen} = compile('components/service-order-screen.tsx', {
      '@/components/ui': ui,
      'next/link': {__esModule: true, default: ({href, children}) => React.createElement('a', {href}, children)},
      '@/components/use-api': {useApi: url => {endpoints.push(url); return {loading: false, data: {latest: {version: 1}, stale: false}};}, apiMutation: () => {mutations++;}},
    });
    const html = renderToStaticMarkup(React.createElement(ServiceOrderScreen, {id: 'record', source, onBack: () => {}}));
    const endpoint = source === 'fleet' ? '/api/fleet/freights/record/service-order' : '/api/sales/record/service-order';
    assert.deepEqual(endpoints, [endpoint]);
    assert.ok(html.includes(`src="${endpoint}?format=pdf"`));
    assert.ok(html.includes(`href="${endpoint}?format=pdf&amp;download=1"`));
    assert.ok(html.includes('Visualizar / imprimir')); assert.ok(html.includes('Salvar PDF')); assert.ok(html.includes('Voltar à venda'));
    assert.equal(mutations, 0);
  }
});
