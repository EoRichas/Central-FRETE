import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
import * as fleetDomain from '../lib/domain/fleet.ts';
import * as numberInput from '../lib/domain/number-input.ts';
import * as fullFormat from '../lib/format.ts';
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
    if(id==='./provider-report-panel')return {ProviderReportPanel:()=>null};
    if(id==='@/lib/domain/provider-services')return {providerKindLabel:value=>value};
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

test('relatório preserva filtros e acesso à venda com retorno aos filtros e botão próprio de relatório', () => {
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
  assert.equal(find(tree, n => n.type === ui.Modal).props.open, false);
  assert.ok(find(tree,n=>n.type==='button'&&n.props.children==='Gerar relatório de vendas'));
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
      './order-observations-dialog': {OrderObservationsDialog:()=>null}, '@/components/ui': ui,
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

test('Frota inicia em Fretes e Novo frete não aparece nas demais abas', () => {
  const state=hooks(); state.react.useMemo=fn=>fn();
  const noOp=()=>null, mod=new Proxy({}, {get:()=>noOp}),FleetFreightFormScreen=()=>null;
  const source=readFileSync(new URL('../components/fleet-screen.tsx',import.meta.url),'utf8');
  const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  Object.assign(overrides,{
    react:state.react,'@/components/ui':ui,'@/lib/format':format,'@/components/fleet-freight-form-screen':{FleetFreightFormScreen},
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
  let tree=render(); assert.ok(create(tree));
  create(tree).props.onClick();tree=render();assert.equal(tree.type,FleetFreightFormScreen);assert.equal(find(tree,n=>n.type==='section'&&n.props.className==='filter-panel fleet-filter-panel'),null);tree.props.onClose();tree=render();assert.ok(create(tree));
  for(const label of ['Visão geral','Fechamento mensal','Relatório de vendas']) assert.equal(find(tree,n=>n.type==='button'&&n.props.children===label),null);
  find(tree,n=>n.type==='button'&&n.props.children==='Faturamento').props.onClick();tree=render();assert.equal(create(tree),null);

});

test('fretes filtra vendedor ao lado de prioridade, combinando filtros e preservando identidades e histórico', () => {
  const state = hooks(); state.react.useMemo = fn => fn();
  const noOp = () => null, mod = new Proxy({}, {get: () => noOp}), FreightTable = () => null;
  const source = readFileSync(new URL('../components/fleet-screen.tsx', import.meta.url), 'utf8');
  const overrides = Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m => [m[1], mod]));
  const row = (id, sellerId, sellerName, extra = {}) => ({id, sellerId, sellerName, clientName: 'CLIENTE M1', priority: 'URGENTE', operationalStatus: 'EM_ROTA', ...extra});
  const freights = [
    row('1', 'a', 'ANA'), row('2', 'a', 'ANA', {priority: 'NORMAL'}),
    row('3', 'a', 'ANA', {operationalStatus: 'ENTREGUE'}), row('4', 'b', 'ANA'),
    row('5', null, 'HISTÓRICO'), row('6', null, null),
    row('7', 'a', 'ANA', {clientName: 'OUTRO CLIENTE'}),
  ];
  const endpoints = [];
  Object.assign(overrides, {
    react: state.react, '@/components/ui': ui, '@/lib/format': format,
    '@/lib/domain/permissions': permissions, '@/lib/domain/cargo-vehicles': {cargoVehiclesOrLegacy: () => []},
    '@/lib/domain/dates': {currentCompetency: () => '2026-10'}, '@/components/icons': {Icons: new Proxy({}, {get: () => icon})},
    '@/lib/domain/fleet': fleetDomain, '@/components/fleet-freight-table': {FreightTable},
    '@/components/use-transient-message': {useTransientMessage: () => [null, noOp]},
    '@/components/use-api': {useApi: url => {
      endpoints.push(url);
      return url === '/api/me' ? {data: {user: {role: 'OPERACIONAL'}}} : {data: {fleet: {freightOnly: true, freights, billing: {freights: []}, summary: {}}}};
    }},
  });
  const {FleetScreen} = compile('components/fleet-screen.tsx', overrides);
  const inner = FleetScreen().type, render = () => {state.reset(); return inner();};
  const select = (tree, label) => find(find(tree, n => n.type === 'label' && n.props.children?.[0]?.props.children === label), n => n.type === 'select');
  const change = (tree, label, value) => select(tree, label).props.onChange({target: {value}});
  const ids = tree => find(tree, n => n.type === FreightTable).props.freights.map(f => f.id);
  let tree = render();
  const panel = find(tree, n => n.props?.className === 'filter-panel fleet-filter-panel');
  assert.deepEqual(panel.props.children.filter(n => n.type === 'label').map(n => n.props.children[0].props.children), ['Buscar', 'Status', 'Prioridade', 'Vendedor']);
  const options = React.Children.toArray(select(tree, 'Vendedor').props.children);
  assert.deepEqual(options.map(n => n.props.value), ['', 'id:a', 'id:b', 'name:HISTÓRICO', 'unassigned']);
  change(tree, 'Vendedor', 'id:a'); tree = render(); assert.deepEqual(ids(tree), ['1', '2', '3', '7']);
  change(tree, 'Prioridade', 'URGENTE'); tree = render(); assert.deepEqual(ids(tree), ['1', '3', '7']);
  change(tree, 'Status', 'EM_ROTA'); tree = render(); assert.deepEqual(ids(tree), ['1', '7']);
  find(tree, n => n.type === 'input' && n.props.placeholder).props.onChange({target: {value: ' m1 '}});
  tree = render(); assert.deepEqual(ids(tree), ['1']);
  assert.equal(find(tree, n => n.props?.className === 'filter-stat').props.children[0].props.children, 1);
  change(tree, 'Vendedor', 'id:b'); tree = render(); assert.deepEqual(ids(tree), ['4']);
  change(tree, 'Vendedor', 'name:HISTÓRICO'); tree = render(); assert.deepEqual(ids(tree), ['5']);
  change(tree, 'Vendedor', 'unassigned'); tree = render(); assert.deepEqual(ids(tree), ['6']);
  change(tree, 'Vendedor', ''); tree = render(); assert.deepEqual(ids(tree), ['1', '4', '5', '6']);
  assert.ok(endpoints.every(url => ['/api/me', '/api/fleet?competency=2026-10'].includes(url)));
});

test('Adicionar Observação limita a OS à venda atual, inclusive em vendas vinculadas, e usa a prévia gerada', () => {
  const OrderObservationsDialog=()=>null;
  for (const [source,id,rowId,expected] of [['fleet','record','record','freight:record'],['sale','record','record','sale:record'],['sale','commercial','operation','freight:operation']]) {
    const state=hooks();let mutations=0;
    const {ServiceOrderScreen}=compile('components/service-order-screen.tsx',{
      react:state.react,'@/components/ui':ui,'./order-observations-dialog':{OrderObservationsDialog},
      'next/link':{__esModule:true,default:()=>null},
      '@/components/use-api':{useApi:()=>({loading:false,data:{latest:{version:1,snapshot:{fleetRelation:{id:rowId,clientId:'client',createdDate:'2026-10-09'}}},stale:false}}),apiMutation:()=>{mutations++;}},
    });
    const render=()=>{state.reset();return ServiceOrderScreen({id,source});};
    let tree=render();assert.equal(find(tree,n=>n.type===OrderObservationsDialog),null);
    find(tree,n=>n.type==='button'&&n.props.children==='Adicionar Observação').props.onClick();tree=render();
    const modal=find(tree,n=>n.type===OrderObservationsDialog);
    assert.deepEqual(modal.props.context,{clientId:'client',from:'2026-10-09',to:'2026-10-09',rowId:expected});
    modal.props.onGenerated(new Blob(['%PDF'],{type:'application/pdf'}),'OS.pdf');tree=render();
    assert.equal(find(tree,n=>n.type===OrderObservationsDialog),null);
    const preview=find(tree,n=>n.type==='iframe').props.src;assert.ok(preview.startsWith('blob:'));
    assert.equal(find(tree,n=>n.type==='a'&&n.props.children==='Visualizar / imprimir').props.href,preview);
    const save=find(tree,n=>n.type==='a'&&n.props.children==='Salvar PDF');assert.equal(save.props.href,preview);assert.equal(save.props.download,'OS.pdf');
    URL.revokeObjectURL(preview);assert.equal(mutations,0);
  }
});

test('Sim libera diretamente a observação da venda aberta, com ou sem texto original, sem marcação', async () => {
  for (const originalNote of ['', 'TEXTO ORIGINAL']) {
    const state=hooks(), calls=[], generated=[];
    const report={client:{id:'client',name:'CLIENTE'},from:'2026-10-09',to:'2026-10-09',totals:{amountCents:10000},rows:[
      {id:'freight:234',saleNumber:'234',vehicles:[],notes:originalNote},
    ]};
    const {OrderObservationForm}=compile('components/order-observations-dialog.tsx',{
      react:state.react,'./ui':ui,'./fleet-client-report.module.css':{default:{}},'./use-api':{},'@/lib/format':format,
    });
    const query='clientId=client&from=2026-10-09&to=2026-10-09&rowId=freight%3A234';
    const render=()=>{state.reset();return OrderObservationForm({report,query,onClose:()=>{},onGenerated:(...args)=>generated.push(args)});};
    let tree=render();assert.equal(find(tree,n=>n.type==='textarea'),null);
    find(tree,n=>n.type==='input'&&n.props.type==='radio'&&!n.props.checked).props.onChange();tree=render();
    assert.equal(find(tree,n=>n.type==='input'&&n.props.type==='checkbox'),null);
    const textarea=find(tree,n=>n.type==='textarea');
    assert.equal(textarea.props.value,originalNote);assert.equal(textarea.props.disabled,false);assert.equal(textarea.props.maxLength,6000);
    textarea.props.onChange({target:{value:'TEXTO SÓ PARA PDF'}});tree=render();
    const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(new Blob(['%PDF'],{type:'application/pdf'}));};
    try {
      await tree.props.onSubmit({preventDefault(){}});
      assert.equal(calls[0].url,`/api/fleet/client-report?${query}`);
      assert.deepEqual(calls[0].body,{includeObservations:true,observations:[{saleId:'freight:234',text:'TEXTO SÓ PARA PDF'}]});
      assert.equal(generated[0][1],'OS-Central-234.pdf');
      tree=render();find(tree,n=>n.type==='input'&&n.props.type==='radio'&&!n.props.checked).props.onChange();tree=render();
      assert.equal(find(tree,n=>n.type==='textarea'),null);
      await tree.props.onSubmit({preventDefault(){}});assert.deepEqual(calls[1].body,{includeObservations:false,observations:[]});
      assert.equal(report.rows[0].notes,originalNote);assert.equal(report.totals.amountCents,10000);
    } finally {globalThis.fetch=original;}
  }
});

test('diálogo consulta somente a venda da OS e rejeita resposta com várias vendas', () => {
  const context={clientId:'client',from:'2026-10-09',to:'2026-10-09',rowId:'freight:234'};
  for (const rows of [[{id:'freight:234'}],[{id:'freight:225'},{id:'freight:234'}],[{id:'freight:225'}]]) {
    const urls=[];
    const {OrderObservationsDialog,OrderObservationForm}=compile('components/order-observations-dialog.tsx',{
      './ui':ui,'./fleet-client-report.module.css':{default:{}},'@/lib/format':format,
      './use-api':{useApi:url=>{urls.push(url);return {loading:false,data:{report:{rows}}};}},
    });
    const tree=OrderObservationsDialog({context,onClose:()=>{},onGenerated:()=>{}});
    assert.equal(new URL(urls[0],'http://local').searchParams.get('rowId'),'freight:234');
    assert.equal(Boolean(find(tree,n=>n.type===OrderObservationForm)),rows.length===1&&rows[0].id===context.rowId);
  }
});


test('relatório gera prévia com todas as OS salvas pelo filtro consultado e permite imprimir ou salvar', async () => {
  const state=hooks(['client','2026-10-01','2026-10-31','clientId=client&from=2026-10-01&to=2026-10-31']);
  const report={client:{name:'CLIENTE'},from:'2026-10-01',to:'2026-10-31',totals:{sales:1,vehicles:1,amountCents:10000,receivedCents:0,balanceCents:10000},rows:[{id:'freight:234',saleNumber:'234',vehicles:[],receivedDates:[],notes:''}]};
  const {FleetClientReportPanel}=compile('components/fleet-client-report.tsx',{
    react:state.react,'./fleet-report-sale-detail':{FleetReportSaleDetail:()=>null},'./icons':{Icons:new Proxy({},{get:()=>icon})},'./ui':ui,
    './fleet-client-report.module.css':{default:{}},'@/lib/format':format,'@/lib/domain/dates':{currentCompetency:()=>'2026-10',todaySaoPaulo:()=>'2026-10-21'},
    './use-api':{useApi:()=>({data:{clients:[],report}})},
  });
  const render=()=>{state.reset();return FleetClientReportPanel();};let tree=render();const calls=[];assert.equal(find(tree,n=>n.type==='input'&&n.props.type==='checkbox'),null);assert.ok(!find(tree,n=>n.type==='a'&&n.props.children==='Exportar Excel').props.href.includes('includeProviders'));
  const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(new Blob(['%PDF'],{type:'application/pdf'}));};
  try {
    await find(tree,n=>n.type==='button'&&n.props.children==='Gerar relatório de vendas').props.onClick();tree=render();
    assert.deepEqual(calls,[{url:'/api/fleet/client-report?clientId=client&from=2026-10-01&to=2026-10-31',body:{useOrderObservations:true,includeProviders:false}}]);
    const modal=find(tree,n=>n.type===ui.Modal);assert.equal(modal.props.open,true);
    const preview=find(modal,n=>n.type==='iframe').props.src;assert.ok(preview.startsWith('blob:'));
    assert.equal(find(modal,n=>n.type==='a'&&n.props.children==='Visualizar / imprimir').props.href,preview);
    assert.equal(find(modal,n=>n.type==='a'&&n.props.children==='Salvar PDF').props.download,'Relatorio-Vendas-Frota-2026-10-01-2026-10-31.pdf');
    modal.props.onClose();tree=render();assert.equal(find(tree,n=>n.type===ui.Modal).props.open,false);
    URL.revokeObjectURL(preview);
  } finally {globalThis.fetch=original;}
});

