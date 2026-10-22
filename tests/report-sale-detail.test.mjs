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
  const render=()=>{state.reset();return FleetClientReportPanel();};let tree=render();const calls=[];
  const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return new Response(new Blob(['%PDF'],{type:'application/pdf'}));};
  try {
    await find(tree,n=>n.type==='button'&&n.props.children==='Gerar relatório de vendas').props.onClick();tree=render();
    assert.deepEqual(calls,[{url:'/api/fleet/client-report?clientId=client&from=2026-10-01&to=2026-10-31',body:{useOrderObservations:true}}]);
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
  const source=readFileSync(new URL('../components/fleet-freight-modal.tsx',import.meta.url),'utf8');
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
  const {FreightModal}=compile('components/fleet-freight-modal.tsx',overrides);
  const freight={id:'234',vehicleId:'truck',driverId:'driver',clientName:'CLIENTE',distanceMeters:10000,odometerStartMeters:100000,odometerEndMeters:110000,
    actualFuelCostCents:12345,fuelLitersMilli:25000,fuelPumpAmountCents:12400,icmsCostCents:1500,cteMdfeCostCents:2000,damagesCostCents:3000,
    freightAmountCents:100000,tollCents:0,driverCommissionCents:0,pickupDate:'2026-10-21',operationalStatus:'EM_ROTA',priority:'NORMAL'};
  const fleet={parameters:fleetDomain.DEFAULT_FLEET_PARAMETERS,vehicles:[{id:'truck',active:true}],drivers:[{id:'driver',active:true}],canEditFreights:true};
  const tree=FreightModal({freight,fleet,onClose:()=>{},onSaved:()=>{},onDelete:()=>{}});
  for(const label of ['KM inicial','KM final','Litros abastecidos','Valor bomba (R$)','Valor pago combustível (R$)','ICMS (R$)']) assert.equal(find(tree,n=>n.props?.label===label),null,label);
  const cte=find(tree,n=>n.props?.label==='CTE/MDF (R$)'),damages=find(tree,n=>n.props?.label==='Avarias (R$)');
  assert.ok(cte&&damages);assert.equal(find(cte,n=>n.type==='input').props.value,'20,00');assert.equal(find(damages,n=>n.type==='input').props.value,'30,00');
  const fields=find(tree,n=>n.props?.className==='form-grid four'&&n.props.children[0]?.props.label==='Seguro (R$)');assert.deepEqual(fields.props.children.map(n=>n.props.label),['Seguro (R$)','Nota Fiscal (R$)','CTE/MDF (R$)','Avarias (R$)']);
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
 const FreightModal=()=>null,detail={id:'234',saleNumber:'234',clientName:'CLIENTE',origin:'A',destination:'B'};
 const {SellerFleetScreen}=compile('components/seller-fleet-screen.tsx',{
  react:state.react,'@/components/fleet-freight-detail':{FleetFreightDetail:()=>null},'@/components/fleet-freight-modal':{FreightModal},'@/components/ui':ui,
  '@/components/use-transient-message':{useTransientMessage:()=>[null,()=>{}]},'@/lib/format':format,
  '@/components/use-api':{useApi:url=>{urls.push(url);return {data:url?.startsWith('/api/fleet/freights/options')?{fleet:{canManagePayments:true,canDeleteFreights:false}}:url==='/api/fleet/freights'?{freights:[detail]}:{freight:detail},refresh:()=>refreshes++};}},
 });
 const render=()=>{state.reset();return SellerFleetScreen();};let tree=render();
 find(tree,n=>n.type==='button'&&n.props.children==='Ver detalhes').props.onClick();tree=render();
 find(tree,n=>n.type==='button'&&n.props.children==='Editar / dar baixa').props.onClick();tree=render();
 const editor=find(tree,n=>n.type===FreightModal);assert.equal(editor.props.freight.id,'234');assert.equal(editor.props.fleet.canManagePayments,true);assert.equal(editor.props.fleet.canDeleteFreights,false);
 assert.ok(urls.includes('/api/fleet/freights/options?freightId=234'));
 editor.props.onSaved('Pagamento atualizado.');tree=render();assert.equal(find(tree,n=>n.type===FreightModal),null);assert.equal(refreshes,2);
});

test('barra lateral permite edição e configurações pessoais, mas preserva o fechamento restrito', () => {
 for (const role of ['VENDEDOR','OPERACIONAL']) for (const path of ['/vendas/234/editar','/configuracoes','/vendas-gerais','/vendas/fechamento']) {
  const state=hooks([false,false,{id:'seller',name:'USUÁRIO',role},true,0]);state.react.useSyncExternalStore=()=>false;
  const marker=React.createElement('div',null,'FORMULÁRIO DA VENDA');const noOp=()=>null,mod=new Proxy({},{get:()=>noOp});
  const src=readFileSync(new URL('../components/app-shell.tsx',import.meta.url),'utf8');const overrides=Object.fromEntries([...src.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>[m[1],mod]));
  Object.assign(overrides,{react:state.react,'@/lib/domain/permissions':permissions,'@/components/current-user-context':{CurrentUserContext:React.createContext(null)},'@/components/icons':{Icons:new Proxy({},{get:()=>icon})},'next/navigation':{usePathname:()=>path},'next/link':{__esModule:true,default:({children})=>React.createElement('span',null,children)}});
  const {AppShell}=compile('components/app-shell.tsx',overrides);const tree=AppShell({children:marker});
  assert.equal(Boolean(find(tree,n=>n===marker)),path!=='/vendas/fechamento');
 }
});

test('edição do vendedor envia o status selecionado sem reabrir a venda ou mostrar troca de vendedor', async () => {
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
 assert.equal(find(tree,n=>n.props?.label==='Vendedor'),null);
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

test('operacional encontra relatório na Frota e continua sem abas de administração',()=>{
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
 let tree=render();const button=find(tree,n=>n.type==='button'&&n.props.children==='Relatório de vendas');assert.ok(button);
 for(const label of ['Visão geral','Faturamento','Fechamento mensal'])assert.equal(find(tree,n=>n.type==='button'&&n.props.children===label),null);
 button.props.onClick();tree=render();assert.ok(find(tree,n=>n.type===ReportPanel));
});
