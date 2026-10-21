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

test('relatório preserva filtros e acesso à venda sem botão ou modal de geração de PDF', () => {
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
  assert.equal(state.values[3], 'clientId=client&from=2026-10-01&to=2026-10-31');
  assert.equal(find(tree, n => n.type === 'button' && n.props.children === 'Gerar PDF da relação'), null);
  assert.equal(find(tree, n => n.type === ui.Modal), null);
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
    assert.ok(html.includes(`src="${endpoint}?format=pdf${source === 'fleet' ? '&amp;observations=0' : ''}"`));
    assert.ok(html.includes(`href="${endpoint}?format=pdf${source === 'fleet' ? '&amp;observations=0' : ''}&amp;download=1"`));
    assert.ok(html.includes('Visualizar / imprimir')); assert.ok(html.includes('Salvar PDF')); assert.ok(html.includes('Voltar à venda'));
    assert.equal(mutations, 0);
  }
});

test('Novo frete aparece só em Fretes e a explicação abre e fecha em modal', () => {
  const state=hooks(); state.react.useMemo=fn=>fn();
  const noOp=()=>null, mod=new Proxy({}, {get:()=>noOp});
  const source=readFileSync(new URL('../components/fleet-screen.tsx',import.meta.url),'utf8');
  const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  Object.assign(overrides,{
    react:state.react,'@/components/ui':ui,'@/lib/format':format,
    '@/lib/domain/permissions':permissions,'@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[]},
    '@/lib/domain/dates':{currentCompetency:()=>'2026-10'},'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},
    '@/lib/domain/fleet':{FLEET_OPERATIONAL_STATUSES:[],FLEET_PRIORITIES:[]},
    '@/components/use-transient-message':{useTransientMessage:()=>[null,()=>{}]},
    '@/components/use-api':{useApi:url=>url==='/api/me'?{data:{user:{role:'ADMIN'}}}:{data:{fleet:{canEditFreights:true,freights:[],vehicles:[],drivers:[],summary:{},billing:{freights:[],drivers:[]}}}}},
  });
  const {FleetScreen}=compile('components/fleet-screen.tsx',overrides);
  const inner=FleetScreen().type; const render=()=>{state.reset();return inner();};
  const walk=(node,match)=>{if(!node||typeof node!=='object')return null;if(Array.isArray(node)){for(const child of node){const result=walk(child,match);if(result)return result;}return null;}return match(node)?node:walk(node.props?.children,match)||walk(node.props?.actions,match);};
  const create=tree=>walk(tree,n=>n.type==='button'&&n.props.className?.includes('create-sale-action'));
  let tree=render(); assert.equal(create(tree),null);
  find(tree,n=>n.type==='button'&&n.props.children==='Como é calculado?').props.onClick();tree=render();
  let modal=find(tree,n=>n.props?.title==='Como é calculado o resultado das operações?');assert.equal(modal.props.open,true);
  find(modal,n=>n.type==='button'&&n.props.children==='Fechar').props.onClick();tree=render();
  assert.equal(find(tree,n=>n.props?.title==='Como é calculado o resultado das operações?').props.open,false);
  find(tree,n=>n.type==='button'&&n.props.children==='Ver todos').props.onClick();tree=render();assert.ok(create(tree));
});

test('Adicionar Observação encapsula a opção na OS Frota e sincroniza prévia, impressão e download', () => {
  for (const source of ['fleet','sale']) {
    const state=hooks();let mutations=0;
    const {ServiceOrderScreen}=compile('components/service-order-screen.tsx',{
      react:state.react,'@/components/ui':ui,
      'next/link':{__esModule:true,default:()=>null},
      '@/components/use-api':{useApi:()=>({loading:false,data:{latest:{version:1,snapshot:{fleetRelation:{}}},stale:false}}),apiMutation:()=>{mutations++;}},
    });
    const render=()=>{state.reset();return ServiceOrderScreen({id:'record',source});};
    let tree=render();
    assert.equal(find(tree,n=>n.props?.title==='Adicionar Observação').props.open,false);
    find(tree,n=>n.type==='button'&&n.props.children==='Adicionar Observação').props.onClick();tree=render();
    const modal=find(tree,n=>n.props?.title==='Adicionar Observação');assert.equal(modal.props.open,true);
    const checkbox=find(modal,n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checkbox.props.checked,false);
    checkbox.props.onChange({target:{checked:true}});tree=render();
    const endpoint=source==='fleet'?'/api/fleet/freights/record/service-order':'/api/sales/record/service-order';
    assert.equal(find(tree,n=>n.type==='iframe').props.src,endpoint+'?format=pdf&observations=1');
    assert.equal(find(tree,n=>n.type==='a'&&n.props.children==='Visualizar / imprimir').props.href,endpoint+'?format=pdf&observations=1');
    assert.equal(find(tree,n=>n.type==='a'&&n.props.children==='Salvar PDF').props.href,endpoint+'?format=pdf&observations=1&download=1');
    find(tree,n=>n.type==='button'&&n.props.children==='Fechar').props.onClick();tree=render();
    assert.equal(find(tree,n=>n.props?.title==='Adicionar Observação').props.open,false);assert.equal(mutations,0);
  }
});