test('observação salva na OS volta preenchida e habilitada ao reabrir', () => {
  const state=hooks();const {OrderObservationForm}=compile('components/order-observations-dialog.tsx',{
    react:state.react,'./ui':ui,'./fleet-client-report.module.css':{default:{}},'./use-api':{},'@/lib/format':format,
  });
  const tree=OrderObservationForm({report:{client:{name:'CLIENTE'},rows:[{id:'freight:234',saleNumber:'234',notes:'NOTA DA VENDA',orderObservation:'NOTA SALVA NA OS',orderIncludeObservation:true}]},query:'rowId=freight:234',onClose:()=>{},onGenerated:()=>{}});
  const text=find(tree,n=>n.type==='textarea');assert.equal(text.props.value,'NOTA SALVA NA OS');assert.equal(text.props.disabled,false);
});


test('formulário Frota remove hodômetro e abastecimento, posiciona CTE e avarias e preserva valores antigos ao editar', async () => {
  const state=hooks();const noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
  const source=readFileSync(new URL('../components/fleet-freight-form-screen.tsx',import.meta.url),'utf8');
  const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  const calls=[];
  Object.assign(overrides,{
    react:state.react,'@/components/ui':ui,'@/lib/format':fullFormat,'@/lib/domain/fleet':fleetDomain,'@/lib/domain/number-input':numberInput,
    '@/lib/domain/operations':operations,'@/lib/domain/fleet-client-report':clientReport,'@/lib/domain/finance':{commissionCents:()=>0},
    '@/lib/domain/dates':{todaySaoPaulo:()=>'2026-10-21'},'@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[{model:'CARRO',plate:'AAA1A11'}]},
    '@/lib/domain/fleet-distance':{effectiveFleetDistance:v=>v.odometerEndMeters-v.odometerStartMeters},
    '@/lib/domain/fuel-input':{fuelInputToInteger:v=>v?fullFormat.moneyInputToCents(v):null},
    '@/components/use-api':{useApi:url=>({data:url==='/api/me'?{user:{id:'admin',role:'ADMIN'}}:{sellers:[]}}),apiMutation:async(url,options)=>{calls.push({url,...options});return {id:'234'};}},
  });
  const {FleetFreightFormScreen}=compile('components/fleet-freight-form-screen.tsx',overrides);
  const freight={id:'234',vehicleId:'truck',driverId:'driver',clientName:'CLIENTE',distanceMeters:10000,odometerStartMeters:100000,odometerEndMeters:110000,
    actualFuelCostCents:12345,fuelLitersMilli:25000,fuelPumpAmountCents:12400,icmsCostCents:1500,cteMdfeCostCents:2000,damagesCostCents:3000,
    freightAmountCents:100000,tollCents:0,driverCommissionCents:0,pickupDate:'2026-10-21',operationalStatus:'EM_ROTA',priority:'NORMAL'};
  const fleet={parameters:fleetDomain.DEFAULT_FLEET_PARAMETERS,vehicles:[{id:'truck',active:true}],drivers:[{id:'driver',active:true}],canEditFreights:true};
  let closed=0;const tree=FleetFreightFormScreen({freight,fleet,onClose:()=>closed++,onSaved:()=>{},onDelete:()=>{}});
  assert.equal(find(tree,n=>n.type===ui.Modal),null);assert.equal(find(tree,n=>n.type==='form').props.className,'form-page');const header=find(tree,n=>n.type===ui.PageHeader);assert.equal(header.props.title,'Editar frete da frota');header.props.actions.props.onClick();assert.equal(closed,1);
  for(const label of ['KM inicial','KM final','Litros abastecidos','Valor bomba (R$)','Valor pago combustível (R$)','ICMS (R$)']) assert.equal(find(tree,n=>n.props?.label===label),null,label);
  const cte=find(tree,n=>n.props?.label==='CTE/MDF (R$)'),damages=find(tree,n=>n.props?.label==='Avarias (R$)');
  assert.ok(cte&&damages);assert.equal(find(cte,n=>n.type==='input').props.value,'20,00');assert.equal(find(damages,n=>n.type==='input').props.value,'30,00');
  const fields=find(tree,n=>n.props?.className==='form-grid four'&&n.props.children[0]?.props.label==='Seguro (R$)');assert.deepEqual(fields.props.children.map(n=>n.props.label),['Seguro (R$)','Nota Fiscal (R$)','CTE/MDF (R$)','Avarias (R$)']);
  const aligned=find(tree,n=>n.props?.className==='form-grid three'&&n.props.children?.[0]?.props?.label==='Distância realizada');
  assert.deepEqual(aligned.props.children.map(n=>n.props.label),['Distância realizada','Pedágio','Motorista / comissão']);
  assert.ok(find(tree,n=>n.props?.mode==='identification'));
  assert.ok(find(tree,n=>n.props?.mode==='costs'));
  const OriginalFormData=globalThis.FormData;globalThis.FormData=class {get(){return null;}};
  try {
    await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
    assert.equal(calls.length,1);const body=JSON.parse(calls[0].body);
    for(const field of ['actualFuelCostCents','fuelLitersMilli','fuelPumpAmountCents','icmsCostCents','cteMdfeCostCents','damagesCostCents','odometerStartMeters','odometerEndMeters']) assert.equal(body[field],freight[field],field);
  } finally {globalThis.FormData=OriginalFormData;}
});

test('vendedor vê editar e novo recebimento somente na própria venda, sem exclusão de recebimentos', () => {
 for (const sellerId of ['seller','other']) {
  const sale={id:'sale',sellerId,saleNumber:'234',saleChannel:'CEGONHA',cargoVehicles:[],costs:[],payments:[],installments:[],attachments:[],financial:{status:'EM_ABERTO'}};
  const {SaleDetailScreen}=compile('components/sale-detail-screen.tsx',{
   '@/lib/domain/permissions':permissions,'@/lib/domain/operations':operations,'@/lib/format':format,
   '@/lib/domain/proof-files':{isProofMimeType:()=>false,automaticProofId:()=>null},'@/components/proof-upload':{ProofUpload:()=>null,UploadButton:()=>null},
   '@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'@/components/ui':ui,
   'next/link':{__esModule:true,default:({href,children})=>React.createElement('a',{href},children)},
   '@/components/use-api':{useApi:url=>({data:url==='/api/me'?{user:{id:'seller',role:'VENDEDOR'}}:{sale}})},
  });
  const html=renderToStaticMarkup(React.createElement(SaleDetailScreen,{id:'sale'}));
  assert.equal(html.includes('href="/vendas/sale/editar"'),sellerId==='seller');
  assert.equal(html.includes('Novo recebimento'),sellerId==='seller');
  assert.equal(html.includes('Excluir recebimento'),false);
 }
});

test('vendedor abre edição e baixa pela própria lista Frota e atualiza detalhes após salvar', () => {
 const state=hooks();let refreshes=0;const urls=[];
 const FreightTable=()=>null,FleetFreightFormScreen=()=>null,detail={id:'234',saleNumber:'234',clientName:'CLIENTE',origin:'A',destination:'B'};
 const {SellerFleetScreen}=compile('components/seller-fleet-screen.tsx',{
  'next/link':{__esModule:true,default:()=>null},'@/components/fleet-freight-table':{FreightTable},'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'@/lib/domain/fleet':fleetDomain,react:state.react,'@/components/fleet-freight-detail':{FleetFreightDetail:()=>null},'@/components/fleet-freight-form-screen':{FleetFreightFormScreen},'@/components/ui':ui,
  '@/components/use-transient-message':{useTransientMessage:()=>[null,()=>{}]},'@/lib/format':format,
  '@/components/use-api':{useApi:url=>{urls.push(url);return {data:url?.startsWith('/api/fleet/freights/options')?{fleet:{canManagePayments:true,canDeleteFreights:false}}:url==='/api/fleet/freights'?{freights:[detail]}:{freight:detail},refresh:()=>refreshes++};}},
 });
 const render=()=>{state.reset();return SellerFleetScreen();};let tree=render();
 assert.equal(find(tree,n=>n.props?.className==='fleet-module').type,'div');assert.ok(find(tree,n=>n.props?.className==='cegonha-tabs module-tabs'));find(tree,n=>n.type===FreightTable).props.onOpen(detail);tree=render();assert.equal(find(tree,n=>n.type===ui.Modal),null);
 find(find(tree,n=>n.type===ui.PageHeader).props.actions,n=>n.type==='button'&&n.props.children==='Editar frete').props.onClick();tree=render();
 const editor=find(tree,n=>n.type===FleetFreightFormScreen);assert.equal(find(tree,n=>n.type===FreightTable),null);assert.equal(find(tree,n=>n.type===ui.PageHeader),null);assert.equal(editor.props.freight.id,'234');assert.equal(editor.props.fleet.canManagePayments,true);assert.equal(editor.props.fleet.canDeleteFreights,false);
 assert.ok(urls.includes('/api/fleet/freights/options?freightId=234'));
 editor.props.onSaved('Pagamento atualizado.');tree=render();assert.equal(find(tree,n=>n.type===FleetFreightFormScreen),null);assert.equal(refreshes,2);
});

test('barra lateral permite edição e configurações pessoais, mas preserva o fechamento restrito', () => {
 for (const role of ['VENDEDOR','OPERACIONAL']) for (const path of ['/vendas/234/editar','/configuracoes','/vendas-gerais','/vendas/fechamento','/clientes']) {
  const state=hooks([false,false,{id:'seller',name:'USUÁRIO',role},true,0]);state.react.useSyncExternalStore=()=>false;
  const marker=React.createElement('div',null,'FORMULÁRIO DA VENDA');const noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
  const src=readFileSync(new URL('../components/app-shell.tsx',import.meta.url),'utf8');const overrides=Object.fromEntries([...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  Object.assign(overrides,{react:state.react,'@/lib/domain/permissions':permissions,'@/components/current-user-context':{CurrentUserContext:React.createContext(null)},'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'next/navigation':{usePathname:()=>path},'next/link':{__esModule:true,default:({children})=>React.createElement('span',null,children)}});
  const {AppShell}=compile('components/app-shell.tsx',overrides);const tree=AppShell({children:marker});
  assert.equal(Boolean(find(tree,n=>n===marker)),path!=='/vendas/fechamento');
 }
});

test('edição do vendedor preserva o status selecionado e permite selecionar o responsável', async () => {
 const state=hooks(),calls=[],noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
 const src=readFileSync(new URL('../components/sale-form-screen.tsx',import.meta.url),'utf8');const overrides=Object.fromEntries([...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
 Object.assign(overrides,{
  react:state.react,'@/lib/domain/permissions':permissions,'@/lib/domain/operations':operations,'@/lib/domain/fleet-client-report':clientReport,'@/lib/format':fullFormat,
  '@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[{model:'CARRO',plate:'AAA1A11',identification:null}]},'@/lib/domain/finance':{commissionCents:()=>700},
  '@/lib/domain/dates':{todaySaoPaulo:()=>'2026-10-22'},'@/components/ui':ui,'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},
  'next/navigation':{useRouter:()=>({push:()=>{},refresh:()=>{}})},'next/link':{__esModule:true,default:noOp},
  '@/components/use-api':{useApi:url=>({data:url==='/api/me'?{user:{id:'seller',role:'VENDEDOR',commissionBasisPoints:700}}:null}),apiMutation:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {id:'234'};}},
 });
 const {SaleFormScreen}=compile('components/sale-form-screen.tsx',overrides);
 const tree=SaleFormScreen({initialSale:{id:'234',sellerId:'seller',sellerName:'VENDEDOR',saleChannel:'CEGONHA',saleNumber:'234',clientId:'client',clientName:'CLIENTE',freightAmountCents:10000,commissionBasisPoints:700,costs:[],installments:[],operationalStatus:'FINALIZADO'}});
 assert.equal(find(tree,n=>n.type==='select'&&n.props.name==='operationalStatus').props.defaultValue,'FINALIZADO');
 assert.ok(find(tree,n=>n.props?.label==='Vendedor'));
 const original=globalThis.FormData;globalThis.FormData=class {get(key){return {operationalStatus:'FINALIZADO',saleDate:'2026-10-22',financialDueDate:'2026-10-30',paymentMethod:'PIX'}[key]??'';}};
 try {await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});assert.equal(calls.length,1);assert.equal(calls[0].body.operationalStatus,'FINALIZADO');assert.equal(calls[0].body.sellerId,'seller');}
 finally {globalThis.FormData=original;}
});

test('configurações mostram troca da própria senha a todos e só ADMIN consulta usuários',()=>{
 const PasswordChangeForm=()=>React.createElement('div',null,'MINHA SENHA');
 for(const role of ['ADMIN','GERENCIA','VENDEDOR','FINANCEIRO','OPERACIONAL']){
  const state=hooks(),urls=[];
  const {SettingsScreen}=compile('components/settings-screen.tsx',{
   react:state.react,'@/components/password-change-form':{PasswordChangeForm},'@/components/ui':ui,'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},
   '@/components/use-transient-message':{useTransientMessage:()=>[null,()=>{}]},
   '@/components/use-api':{apiMutation:async()=>{},useApi:url=>{urls.push(url);return {data:url==='/api/me'?{user:{id:'me',role}}:{users:[]},loading:false};}},
  });
  const html=renderToStaticMarkup(SettingsScreen());assert.ok(html.includes('MINHA SENHA'));
  assert.equal(urls.includes('/api/users'),role==='ADMIN');assert.equal(html.includes('Usuários, senhas e perfis'),role==='ADMIN');
 }
});

test('troca de senha confirma antes do envio, mostra erro e redireciona após sucesso',async()=>{
 const state=hooks(),calls=[],redirects=[];let fail=false;
 const {PasswordChangeForm}=compile('components/password-change-form.tsx',{
  react:state.react,'@/components/ui':ui,'next/navigation':{useRouter:()=>({replace:url=>redirects.push(url)})},
  '@/components/use-api':{apiMutation:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});if(fail)throw new Error('Senha atual incorreta.');}},
 });
 const render=()=>{state.reset();return PasswordChangeForm();};
 let payload={currentPassword:'ATUAL-SOMENTE-LAB',newPassword:'NOVA-SOMENTE-LAB',passwordConfirmation:'DIFERENTE'};
 const original=globalThis.FormData;globalThis.FormData=class{*[Symbol.iterator](){yield*Object.entries(payload);}};
 try{
  let tree=render();assert.equal(find(tree,n=>n.props?.name==='currentPassword').props.autoComplete,'current-password');
  await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});assert.equal(calls.length,0);assert.ok(renderToStaticMarkup(render()).includes('confirmação'));
  payload={...payload,passwordConfirmation:payload.newPassword};fail=true;tree=render();
  await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});assert.ok(renderToStaticMarkup(render()).includes('Senha atual incorreta.'));assert.equal(redirects.length,0);
  fail=false;tree=render();await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
  assert.equal(calls[1].url,'/api/auth/password');assert.deepEqual(calls[1].body,payload);assert.deepEqual(redirects,['/login?passwordChanged=1']);
 }finally{globalThis.FormData=original;}
});

test('operacional permanece em Fretes sem abas removidas ou de administração',()=>{
 const state=hooks();state.react.useMemo=fn=>fn();const noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
 const source=readFileSync(new URL('../components/fleet-screen.tsx',import.meta.url),'utf8');
 const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));const ReportPanel=()=>null;
 Object.assign(overrides,{
  react:state.react,'@/components/ui':ui,'@/lib/format':format,'@/lib/domain/permissions':permissions,
  '@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[]},'@/lib/domain/dates':{currentCompetency:()=>'2026-10'},
  '@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'@/lib/domain/fleet':{FLEET_OPERATIONAL_STATUSES:[],FLEET_PRIORITIES:[]},
  '@/components/use-transient-message':{useTransientMessage:()=>[null,()=>{}]},'@/components/fleet-client-report':{FleetClientReportPanel:ReportPanel},
  '@/components/use-api':{useApi:url=>url==='/api/me'?{data:{user:{role:'OPERACIONAL'}}}:{data:{fleet:{freightOnly:true,canEditFreights:true,freights:[],vehicles:[],drivers:[],summary:{},billing:{freights:[],drivers:[]}}}}},
 });
 const {FleetScreen}=compile('components/fleet-screen.tsx',overrides);const inner=FleetScreen().type,render=()=>{state.reset();return inner();};
 const tree=render();
 for(const label of ['Visão geral','Faturamento','Fechamento mensal','Relatório de vendas'])assert.equal(find(tree,n=>n.type==='button'&&n.props.children===label),null);
 assert.ok(find(tree,n=>n.type==='button'&&n.props.children==='Fretes'));

});

test('comissão envia somente a origem e o ID da venda selecionada',async()=>{
 const state=hooks();state.react.useMemo=fn=>fn();const calls=[];let refreshes=0;
 const commissions=[1,2].map(i=>({sourceKind:i===1?'sale':'freight',saleId:String(i),saleNumber:String(240+i),sellerId:'seller',sellerName:'MESMO VENDEDOR',status:'EM_ABERTO',saleDate:'2026-10-23',competency:'2026-10',totalSalesCents:10000,commissionCents:700,pixDetails:null}));
 const {SellersScreen}=compile('components/sellers-screen.tsx',{
  react:state.react,'@/components/ui':ui,'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'@/lib/format':fullFormat,
  '@/lib/domain/dates':{currentCompetency:()=>'2026-10',todaySaoPaulo:()=>'2026-10-23'},
  '@/components/use-api':{useApi:url=>({data:url==='/api/me'?{user:{role:'ADMIN'}}:{commissions},refresh:()=>refreshes++}),apiMutation:async(url,options)=>calls.push({url,body:JSON.parse(options.body)})},
 });
 const render=()=>{state.reset();return SellersScreen({});};let tree=render();
 find(tree,n=>n.type==='button'&&n.props['aria-label']==='Editar comissão da venda 242 de MESMO VENDEDOR').props.onClick();tree=render();
 assert.ok(find(tree,n=>n.type===ui.Modal).props.description.includes('Venda 242'));
 find(find(tree,n=>n.props?.label==='Situação'),n=>n.type==='select').props.onChange({target:{value:'PAGO'}});tree=render();
 await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(calls.length,1);assert.equal(calls[0].body.sourceKind,'freight');assert.equal(calls[0].body.saleId,'2');assert.equal(calls[0].body.status,'PAGO');assert.equal(calls[0].body.sellerName,undefined);assert.equal(refreshes,1);
});

test('baixa em lote filtra por cliente, usa saldo restante e preserva a chave na repetição após erro',async()=>{
 const state=hooks();state.react.useRef=initial=>{const [ref]=state.react.useState(()=>({current:initial}));return ref;};
 const calls=[];let fail=true,saved=0;
 const {BulkPaymentPanel}=compile('components/bulk-payment-panel.tsx',{
  react:state.react,'./ui':ui,'@/lib/format':fullFormat,'@/lib/domain/dates':{todaySaoPaulo:()=>'2026-10-23'},
  './use-api':{useApi:()=>({data:{user:{role:'FINANCEIRO'}}}),apiMutation:async(url,options)=>{calls.push({url,key:options.headers['idempotency-key'],body:JSON.parse(options.body)});if(fail)throw new Error('Falha transitória.');}},
 });
 const sales=[{id:'sale-a',saleNumber:'240',clientId:'a',clientName:'M1',saleChannel:'CEGONHA',financial:{balanceCents:5000}},{id:'freight:operation-a',saleNumber:'241',clientId:'a',clientName:'M1',saleChannel:'FROTA',financial:{balanceCents:10000}},{id:'other-client',saleNumber:'242',clientId:'b',clientName:'M1',saleChannel:'FROTA',financial:{balanceCents:20000}}];
 const render=()=>{state.reset();return BulkPaymentPanel({sales,onSaved:()=>saved++});};let tree=render();
 find(tree,n=>n.type==='button'&&n.props.children==='Baixa em lote').props.onClick();tree=render();
 find(find(tree,n=>n.props?.label==='Cliente'),n=>n.type==='select').props.onChange({target:{value:'a'}});tree=render();
 assert.equal(find(tree,n=>n.props?.['aria-label']==='Baixar venda 242'),null);
 for(const n of [240,241]){find(tree,c=>c.props?.['aria-label']===`Baixar venda ${n}`).props.onChange({target:{checked:true}});tree=render();}
 await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});tree=render();assert.equal(saved,0);assert.ok(renderToStaticMarkup(tree).includes('Falha transitória.'));
 fail=false;await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
 assert.equal(saved,1);assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);
 assert.deepEqual(calls[1].body.items,[{sourceKind:'sale',id:'sale-a',expectedBalanceCents:5000},{sourceKind:'freight',id:'operation-a',expectedBalanceCents:10000}]);assert.equal(calls[1].body.clientId,'a');
});




test('prestadores: seleção permanece no campo, + abre o próximo e cada valor acompanha seu prestador',()=>{
 const state=hooks(),providers=[{id:'p1',name:'PRESTADOR UM',referenceName:'PEDRO',active:true},{id:'p2',name:'PRESTADOR DOIS',referenceName:'ANA',active:true},{id:'p3',name:'PRESTADOR TRÊS',referenceName:null,active:true}];
 let services=[];const queries=[];
 const {ProviderServicesEditor}=compile('components/provider-services-editor.tsx',{
  react:state.react,'./ui':ui,'@/lib/format':fullFormat,'@/lib/domain/provider-services':{providerKindLabel:k=>k,PROVIDER_SERVICE_KINDS:['COLETA','ENTREGA','OUTRO']},
  './use-api':{useApi:url=>{queries.push(url);return {loading:false,data:{providers}};}}
 });
 const render=(mode='identification')=>{state.reset();return ProviderServicesEditor({services,onChange:rows=>services=rows,mode});};
 const all=(node,match)=>{if(!node||typeof node!=='object')return [];if(Array.isArray(node))return node.flatMap(n=>all(n,match));return [...(match(node)?[node]:[]),...all(node.props?.children,match)];};
 let tree=render();assert.equal(all(tree,n=>n.type==='select').length,1);assert.equal(find(tree,n=>n.props?.['aria-label']==='Adicionar prestador').props.children,'+');
 find(tree,n=>n.type==='select').props.onChange({target:{value:'p1'}});tree=render();const firstId=services[0].id;
 assert.equal(all(tree,n=>n.type==='select').length,1);assert.equal(find(tree,n=>n.type==='select').props.value,'p1');
 find(tree,n=>n.props?.['aria-label']==='Adicionar prestador').props.onClick();tree=render();assert.equal(all(tree,n=>n.type==='select').length,2);
 all(tree,n=>n.type==='select')[1].props.onChange({target:{value:'p2'}});tree=render();assert.equal(services.length,2);assert.equal(services[0].id,firstId);assert.deepEqual(services.map(s=>s.providerId),['p1','p2']);
 let costs=render('costs');assert.equal(queries.at(-1),null);let amounts=all(costs,n=>n.type?.name==='ProviderAmount');assert.equal(amounts.length,2);
 assert.match(amounts[0].props.label,/Prestador 1.*PRESTADOR UM/);amounts[0].props.onChange(1234);costs=render('costs');amounts=all(costs,n=>n.type?.name==='ProviderAmount');amounts[1].props.onChange(5678);assert.deepEqual(services.map(s=>s.amountCents),[1234,5678]);
 tree=render();all(tree,n=>n.type==='select')[0].props.onChange({target:{value:'p3'}});assert.equal(services[0].amountCents,0);assert.equal(services[1].amountCents,5678);
 tree=render();find(tree,n=>n.props?.['aria-label']==='Remover PRESTADOR TRÊS').props.onClick();costs=render('costs');amounts=all(costs,n=>n.type?.name==='ProviderAmount');assert.equal(amounts.length,1);assert.equal(amounts[0].props.row.providerId,'p2');assert.equal(amounts[0].props.row.amountCents,5678);
 tree=render();find(tree,n=>n.props?.['aria-label']==='Remover PRESTADOR DOIS').props.onClick();assert.equal(render('costs'),null);assert.equal(all(render(),n=>n.type==='select').length,1);
});

test('editar frete mantém seleção de vendedor na Frota e Cegonha e envia a troca junto com a edição',async()=>{
 const OriginalFormData=globalThis.FormData;
 globalThis.FormData=class{get(key){return ({saleDate:'2026-10-23',financialDueDate:'2026-10-31',pickupDate:'2026-10-23',origin:'ORIGEM',destination:'DESTINO',vehicleId:'truck',driverId:'driver',operationalStatus:'CONFIRMAR',priority:'NORMAL',paymentMethod:'PIX',serviceSituation:'ENTREGA',notes:'EDITADO JUNTO'})[key]??null;}};
 try{
  for(const kind of ['fleet','sale'])for(const role of ['ADMIN','FINANCEIRO','OPERACIONAL','VENDEDOR']){
   const state=hooks(),calls=[],queries=[],noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
   const file=kind==='fleet'?'components/fleet-freight-form-screen.tsx':'components/sale-form-screen.tsx',source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
   const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
   Object.assign(overrides,{
    react:state.react,'@/components/ui':ui,'@/lib/format':fullFormat,'@/lib/domain/fleet':fleetDomain,'@/lib/domain/number-input':numberInput,
    '@/lib/domain/operations':operations,'@/lib/domain/permissions':permissions,'@/lib/domain/fleet-client-report':clientReport,'@/lib/domain/finance':{commissionCents:()=>0},
    '@/lib/domain/dates':{todaySaoPaulo:()=>'2026-10-23'},'@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[{model:'CARRO',plate:'AAA1A11'}]},
    '@/lib/domain/fleet-distance':{effectiveFleetDistance:v=>v.distanceMeters||0},'@/lib/domain/fuel-input':{fuelInputToInteger:v=>v?fullFormat.moneyInputToCents(v):null},
    'next/navigation':{useRouter:()=>({push:()=>{}})},
    '@/components/use-api':{useApi:url=>{queries.push(url);return {loading:false,data:url==='/api/me'?{user:{id:role==='VENDEDOR'?'owner':role.toLowerCase(),role}}:{sellers:[{id:'owner',name:'ATUAL',commissionBasisPoints:700},{id:'next',name:'NOVO',commissionBasisPoints:350}]}};},apiMutation:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {id:'234',accessTransferred:false};}},
   });
   const exports=compile(file,overrides),record={id:'234',saleNumber:'234',sellerId:'owner',sellerName:'ATUAL',sellerCommissionBasisPoints:700,sellerCommissionOverrideCents:0,commissionBasisPoints:700,commissionOverrideCents:0,saleChannel:'CEGONHA',cargoVehicles:[],costs:[],installments:[],vehicleId:'truck',driverId:'driver',clientId:'client',clientName:'CLIENTE',distanceMeters:10000,freightAmountCents:100000,tollCents:0,driverCommissionCents:0,pickupDate:'2026-10-23',saleDate:'2026-10-23',operationalStatus:'CONFIRMAR',priority:'NORMAL'};
   const fleet={parameters:fleetDomain.DEFAULT_FLEET_PARAMETERS,vehicles:[{id:'truck',active:true}],drivers:[{id:'driver',active:true}],canEditFreights:true};
   const render=()=>{state.reset();return kind==='fleet'?exports.FleetFreightFormScreen({freight:record,fleet,onClose:()=>{},onSaved:()=>{},onDelete:()=>{}}):exports.SaleFormScreen({initialSale:record});};
   let tree=render();let field=find(tree,n=>n.props?.label==='Vendedor');assert.ok(field,kind+role);assert.equal(find(field,n=>n.type==='select').props.value,'owner');
   find(field,n=>n.type==='select').props.onChange({target:{value:'next'}});tree=render();field=find(tree,n=>n.props?.label==='Vendedor');assert.equal(find(field,n=>n.type==='select').props.value,'next');
   assert.ok(queries.includes(['OPERACIONAL','VENDEDOR'].includes(role)?'/api/sales/sellers?assignment=1':'/api/sales/sellers'));
   await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
   assert.equal(calls.length,1,kind+role);assert.equal(calls[0].body.sellerId,'next');assert.equal(calls[0].body.previousSellerId,'owner');assert.equal(calls[0].body.notes,'EDITADO JUNTO');
   if(role!=='ADMIN')assert.equal(Object.hasOwn(calls[0].body,kind==='fleet'?'sellerCommissionOverrideCents':'commissionOverrideCents'),false);
  }
 }finally{globalThis.FormData=OriginalFormData;}
});

test('Relatórios centraliza resultado existente, vendas e prestadores em abas independentes', () => {
 const state=hooks(), Sales=()=>null, Providers=()=>null;
 const source=readFileSync(new URL('../components/general-sales-screen.tsx',import.meta.url),'utf8');
 const mod=new Proxy({},{get:()=>()=>null});
 const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
 Object.assign(overrides,{react:state.react,'./fleet-client-report':{FleetClientReportPanel:Sales},'./provider-report-panel':{ProviderReportPanel:Providers},'@/components/ui':ui});
 const {GeneralSalesScreen}=compile('components/general-sales-screen.tsx',overrides);
 const render=()=>{state.reset();return GeneralSalesScreen();};let tree=render();
 assert.ok(find(tree,n=>n.type?.name==='ExistingSalesReport'));
 find(tree,n=>n.type==='button'&&n.props.children==='Relatório de vendas').props.onClick();tree=render();
 assert.ok(find(tree,n=>n.type===Sales));assert.equal(find(tree,n=>n.type===Providers),null);
 find(tree,n=>n.type==='button'&&n.props.children==='Relatório de prestadores').props.onClick();tree=render();assert.ok(find(tree,n=>n.type===Providers));
 find(tree,n=>n.type==='button'&&n.props.children==='Fechamento / resultado').props.onClick();tree=render();assert.ok(find(tree,n=>n.type?.name==='ExistingSalesReport'));
});

test('prestadores gera prévia sem baixar, permite imprimir e salvar e mostra falha da geração', async()=>{
 const state=hooks();const {ReportPreviewButton}=compile('components/report-preview-button.tsx',{react:state.react,'./ui':ui});
 const render=()=>{state.reset();return ReportPreviewButton({url:'/api/reports/providers?from=2026-10-01&to=2026-10-31&format=pdf',filename:'prestadores.pdf',label:'Gerar relatório de prestadores'});};
 const previous=globalThis.fetch,calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return new Response(new Blob(['%PDF'],{type:'application/pdf'}));};
 let preview;
 try{let tree=render();assert.equal(find(tree,n=>n.type===ui.Modal).props.open,false);await find(tree,n=>n.type==='button').props.onClick();tree=render();const modal=find(tree,n=>n.type===ui.Modal);assert.equal(modal.props.open,true);preview=find(modal,n=>n.type==='iframe').props.src;assert.ok(preview.startsWith('blob:'));assert.equal(find(modal,n=>n.type==='a'&&n.props.children==='Visualizar / imprimir').props.href,preview);assert.equal(find(modal,n=>n.type==='a'&&n.props.children==='Salvar PDF').props.download,'prestadores.pdf');assert.equal(calls[0].options.credentials,'same-origin');modal.props.onClose();tree=render();assert.equal(find(tree,n=>n.type===ui.Modal).props.open,false);globalThis.fetch=async()=>new Response(JSON.stringify({error:'Falha de exemplo'}),{status:500});await find(tree,n=>n.type==='button').props.onClick();tree=render();assert.equal(find(tree,n=>n.props?.role==='alert').props.children,'Falha de exemplo');assert.equal(find(tree,n=>n.type===ui.Modal).props.open,false);}finally{globalThis.fetch=previous;if(preview)URL.revokeObjectURL(preview);}
});

test('prestadores mostra dados da venda, usa filtros aplicados na prévia e abre detalhes preservando consulta',()=>{
 const state=hooks(['2026-10-01','2026-10-31','provider','from=2026-10-01&to=2026-10-31&providerId=provider']);
 const Preview=()=>null,Detail=()=>null;
 const row={id:'service',freightId:'freight',saleNumber:'234',createdDate:'2026-10-24',date:'2026-10-26',clientName:'CLIENTE',driverName:'MOTORISTA',vehicles:[{model:'FIAT STRADA',plate:'AAA1A11'}],serviceSituation:'ENTREGA',saleAmountCents:150000,paymentStatus:'PAGO',paidAt:'2026-10-26',orderIncludeObservation:true,orderObservation:'OBSERVAÇÃO SALVA',providerName:'PRESTADOR',kind:'COLETA',amountCents:12345};
 const {ProviderReportPanel}=compile('components/provider-report-panel.tsx',{
  react:state.react,'./report-preview-button':{ReportPreviewButton:Preview},'./fleet-report-sale-detail':{FleetReportSaleDetail:Detail},'./icons':{Icons:{chevron:icon}},'./ui':ui,
  '@/lib/domain/provider-services':{providerKindLabel:String},'@/lib/domain/dates':{currentCompetency:()=> '2026-10',todaySaoPaulo:()=> '2026-10-26'},'@/lib/format':fullFormat,
  './use-api':{useApi:url=>({data:url==='/api/providers'?{providers:[]}:{report:{from:'2026-10-01',to:'2026-10-31',totalCents:12345,providers:[],rows:[row]}}})},
 });
 const render=()=>{state.reset();return ProviderReportPanel();};let tree=render();
 const html=renderToStaticMarkup(tree);for(const text of ['MOTORISTA','FIAT STRADA','AAA1A11','ENTREGA','OBSERVAÇÃO SALVA'])assert.ok(html.includes(text),text);
 const preview=find(tree,n=>n.type===Preview);assert.equal(preview.props.label,'Gerar relatório de prestadores');assert.equal(preview.props.url,'/api/reports/providers?from=2026-10-01&to=2026-10-31&providerId=provider&format=pdf');
 find(tree,n=>n.props?.['aria-label']==='Abrir venda 234').props.onClick();tree=render();assert.equal(tree.type,Detail);assert.equal(tree.props.id,'freight:freight');tree.props.onBack();tree=render();assert.equal(find(tree,n=>n.type===Preview).props.url,preview.props.url);
});

test('detalhes da Frota mostram frete retorno aproveitado somente quando marcado',()=>{
 const {FleetFreightDetail}=compile('components/fleet-freight-detail.tsx',{
  '@/lib/domain/provider-services':{providerCostCents:()=>0,providerKindLabel:String},'@/lib/domain/operations':operations,
  '@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[]},'@/lib/domain/fleet':fleetDomain,'@/lib/format':format,'@/components/ui':ui,
 });
 const freight={distanceMeters:1000,providerServices:[],cargoVehicles:[],fuelCostSource:'ESTIMADO',freightAmountCents:10000,notes:'',totalCostCents:0,netRevenueCents:10000};
 for(const marked of [true,false]){const html=renderToStaticMarkup(React.createElement(FleetFreightDetail,{freight:{...freight,returnFreight:marked}}));assert.equal(html.includes('Frete retorno aproveitado'),marked);if(marked)assert.ok(html.indexOf('Frete retorno aproveitado')<html.indexOf('Observações'));}
});

test('criação permite ao vendedor selecionar outro responsável sem consultar sua comissão',async()=>{
 const OriginalFormData=globalThis.FormData;
 globalThis.FormData=class{get(key){return ({saleDate:'2026-10-23',financialDueDate:'2026-10-31',pickupDate:'2026-10-23',origin:'ORIGEM',destination:'DESTINO',vehicleId:'truck',driverId:'driver',operationalStatus:'CONFIRMAR',priority:'NORMAL',paymentMethod:'PIX',serviceSituation:'ENTREGA',notes:'EDITADO JUNTO'})[key]??null;}};
 try{
  for(const kind of ['fleet','sale'])for(const role of ['VENDEDOR']){
   const state=hooks(),calls=[],queries=[],noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
   const file=kind==='fleet'?'components/fleet-freight-form-screen.tsx':'components/sale-form-screen.tsx',source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
   const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
   Object.assign(overrides,{
    react:state.react,'@/components/ui':ui,'@/lib/format':fullFormat,'@/lib/domain/fleet':fleetDomain,'@/lib/domain/number-input':numberInput,
    '@/lib/domain/operations':operations,'@/lib/domain/permissions':permissions,'@/lib/domain/fleet-client-report':clientReport,'@/lib/domain/finance':{commissionCents:()=>0},
    '@/lib/domain/dates':{todaySaoPaulo:()=>'2026-10-23'},'@/lib/domain/cargo-vehicles':{cargoVehiclesOrLegacy:()=>[{model:'CARRO',plate:'AAA1A11'}]},
    '@/lib/domain/fleet-distance':{effectiveFleetDistance:v=>v.distanceMeters||0},'@/lib/domain/fuel-input':{fuelInputToInteger:v=>v?fullFormat.moneyInputToCents(v):null},
    'next/navigation':{useRouter:()=>({push:()=>{}})},
    '@/components/use-api':{useApi:url=>{queries.push(url);return {loading:false,data:url==='/api/me'?{user:{id:role==='VENDEDOR'?'owner':role.toLowerCase(),role}}:{sellers:[{id:'owner',name:'ATUAL',commissionBasisPoints:700},{id:'next',name:'NOVO',commissionBasisPoints:350}]}};},apiMutation:async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {id:'234',accessTransferred:false};}},
   });
   const exports=compile(file,overrides);
   const fleet={parameters:fleetDomain.DEFAULT_FLEET_PARAMETERS,vehicles:[{id:'truck',active:true}],drivers:[{id:'driver',active:true}],canEditFreights:true};
   const render=()=>{state.reset();return kind==='fleet'?exports.FleetFreightFormScreen({freight:null,fleet,onClose:()=>{},onSaved:()=>{},onDelete:()=>{}}):exports.SaleFormScreen({});};
   let tree=render();let field=find(tree,n=>n.props?.label==='Vendedor');assert.ok(field,kind+role);assert.equal(find(field,n=>n.type==='select').props.value,'owner');
   find(field,n=>n.type==='select').props.onChange({target:{value:'next'}});tree=render();field=find(tree,n=>n.props?.label==='Vendedor');assert.equal(find(field,n=>n.type==='select').props.value,'next');
   assert.ok(queries.includes(['OPERACIONAL','VENDEDOR'].includes(role)?'/api/sales/sellers?assignment=1':'/api/sales/sellers'));
   assert.equal(find(tree,n=>n.props?.label==='Valor da comissão (R$)'),null);

  }
 }finally{globalThis.FormData=OriginalFormData;}
});

test('Cegonha abre com últimas cadastradas e Frota preserva sua ordenação padrão',()=>{
 for(const channel of ['CEGONHA','FROTA']){
  const state=hooks();state.react.useMemo=fn=>fn();const urls=[],mod=new Proxy({},{get:()=>()=>null});
  const source=readFileSync(new URL('../components/sales-screen.tsx',import.meta.url),'utf8');const overrides=Object.fromEntries([...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  Object.assign(overrides,{react:state.react,'@/components/ui':ui,'@/lib/format':format,'@/lib/domain/operations':operations,'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'@/components/use-api':{useApi:url=>{urls.push(url);return {data:{sales:[]}};}}});
  const {SalesScreen}=compile('components/sales-screen.tsx',overrides);const tree=SalesScreen({initialCompetency:'2026-10',initialFinancialStatus:'',saleChannel:channel});
  const expected=channel==='CEGONHA'?'created-desc':'number-asc';assert.equal(new URL(urls[0],'https://example.test').searchParams.get('sort'),expected);assert.ok(find(tree,n=>n.type==='select'&&n.props.value===expected));
 }
});

test('todos os perfis editam identificação, contatos e endereços; excluir continua só para ADMIN',async()=>{
 const originalForm=globalThis.FormData;
 try{for(const role of ['ADMIN','GERENCIA','VENDEDOR','OPERACIONAL','FINANCEIRO']){
  const state=hooks(),calls=[],client={id:'client',type:'PJ',legalName:'NOME ANTERIOR',tradeName:'FANTASIA',cpfCnpj:'12345678000199',stateRegistration:'ISENTO',active:true,saleChannel:'AMBOS',summary:{},contacts:[{id:'contact',name:'CONTATO',email:'old@example.test'}],addresses:[{id:'address',type:'EMPRESA',city:'CIDADE',state:'SP'}]};
  const {ClientDetailScreen}=compile('components/client-detail-screen.tsx',{react:state.react,'@/components/registry-fields':{AddressFields:()=>null,ClientChannelSelect:()=>null},'next/link':{__esModule:true,default:()=>null},'next/navigation':{useRouter:()=>({replace:()=>{},refresh:()=>{}})},'@/lib/format':format,'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'@/components/ui':ui,'@/components/use-api':{useApi:url=>({data:url==='/api/me'?{user:{role}}:{client,sales:[]},refresh:()=>{}}),apiMutation:async(url,options)=>calls.push({url,body:JSON.parse(options.body)})}});
  const render=()=>{state.reset();return ClientDetailScreen({id:'client'});};let tree=render();const edit=find(find(tree,n=>n.type===ui.PageHeader).props.actions,n=>n.props?.['aria-label']==='Editar cliente');assert.equal(Boolean(edit),true);
  edit.props.onClick();tree=render();const modal=find(tree,n=>n.type===ui.Modal&&n.props.title==='Editar cliente');assert.equal(modal.props.open,true);assert.equal(find(modal,n=>n.type==='input'&&n.props.name==='legalName').props.defaultValue,'NOME ANTERIOR');assert.ok(find(modal,n=>n.props?.name==='contact_contact_phone'));assert.ok(find(modal,n=>n.props?.name==='address_address_city'));assert.equal(Boolean(find(modal,n=>n.type==='button'&&n.props.onClick?.name==='deleteClient')),role==='ADMIN');
  globalThis.FormData=class{get(key){return {legalName:'NOVO NOME',type:'PJ',saleChannel:'AMBOS',active:'true',contact_contact_name:'NOVO CONTATO',contact_contact_phone:'11999999999',address_address_type:'EMPRESA',address_address_city:'NOVA CIDADE',address_address_state:'SP'}[key]??'';}};
  await find(modal,n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});assert.equal(calls[0].body.legalName,'NOVO NOME');assert.equal(calls[0].body.contacts[0].id,'contact');assert.equal(calls[0].body.contacts[0].phone,'11999999999');assert.equal(calls[0].body.addresses[0].id,'address');assert.equal(calls[0].body.addresses[0].city,'NOVA CIDADE');
 }}finally{globalThis.FormData=originalForm;}
});


test('todos os perfis acessam a aba Clientes e seus detalhes',()=>{
 for(const role of ['ADMIN','GERENCIA','VENDEDOR','FINANCEIRO','OPERACIONAL'])for(const path of ['/clientes','/clientes/client']){
  const state=hooks([false,false,{id:'user',name:'USUÁRIO',role},true,0]);const marker=React.createElement('div',null,'CADASTRO DE CLIENTES'),noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
  const src=readFileSync(new URL('../components/app-shell.tsx',import.meta.url),'utf8');const overrides=Object.fromEntries([...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  Object.assign(overrides,{react:state.react,'@/lib/domain/permissions':permissions,'@/components/current-user-context':{CurrentUserContext:React.createContext(null)},'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'next/navigation':{usePathname:()=>path},'next/link':{__esModule:true,default:({children})=>React.createElement('span',null,children)}});
  const {AppShell}=compile('components/app-shell.tsx',overrides);const tree=AppShell({children:marker});assert.ok(find(tree,n=>n===marker));assert.ok(find(tree,n=>n.props?.href==='/clientes'));
 }
});
