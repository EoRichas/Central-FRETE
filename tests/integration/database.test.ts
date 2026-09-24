import assert from 'node:assert/strict';
import { test, before, after, mock } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { toPostgresSql, normalizeDatabaseValue } from '../../lib/server/postgres-sql.ts';

const pg = new PGlite();
class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }
async function queryAll(query: string, params: unknown[] = []) {
 const result = await pg.query(toPostgresSql(query), params);
 return result.rows.map(row => normalizeDatabaseValue(row));
}
async function queryFirst(query: string, params: unknown[] = []) { return (await queryAll(query, params))[0] ?? null; }
function prepare(query: string, params: unknown[] = []) {
 return { query, params, bind: (...values: unknown[]) => prepare(query, values), all: async () => ({results: await queryAll(query, params), success: true}), run: async () => ({results: await queryAll(query, params), success: true}) };
}
const stored = new Map<string, ArrayBuffer>();
const storedTypes = new Map<string, string>();
const bucket = {
 put: async (key: string, data: ArrayBuffer, options?: {httpMetadata?: {contentType?: string}}) => { stored.set(key, data); storedTypes.set(key, options?.httpMetadata?.contentType ?? 'application/octet-stream'); },
 delete: async (key: string) => stored.delete(key),
 get: async (key: string) => stored.has(key) ? {body: stored.get(key), writeHttpMetadata: (headers: Headers) => headers.set('content-type',storedTypes.get(key)!)} : null,
};
mock.module('../../lib/server/d1.ts', { namedExports: {
 ApiError, queryAll, queryFirst, getBucket: async () => bucket,
 getD1: async () => ({prepare, batch: async (statements: ReturnType<typeof prepare>[]) => pg.transaction(async tx => {
  const results = [];
  for (const s of statements) results.push({success: true, results: (await tx.query(toPostgresSql(s.query), s.params)).rows.map(normalizeDatabaseValue)});
  return results;
 })}),
 jsonError: (error: unknown) => Response.json({error: error instanceof Error ? error.message : 'Error'}, {status: error instanceof ApiError ? error.status : 500}),
}});

before(async () => {
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 for (let pass = 0; pass < 2; pass++) for (const file of ['001_central_frete_postgres.sql', '002_fleet.sql', '003_fleet_billing.sql', '004_operational_role.sql', '005_detach_driver_vehicle.sql', '006_fleet_vehicle_cost_average_flag.sql', '008_fleet_results.sql', '009_direct_paid_operation_costs.sql', '010_fleet_cargo_sales_orders.sql', '011_sale_origin_location_type.sql', '../supabase/migrations/20260923220518_fleet_operation_integrity.sql']) await pg.exec(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
 await pg.exec("INSERT INTO users(id,email,name,role) VALUES ('admin','admin@example.test','Admin','ADMIN'),('finance','finance@example.test','Finance','FINANCEIRO'),('seller','seller@example.test','Seller','VENDEDOR');");
 process.env.CENTRAL_FRETE_SESSION_SECRET = 'test-secret-never-use-in-production-1234';
});
after(async () => { mock.restoreAll(); await pg.close(); });

async function request(path: string, role = 'admin', method = 'GET', body?: object | FormData) {
 const { createUserSessionToken } = await import('../../lib/server/local-session.ts');
 const token = await createUserSessionToken({id: role, email: `${role}@example.test`, username: role, name: role});
 return new Request(`https://example.test${path}`, {method, headers: {cookie: `cf_local_session=${token}`, ...(body && !(body instanceof FormData) ? {'Content-Type': 'application/json'} : {})}, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined});
}

test('migrações rodam duas vezes e novas tabelas não expõem dados anonimamente', async () => {
 const tables = await queryAll("select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('billing_periods','billing_payments','billing_email_outbox','fleet_attachments')");
 assert.equal(tables.length,4); assert.ok(tables.every(t => (t as {rowsecurity: boolean}).rowsecurity));
 const grants = await queryAll("select * from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('billing_periods','billing_payments','billing_email_outbox','fleet_attachments')");
 assert.equal(grants.length,0);
});

test('cadastro normaliza CPF, permite homônimos, desatrela motorista e preserva veículo com fretes', async () => {
 const drivers = await import('../../app/api/fleet/drivers/route.ts');
 const vehicles = await import('../../app/api/fleet/vehicles/[id]/route.ts');
 await pg.exec("INSERT INTO fleet_vehicles(id,plate) VALUES ('vehicle','ABC1D23');");
 const payload = {name:'Motorista Teste', cpf:'529.982.247-25', address:'Rua de Teste 1', phone:'(11) 99999-9999', vehicleId:'vehicle', active:true};
 const result = await drivers.POST(await request('/api/fleet/drivers','admin','POST',payload));
 assert.equal(result.status,201, await result.clone().text());
 const created = await result.json();
 const driver = await queryFirst('select cpf, vehicle_id from fleet_drivers where id = ?', [created.id]) as {cpf: string; vehicle_id: string | null};
 assert.equal(driver.cpf,'52998224725');
 assert.equal(driver.vehicle_id,null);
 const duplicate = await drivers.POST(await request('/api/fleet/drivers','admin','POST',payload));
 assert.notEqual(duplicate.status,201);
 const homonym = await drivers.POST(await request('/api/fleet/drivers','admin','POST',{...payload, cpf:'111.444.777-35'}));
 assert.equal(homonym.status,201, await homonym.clone().text());
 // The historical freight protects the vehicle; drivers no longer have a permanent vehicle link.
 await pg.query("INSERT INTO fleet_freights(id,vehicle_id,vehicle_plate,driver_id,driver_name,client_name,origin,destination,pickup_date,operational_status,freight_amount_cents,distance_meters) VALUES ('linked-freight','vehicle','ABC1D23',$1,'MOTORISTA TESTE','CLIENTE','A','B','2026-09-01','SEM_PREVISAO',1000,1000)", [created.id]);
 const deleteResult = await vehicles.DELETE(await request('/api/fleet/vehicles/vehicle','admin','DELETE'), {params: Promise.resolve({id:'vehicle'})});
 assert.equal(deleteResult.status,409, await deleteResult.clone().text());
 assert.ok(await queryFirst("select id from fleet_vehicles where id='vehicle'"));
});

test('financeiro confirma frete somente com comprovante dele e data; vendedor não pode confirmar', async () => {
 await pg.exec("INSERT INTO fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,operational_status,freight_amount_cents,distance_meters) VALUES ('freight','ABC1D23','TESTE','CLIENTE','A','B','2026-09-01','SEM_PREVISAO',1000,1000)");
 const payment = await import('../../app/api/fleet/freights/[id]/payment/route.ts');
 const upload = await import('../../app/api/fleet/freights/[id]/attachments/route.ts');
 const context = {params: Promise.resolve({id:'freight'})};
 assert.equal((await payment.PATCH(await request('/api/fleet/freights/freight/payment','seller','PATCH',{status:'PAGO'}),context)).status,403);
 assert.equal((await payment.PATCH(await request('/api/fleet/freights/freight/payment','finance','PATCH',{status:'PAGO'}),context)).status,400);
 const invalid = new FormData(); invalid.set('file',new File(['fake'],'fake.pdf',{type:'application/pdf'}));
 assert.equal((await upload.POST(await request('/api/fleet/freights/freight/attachments','finance','POST',invalid),context)).status,400);
 const file = new FormData(); file.set('file',new File(['%PDF-1.4\n%%EOF'],'proof.pdf',{type:'application/pdf'}));
 const uploaded = await upload.POST(await request('/api/fleet/freights/freight/attachments','finance','POST',file),context);
 assert.equal(uploaded.status,201,await uploaded.clone().text());
 const proof = await uploaded.json();
 const result = await payment.PATCH(await request('/api/fleet/freights/freight/payment','finance','PATCH',{status:'PAGO',proofId:proof.id,paidAt:'2026-09-09'}),context);
 assert.equal(result.status,200,await result.clone().text());
 assert.equal((await queryFirst("select payment_status from fleet_freights where id='freight'") as {payment_status: string}).payment_status,'PAGO');
 assert.equal((await queryFirst("select paid_at from fleet_freights where id='freight'") as {paid_at: string}).paid_at,'2026-09-09T15:00:00.000Z');
});

test('acesso independe de licença antiga e mantém sessão, usuário ativo e perfis', async () => {
 const {authorize} = await import('../../lib/server/auth.ts');
 const me = await import('../../app/api/me/route.ts');
 const previousEnabled = process.env.BILLING_ENABLED;
 const previousFirst = process.env.BILLING_FIRST_COMPETENCY;
 process.env.BILLING_ENABLED = 'true';
 process.env.BILLING_FIRST_COMPETENCY = '2020-01';
 const originalFetch = globalThis.fetch;
 globalThis.fetch = async () => { throw new Error('O acesso não deve chamar provedores externos.'); };
 await pg.exec('BEGIN;');
 try {
  // No billing tables are needed, even with obsolete production flags enabled.
  await pg.exec('DROP TABLE billing_email_outbox, billing_payments, billing_periods;');
  await pg.exec("INSERT INTO users(id,email,name,role,active) VALUES ('manager','manager@example.test','Manager','GERENCIA',1),('operator','operator@example.test','Operator','OPERACIONAL',1),('inactive','inactive@example.test','Inactive','ADMIN',0);");
  for (const id of ['admin','finance','seller','manager','operator']) {
   assert.equal((await authorize(await request('/api/fleet',id))).id,id);
   const response = await me.GET(await request('/api/me',id));
   assert.equal(response.status,200,await response.clone().text());
   const payload = await response.json();
   assert.equal(payload.user.id,id);
   assert.equal('license' in payload,false);
   assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  assert.equal((await me.GET(new Request('https://example.test/api/me'))).status,401);
  assert.equal((await me.GET(await request('/api/me','missing'))).status,401);
  assert.equal((await me.GET(await request('/api/me','inactive'))).status,403);
  await assert.rejects(authorize(await request('/api/fleet/settings','seller'),['ADMIN','GERENCIA']),
   (error: unknown) => error instanceof ApiError && error.status === 403);
 } finally {
  await pg.exec('ROLLBACK;');
  globalThis.fetch = originalFetch;
  if (previousEnabled === undefined) delete process.env.BILLING_ENABLED;
  else process.env.BILLING_ENABLED = previousEnabled;
  if (previousFirst === undefined) delete process.env.BILLING_FIRST_COMPETENCY;
  else process.env.BILLING_FIRST_COMPETENCY = previousFirst;
 }
});

test('vendedor anexa na própria venda sem ganhar permissão para confirmar pagamento', async () => {
 await pg.exec("INSERT INTO freight_sales(id,sale_number,sale_date,competency,seller_id,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) VALUES ('own','1','2026-09-01','2026-09','seller','Seller','A','B','2026-09-05','SEM_PREVISAO',1000,1000,'admin'),('other','2','2026-09-01','2026-09','admin','Admin','A','B','2026-09-05','SEM_PREVISAO',1000,1000,'admin')");
 const upload = await import('../../app/api/sales/[id]/attachments/route.ts');
 const payments = await import('../../app/api/sales/[id]/payments/route.ts');
 const form = () => { const data=new FormData(); data.set('file',new File(['%PDF-1.4\n%%EOF'],'comprovante.pdf',{type:'application/pdf'})); return data; };
 const own = await upload.POST(await request('/api/sales/own/attachments','seller','POST',form()), {params:Promise.resolve({id:'own'})});
 assert.equal(own.status,201,await own.clone().text());
 const other = await upload.POST(await request('/api/sales/other/attachments','seller','POST',form()), {params:Promise.resolve({id:'other'})});
 assert.equal(other.status,404,await other.clone().text());
 const paid = await payments.POST(await request('/api/sales/own/payments','seller','POST',{amountCents:1000}), {params:Promise.resolve({id:'own'})});
 assert.equal(paid.status,403);
});

test('vendedor consulta prestadores e despesas de nota fiscal e outras despesas podem ser editadas', async () => {
 await pg.exec("insert into providers(id,name,reference_name,yard_address,document,active) values ('provider-read','PRESTADOR TESTE','REFERENCIA TESTE','RUA DO PATIO','12345678000199',1)");
 const providers=await import('../../app/api/providers/route.ts');
 const providerId=await import('../../app/api/providers/[id]/route.ts');
 const listed=await providers.GET(await request('/api/providers','seller'));
 assert.equal(listed.status,200,await listed.clone().text());
 assert.equal((await listed.json()).providers.some((item:{id:string})=>item.id==='provider-read'),true);
 const denied=await providerId.PATCH(await request('/api/providers/provider-read','seller','PATCH',{companyName:'ALTERADO',referenceName:'ALTERADO',yardAddress:'ALTERADO',active:true}),{params:Promise.resolve({id:'provider-read'})});
 assert.equal(denied.status,403);

 const sales=await import('../../app/api/sales/route.ts');
 const operationCosts=await import('../../app/api/sales/[id]/operation-costs/route.ts');
 const response=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2030-09-23',financialDueDate:'2030-09-30',costs:[
   {category:'NOTA_FISCAL_IMPOSTO',description:'IMPOSTO DA NOTA',amountCents:1200,occurredOn:'2030-09-23'},
   {category:'OUTRAS_DESPESAS',description:'DESPESA EXTRA',amountCents:800,occurredOn:'2030-09-23'},
 ]}));
 assert.equal(response.status,201,await response.clone().text());
 const sale=await response.json();
 const costs=await queryAll("select id,category from freight_costs where sale_id=? order by category",[sale.id]) as Array<{id:string;category:string}>;
 assert.deepEqual(costs.map(cost=>cost.category),['NOTA_FISCAL_IMPOSTO','OUTRAS_DESPESAS']);
 for (const cost of costs) {
   const edited=await operationCosts.PATCH(await request(`/api/sales/${sale.id}/operation-costs`,'finance','PATCH',{costId:cost.id,description:`EDITADO ${cost.category}`,amountCents:cost.category==='NOTA_FISCAL_IMPOSTO'?1500:900,status:'EM_ABERTO'}),{params:Promise.resolve({id:sale.id})});
   assert.equal(edited.status,200,await edited.clone().text());
 }
 const updated=await queryAll("select category,amount_cents,description from freight_costs where sale_id=? order by category",[sale.id]) as Array<{category:string;amount_cents:number;description:string}>;
 assert.deepEqual(updated.map(cost=>[cost.category,cost.amount_cents,cost.description]),[['NOTA_FISCAL_IMPOSTO',1500,'EDITADO NOTA_FISCAL_IMPOSTO'],['OUTRAS_DESPESAS',900,'EDITADO OUTRAS_DESPESAS']]);
});

test('Frota salva e reabre 1200 km, usa média da placa e mantém histórico ao filtrar mês', async () => {
 const {distanceInputToMeters, distanceToInput}=await import('../../lib/domain/number-input.ts');
 const {calculateFleetFreightPreview}=await import('../../lib/domain/fleet.ts');
 const list=await import('../../app/api/fleet/route.ts');
 const create=await import('../../app/api/fleet/freights/route.ts');
 const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const settings=await import('../../app/api/fleet/settings/route.ts');
 await pg.exec("INSERT INTO fleet_vehicles(id,plate) VALUES ('calc-vehicle','CAL1C23'); INSERT INTO fleet_drivers(id,name) VALUES ('calc-driver','MOTORISTA DO TESTE DE CÁLCULO');");
 // Histórico é somente a base da média por placa, sem cobrança em duplicidade.
 await pg.exec("INSERT INTO fleet_vehicle_costs(id,vehicle_id,competency,distance_meters,monthly_cost_cents) VALUES ('calc-history','calc-vehicle','2026-04',14345000,1054963), ('calc-history-may','calc-vehicle','2026-05',9667000,1154584), ('calc-history-june','calc-vehicle','2026-06',9702000,1232532);");
 const parameters={fuelPriceCents:738,averageConsumptionMilliKmPerLiter:3200,fallbackFixedCostPerKmCents:45,matchWindowDays:3,officeMonthlyCostCents:120000};
 const configured=await settings.PUT(await request('/api/fleet/settings','admin','PUT',parameters));
 assert.equal(configured.status,200,await configured.clone().text());
 const payload={vehicleId:'calc-vehicle',driverId:'calc-driver',clientName:'CLIENTE DE TESTE',origin:'ORIGEM',destination:'DESTINO',pickupDate:'2026-11-09',operationalStatus:'SEM_PREVISAO',priority:'NORMAL',freightAmountCents:540000,distanceMeters:distanceInputToMeters('1200'),tollCents:13000,driverCommissionCents:20000,returnUsed:false};
 const created=await create.POST(await request('/api/fleet/freights','admin','POST',payload));
 assert.equal(created.status,201,await created.clone().text());
 const {id}=await created.json();
 const second=await create.POST(await request('/api/fleet/freights','admin','POST',{...payload,distanceMeters:600000}));
 assert.equal(second.status,201,await second.clone().text());
 async function readFleet() {
  const result=await list.GET(await request('/api/fleet?competency=2026-11','finance'));
  assert.equal(result.status,200,await result.clone().text());
  return (await result.json()).fleet as import('../../lib/domain/fleet.ts').FleetData;
 }
 let fleet=await readFleet();
 const saved=fleet.freights.find(f=>f.id===id)!;
 assert.equal(saved.distanceMeters,1200000);
 assert.equal(saved.fuelCostCents,276750);
 assert.equal(saved.allocatedCostCents,128007);
 assert.equal(saved.totalCostCents,309750);
 const preview=calculateFleetFreightPreview({...saved,distanceMeters:distanceInputToMeters(distanceToInput(saved.distanceMeters))},fleet.parameters,fleet.vehicles);
 assert.equal(preview.totalCostCents,saved.totalCostCents);
 const patched=await edit.PATCH(await request(`/api/fleet/freights/${id}`,'admin','PATCH',{...payload,distanceMeters:distanceInputToMeters(distanceToInput(saved.distanceMeters))}),{params:Promise.resolve({id})});
 assert.equal(patched.status,200,await patched.clone().text());
 fleet=await readFleet();
 assert.equal(fleet.freights.find(f=>f.id===id)!.totalCostCents,saved.totalCostCents);
 const reconfigured=await settings.PUT(await request('/api/fleet/settings','admin','PUT',{...parameters,fuelPriceCents:800,averageConsumptionMilliKmPerLiter:4000,fallbackFixedCostPerKmCents:50}));
 assert.equal(reconfigured.status,200,await reconfigured.clone().text());
 fleet=await readFleet();
 const recalculated=fleet.freights.find(f=>f.id===id)!;
 assert.equal(recalculated.fuelCostCents,240000);
 assert.equal(recalculated.allocatedCostCents,128007);
 assert.ok(await queryFirst("select id from fleet_vehicle_costs where id='calc-history'"));
});

test('imagem do vendedor pode comprovar recebimento; pagamento e exclusão continuam restritos', async () => {
 const upload = await import('../../app/api/sales/[id]/attachments/route.ts');
 const payments = await import('../../app/api/sales/[id]/payments/route.ts');
 const remove = await import('../../app/api/payments/[id]/route.ts');
 const {getSale}=await import('../../lib/server/repository.ts');
 const {authorize}=await import('../../lib/server/auth.ts');
 const context={params:Promise.resolve({id:'own'})};
 const form=new FormData(); form.set('file',new File([new Uint8Array([255,216,255,224,0,16])],'comprovante.jpeg',{type:'image/jpeg'}));
 const uploaded=await upload.POST(await request('/api/sales/own/attachments','seller','POST',form),context);
 assert.equal(uploaded.status,201,await uploaded.clone().text());
 const proof=await uploaded.json();
 const payload={type:'RECEBIMENTO',status:'CONFIRMADO',amountCents:1000,occurredAt:'2026-09-09',paymentMethod:'PIX',proofId:proof.id};
 const wrongRequest=await request('/api/sales/other/payments','finance','POST',payload); wrongRequest.headers.set('idempotency-key','wrong-proof');
 assert.equal((await payments.POST(wrongRequest,{params:Promise.resolve({id:'other'})})).status,400);
 const paymentRequest=await request('/api/sales/own/payments','finance','POST',payload); paymentRequest.headers.set('idempotency-key','image-payment');
 const paid=await payments.POST(paymentRequest,context);
 assert.equal(paid.status,201,await paid.clone().text());
 const transaction=await paid.json();
 const user=await authorize(await request('/api/sales/own','finance'));
 assert.equal((await getSale(user,'own'))!.financial.balanceCents,0);
 const paymentContext={params:Promise.resolve({id:transaction.id})};
 assert.equal((await remove.DELETE(await request('/api/payments/x','seller','DELETE'),paymentContext)).status,403);
 const removed=await remove.DELETE(await request('/api/payments/x','finance','DELETE'),paymentContext);
 assert.equal(removed.status,200,await removed.clone().text());
 const sale=await getSale(user,'own');
 assert.equal(sale!.financial.balanceCents,1000); assert.equal(sale!.payments.length,0);
 assert.equal((await queryAll("select * from audit_logs where entity_id=? and action='DELETED'",[transaction.id])).length,1);
 const duplicate=await remove.DELETE(await request('/api/payments/x','finance','DELETE'),paymentContext);
 assert.equal((await duplicate.json()).alreadyDeleted,true);
 assert.equal((await queryAll("select * from audit_logs where entity_id=? and action='DELETED'",[transaction.id])).length,1);
});

test('excluir recebimento com estorno antigo remove o par sem inverter o saldo', async () => {
 await pg.exec("INSERT INTO payment_transactions(id,sale_id,type,status,amount_cents,occurred_at,payment_method,idempotency_key,created_by,reversed_transaction_id) VALUES ('legacy-payment','own','RECEBIMENTO','CONFIRMADO',500,'2026-09-09','PIX','legacy-payment','admin',null),('legacy-reversal','own','ESTORNO','CONFIRMADO',500,'2026-09-09','PIX','legacy-reversal','admin','legacy-payment')");
 const remove=await import('../../app/api/payments/[id]/route.ts');
 const result=await remove.DELETE(await request('/api/payments/legacy-payment','finance','DELETE'),{params:Promise.resolve({id:'legacy-payment'})});
 assert.equal(result.status,200,await result.clone().text());
 const rows=await queryAll("select status from payment_transactions where id in ('legacy-payment','legacy-reversal')");
 assert.ok(rows.every(row=>(row as {status:string}).status==='CANCELADO'));
 const {getSale}=await import('../../lib/server/repository.ts');
 const {authorize}=await import('../../lib/server/auth.ts');
 assert.equal((await getSale(await authorize(await request('/api/sales/own','finance')),'own'))!.financial.balanceCents,1000);
});

test('frota aceita PNG, baixa exige anexo do próprio frete e download preserva formato', async () => {
 await pg.exec("INSERT INTO users(id,email,name,role) VALUES ('operator','operator@example.test','Operator','OPERACIONAL')");
 const upload=await import('../../app/api/fleet/freights/[id]/attachments/route.ts');
 const payment=await import('../../app/api/fleet/freights/[id]/payment/route.ts');
 const download=await import('../../app/api/fleet/freights/[id]/attachments/[attachmentId]/route.ts');
 const form=new FormData();form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'recibo.png',{type:'image/png'}));
 const context={params:Promise.resolve({id:'freight'})};
 const result=await upload.POST(await request('/api/fleet/freights/freight/attachments','operator','POST',form),context);
 assert.equal(result.status,201,await result.clone().text()); const proof=await result.json();
 const body={status:'PAGO',proofId:proof.id,paidAt:'2026-09-10'};
 assert.equal((await payment.PATCH(await request('/api/fleet/freights/freight/payment','operator','PATCH',body),context)).status,403);
 assert.equal((await payment.PATCH(await request('/api/fleet/freights/linked-freight/payment','finance','PATCH',body),{params:Promise.resolve({id:'linked-freight'})})).status,400);
 assert.equal((await payment.PATCH(await request('/api/fleet/freights/freight/payment','finance','PATCH',body),context)).status,200);
 const file=await download.GET(await request('/api/fleet/freights/freight/attachments/x','finance'),{params:Promise.resolve({id:'freight',attachmentId:proof.id})});
 assert.equal(file.headers.get('content-type'),'image/png');assert.match(file.headers.get('content-disposition')!,/recibo.png/);
});

test('listagens abrem no mês atual e permitem consultar outro mês sem perder a base histórica', async () => {
 const {currentCompetency}=await import('../../lib/domain/dates.ts');
 const list=await import('../../app/api/fleet/route.ts');
 const sales=await import('../../app/api/sales/route.ts');
 const fleet=(await (await list.GET(await request('/api/fleet','finance'))).json()).fleet;
 assert.ok(fleet.freights.every((f:{pickupDate:string})=>f.pickupDate.startsWith(currentCompetency())));
 assert.equal(fleet.vehicles.find((v:{id:string})=>v.id==='calc-vehicle').costs.length,3);
 const saleData=await (await sales.GET(await request('/api/sales','finance'))).json();
 assert.ok(saleData.sales.every((s:{competency:string})=>s.competency===currentCompetency()));
 assert.equal(saleData.canDelete,false);
 assert.equal((await list.GET(await request('/api/fleet?competency=2026-13'))).status,400);
 assert.equal((await sales.GET(await request('/api/sales?competency=2026-13'))).status,400);
});

test('viagem agrupa dois veículos, conta diesel uma vez e fecha o mês com histórico', async () => {
 const tripsApi = await import('../../app/api/fleet/trips/route.ts');
 const tripApi = await import('../../app/api/fleet/trips/[id]/route.ts');
 const freightsApi = await import('../../app/api/fleet/freights/route.ts');
 const freightApi = await import('../../app/api/fleet/freights/[id]/route.ts');
 const monthlyApi = await import('../../app/api/fleet/monthly/route.ts');
 const { loadFleetData } = await import('../../lib/server/fleet.ts');
 const { calculateMonthlyResult } = await import('../../lib/domain/fleet-results.ts');
 await pg.exec("insert into fleet_vehicles(id,plate) values ('results-truck','XYZ1A23'),('results-other','XYZ1A24'); insert into fleet_drivers(id,name,active) values ('results-driver','MOTORISTA RESULTADOS',1); insert into users(id,email,name,role) values ('operator','operator@example.test','Operador','OPERACIONAL') on conflict (id) do nothing;");
 const tripPayload = { name:'VIAGEM NOVEMBRO',vehicleId:'results-truck',driverId:'results-driver',operationDate:'2026-11-10',fuelCostCents:30000,tollCents:10000,otherCostCents:5000,notes:'Custos compartilhados' };
 assert.equal((await tripsApi.POST(await request('/api/fleet/trips','seller','POST',tripPayload))).status,403);
 const tripResponse = await tripsApi.POST(await request('/api/fleet/trips','admin','POST',tripPayload));
 assert.equal(tripResponse.status,201,await tripResponse.clone().text());
 const trip = await tripResponse.json();
 const base = {tripId:trip.id,vehicleId:'results-truck',driverId:'results-driver',clientName:'CLIENTE TESTE',origin:'A',destination:'B',pickupDate:'2026-11-10',deliveryDate:'2026-11-11',billingDate:'2026-11-11',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:0,driverCommissionCents:10000,returnUsed:false,yardCostCents:5000,pickupCostCents:2000,deliveryCostCents:3000,otherCostCents:1000};
 const f1Response = await freightsApi.POST(await request('/api/fleet/freights','admin','POST',base));
 assert.equal(f1Response.status,201,await f1Response.clone().text());
 const f1 = await f1Response.json();
 const f2Response = await freightsApi.POST(await request('/api/fleet/freights','admin','POST',{...base,freightAmountCents:150000,driverCommissionCents:15000}));
 assert.equal(f2Response.status,201,await f2Response.clone().text());
 const fleet = await loadFleetData(true,true,true,false,'2026-11');
 const result = fleet.tripResults.find(t => t.id === trip.id)!;
 assert.equal(result.freights.length,2);
 assert.equal(result.directCostCents,47000);
 assert.equal(result.sharedCostCents,45000);
 assert.equal(result.resultCents,158000);
 assert.equal(result.freights[0].fuelCostCents,15000);
 assert.equal(result.freights.reduce((sum,f)=>sum+f.netRevenueCents,0),result.resultCents);
 assert.equal(result.freights.find(f => f.id === f1.id)!.contributionCents,79000);
 // Costs cannot be entered again on an individual freight in a shared trip.
 assert.equal((await freightsApi.POST(await request('/api/fleet/freights','admin','POST',{...base,tollCents:1000}))).status,400);
 assert.notEqual((await freightsApi.POST(await request('/api/fleet/freights','admin','POST',{...base,vehicleId:'results-other'}))).status,201);
 const tripContext = {params:Promise.resolve({id:trip.id})};
 assert.notEqual((await tripApi.DELETE(await request('/api/fleet/trips/x','admin','DELETE'),tripContext)).status,200);
 const month = '2026-11';
 const monthlyPost = async (payload: object, role = 'finance') => monthlyApi.POST(await request('/api/fleet/monthly',role,'POST',{competency:month,...payload}));
 const monthlyGet = async () => {
  const response = await monthlyApi.GET(await request(`/api/fleet/monthly?competency=${month}`,'finance'));
  assert.equal(response.status,200,await response.clone().text()); return response.json();
 };
 assert.equal((await monthlyApi.GET(await request(`/api/fleet/monthly?competency=${month}`,'operator'))).status,403);
 assert.equal((await monthlyPost({action:'ENTRY',kind:'FIXED',description:'ALUGUEL',amountCents:40000},'seller')).status,403);
 for (const [kind,description,amountCents] of [['FIXED','ALUGUEL',40000],['VARIABLE','OUTROS CUSTOS',5000],['REVENUE','OUTRA RECEITA',20000]]) {
   const res = await monthlyPost({action:'ENTRY',kind,description,amountCents}); assert.equal(res.status,200,await res.clone().text());
 }
 const beforeClosing = await monthlyGet();
 assert.equal(calculateMonthlyResult(beforeClosing.current).resultCents,133000);
 assert.equal((await monthlyPost({action:'CLOSE',reviewed:false})).status,400);
 // No estimates may be silently recorded as final expenses.
 const soloPayload = {...base,tripId:null,freightAmountCents:50000,driverCommissionCents:0,yardCostCents:0,pickupCostCents:0,deliveryCostCents:0,otherCostCents:0,tollCents:1000};
 const soloResponse = await freightsApi.POST(await request('/api/fleet/freights','admin','POST',soloPayload));
 assert.equal(soloResponse.status,201,await soloResponse.clone().text());
 const solo = await soloResponse.json();
 assert.equal((await monthlyPost({action:'CLOSE',reviewed:true})).status,409);
 const soloUpdate = await freightApi.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{...soloPayload,actualFuelCostCents:10000}),{params:Promise.resolve({id:solo.id})});
 assert.equal(soloUpdate.status,200,await soloUpdate.clone().text());
 const closingResponse = await monthlyPost({action:'CLOSE',reviewed:true});
 assert.equal(closingResponse.status,200,await closingResponse.clone().text());
 const closed = await monthlyGet();
 assert.equal(closed.history.length,1);
 assert.equal(calculateMonthlyResult(closed.history[0].snapshot).resultCents,172000);
 assert.equal((await monthlyPost({action:'CLOSE',reviewed:true})).status,409);
 assert.equal((await monthlyPost({action:'ENTRY',kind:'FIXED',description:'NÃO PODE',amountCents:1})).status,409);
 assert.equal((await monthlyPost({action:'DELETE_ENTRY',id:closed.current.entries[0].id})).status,409);
 const tripUpdate = await tripApi.PATCH(await request('/api/fleet/trips/x','admin','PATCH',{...tripPayload,fuelCostCents:40000}),tripContext);
 assert.equal(tripUpdate.status,200,await tripUpdate.clone().text());
 const changed = await monthlyGet();
 assert.equal(calculateMonthlyResult(changed.current).resultCents,162000);
 assert.equal(calculateMonthlyResult(changed.history[0].snapshot).resultCents,172000);
 assert.equal((await monthlyPost({action:'REOPEN',id:closed.history[0].id,reason:'x'})).status,400);
 const reopened = await monthlyPost({action:'REOPEN',id:closed.history[0].id,reason:'Conferência do diesel realizado'});
 assert.equal(reopened.status,200,await reopened.clone().text());
 const reclosed = await monthlyPost({action:'CLOSE',reviewed:true}); assert.equal(reclosed.status,200,await reclosed.clone().text());
 const history = (await monthlyGet()).history;
 assert.equal(history.length,2); assert.equal(history.filter((h: {reopenedAt: string | null}) => !h.reopenedAt).length,1);
 assert.ok(history.some((h: {snapshot: import('../../lib/domain/fleet-results.ts').MonthlySource}) => calculateMonthlyResult(h.snapshot).resultCents === 172000));
 const audit = await queryAll("select action from audit_logs where entity_type='MONTHLY_RESULT' and entity_id='2026-11'");
 assert.equal(audit.length,6); // Three entries, two closings and one reopening.
 const security = await queryAll("select tablename,rowsecurity from pg_tables where schemaname='public' and tablename in ('fleet_trips','company_monthly_entries','company_monthly_closings')");
 assert.equal(security.length,3); assert.ok(security.every(t => (t as {rowsecurity:boolean}).rowsecurity));
 const grants = await queryAll("select * from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('fleet_trips','company_monthly_entries','company_monthly_closings')");
 assert.equal(grants.length,0);
});

const salePayload = { saleDate:'2026-09-23',financialDueDate:'2026-09-30',freightAmountCents:180000,commissionBasisPoints:700,
 operationalStatus:'CONFIRMAR',sellerName:'SELLER',origin:'ORIGEM TESTE',originLocationType:'PATIO',destination:'DESTINO TESTE',paymentMethod:'PIX',
 cargoVehicles:[{model:'MODELO A',plate:'AAA1A11',identification:'CHASSI-1'},{model:'MODELO B',plate:null,identification:'CHASSI-2'}],
 destinationLocationType:'PORTA',notes:'Prazo após embarque',operationalDeadlineDays:8,costs:[] };

test('numeração anual nasce na transação, rejeita manual, preserva legado e reinicia por ano',async()=>{
 const api=await import('../../app/api/sales/route.ts');
 const response=await api.POST(await request('/api/sales','seller','POST',salePayload));
 assert.equal(response.status,201,await response.clone().text());
 const first=await response.json();assert.equal(first.saleNumber,'2026-1');
 const responses=await Promise.all(Array.from({length:8},async()=>api.POST(await request('/api/sales','seller','POST',salePayload))));
 const rows=await Promise.all(responses.map(async r=>{assert.equal(r.status,201,await r.clone().text());return r.json();}));
 assert.equal(new Set(rows.map(r=>r.saleNumber)).size,8);
 assert.equal((await api.POST(await request('/api/sales','seller','POST',{...salePayload,saleNumber:'2026-999'}))).status,400);
 assert.equal((await api.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2026-02-30'}))).status,400);
 const nextYear=await api.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2027-01-01'}));
 assert.equal((await nextYear.json()).saleNumber,'2027-1');
 const edit=await import('../../app/api/sales/[id]/route.ts');
 assert.equal((await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,saleNumber:'WRONG'}),{params:Promise.resolve({id:first.id})})).status,400);
 await assert.rejects(pg.query("update freight_sales set sale_number='WRONG' where id=$1",[first.id]));
 assert.equal((await queryFirst("select sale_number from freight_sales where id='own'") as {sale_number:string}).sale_number,'1');
 const {getSale,listSales}=await import('../../lib/server/repository.ts');
 const user={id:'seller',name:'Seller',email:'seller@example.test',role:'VENDEDOR' as const};
 assert.equal((await getSale(user,first.id))!.cargoVehicles.length,2);
 assert.ok((await listSales(user)).length>=10); // annual numbers no longer fail an integer cast
 await pg.query('delete from freight_sales where id=$1',[rows[7].id]);
 const afterDelete=await api.POST(await request('/api/sales','seller','POST',salePayload));
 assert.equal((await afterDelete.json()).saleNumber,'2026-10');
});

test('falha após gerar número reverte venda e contador no PostgreSQL',async()=>{
 const {getD1}=await import('../../lib/server/d1.ts');const db=await getD1();
 const before=await queryFirst('select last_value from sale_number_counters where year=2026');
 await assert.rejects(db.batch([
   db.prepare(`insert into freight_sales(id,sale_number,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by)
     values('rollback-sale',null,'2026-09-23','2026-09','SELLER','A','B','2026-09-30','CONFIRMAR',100,0,'admin')`),
   db.prepare("insert into receivable_installments(id,sale_id,installment_number,installment_count,due_date,payment_method,expected_amount_cents) values('bad','rollback-sale',0,1,'2026-09-30','PIX',100)"),
 ]));
 assert.equal(await queryFirst("select id from freight_sales where id='rollback-sale'"),null);
 assert.deepEqual(await queryFirst('select last_value from sale_number_counters where year=2026'),before);
});

test('múltiplos veículos e combustível persistem; financeiro não altera a carga; zero real substitui estimativa',async()=>{
 const create=await import('../../app/api/fleet/freights/route.ts');
 const patch=await import('../../app/api/fleet/freights/[id]/route.ts');
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const payload={vehicleId:'results-truck',driverId:'results-driver',clientName:'CLIENTE CARGA',origin:'A',destination:'B',pickupDate:'2028-01-10',billingDate:'2028-01-11',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:1000,driverCommissionCents:2000,returnUsed:false,
 cargoVehicles:salePayload.cargoVehicles,fuelLitersMilli:125500,fuelPumpAmountCents:75174,actualFuelCostCents:70000};
 const response=await create.POST(await request('/api/fleet/freights','admin','POST',payload));assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();
 let freight=(await loadFleetData(true,true,true,false,'2028-01')).freights.find(f=>f.id===id)!;
 assert.equal(freight.cargoVehicles!.length,2);assert.equal(freight.fuelLitersMilli,125500);assert.equal(freight.fuelPumpAmountCents,75174);
 assert.equal(freight.actualFuelCostCents,70000);assert.equal(freight.fuelCostCents,70000);assert.equal(freight.fuelCostSource,'REALIZADO');assert.equal(freight.netRevenueCents,27000);
 assert.equal(calculateMonthlyResult((await loadMonthlyReport('2028-01')).current).resultCents,27000);
 for(const invalid of [{cargoVehicles:[]},{cargoVehicles:[{model:42}]},{cargoVehicles:[{model:'X'.repeat(81)}]},{fuelLitersMilli:-1},{fuelLitersMilli:1.5},{fuelPumpAmountCents:true},{actualFuelCostCents:-1}]) {
   assert.equal((await create.POST(await request('/api/fleet/freights','admin','POST',{...payload,...invalid}))).status,400);
 }
 const edited=await patch.PATCH(await request('/api/fleet/freights/x','finance','PATCH',{...payload,actualFuelCostCents:0,cargoVehicles:[{model:'NÃO PERMITIDO'}],clientName:'ERRADO'}),{params:Promise.resolve({id})});
 assert.equal(edited.status,200,await edited.clone().text());
 freight=(await loadFleetData(true,true,true,false,'2028-01')).freights.find(f=>f.id===id)!;
 assert.equal(freight.cargoVehicles![0].model,'MODELO A');assert.equal(freight.clientName,'CLIENTE CARGA');assert.equal(freight.fuelCostCents,0);
 assert.equal(calculateMonthlyResult((await loadMonthlyReport('2028-01')).current).resultCents,97000);
 // Partial legacy PATCH does not erase new fields.
 const oldClient=await patch.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{driverCommissionCents:2500}),{params:Promise.resolve({id})});assert.equal(oldClient.status,200,await oldClient.clone().text());
 freight=(await loadFleetData(true,true,true,false,'2028-01')).freights.find(f=>f.id===id)!;assert.equal(freight.fuelLitersMilli,125500);assert.equal(freight.cargoVehicles!.length,2);
});

test('combustível real substitui a parcela histórica sem duplicar na viagem nem no fechamento',async()=>{
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 let fleet=await loadFleetData(true,true,true,false,'2026-11');
 const trip=fleet.tripResults[0];const f=trip.freights[0];
 const before=(await loadMonthlyReport('2026-11')).current;
 const oldTrip=before.trips.find(t=>t.id===trip.id)!;
 const res=await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{actualFuelCostCents:12345,fuelLitersMilli:20123,fuelPumpAmountCents:615}),{params:Promise.resolve({id:f.id})});assert.equal(res.status,200,await res.clone().text());
 fleet=await loadFleetData(true,true,true,false,'2026-11');
 const updated=fleet.tripResults.find(t=>t.id===trip.id)!;
 assert.equal(updated.sharedCostCents,trip.sharedCostCents-f.historicalFuelShareCents+12345);
 assert.equal(updated.freights.reduce((sum,freight)=>sum+freight.netRevenueCents,0),updated.resultCents);
 const after=(await loadMonthlyReport('2026-11')).current;
 assert.equal(after.trips.find(t=>t.id===trip.id)!.costCents,oldTrip.costCents-f.historicalFuelShareCents+12345);
 assert.ok(after.freights.filter(row=>updated.freights.some(f=>f.id===row.id)).every(row=>row.standaloneCostCents===0));
});

test('OS tem vínculo único, versões imutáveis, autorização e PDF com identidade Central',async()=>{
 const sales=await import('../../app/api/sales/route.ts');const edit=await import('../../app/api/sales/[id]/route.ts');
 const orders=await import('../../app/api/sales/[id]/service-order/route.ts');
 const {PDFDocument}=await import('pdf-lib');
 const response=await sales.POST(await request('/api/sales','seller','POST',salePayload));assert.equal(response.status,201,await response.clone().text());const sale=await response.json();
 const context={params:Promise.resolve({id:sale.id})};
 assert.equal((await orders.POST(await request('/api/sales/x/service-order','operator','POST'),context)).status,403);
 assert.equal((await orders.POST(await request('/api/sales/other/service-order','seller','POST'),{params:Promise.resolve({id:'other'})})).status,404);
 assert.equal((await orders.GET(await request('/api/sales/x/service-order?format=pdf','seller'),context)).status,404);
 const emitted=await orders.POST(await request('/api/sales/x/service-order','seller','POST'),context);assert.equal(emitted.status,200,await emitted.clone().text());
 const initial=await emitted.json();assert.equal(initial.latest.version,1);assert.equal(initial.latest.snapshot.saleId,sale.id);assert.equal(initial.latest.snapshot.cargoVehicles.length,2);
 assert.equal(initial.latest.snapshot.originLocationType,'PATIO');
 assert.equal(initial.latest.snapshot.destinationLocationType,'PORTA');
 assert.equal('paymentCondition' in initial.latest.snapshot,false);
 assert.equal(initial.latest.snapshot.issuer.name,'Central Express');assert.equal(initial.stale,false);
 await Promise.all(Array.from({length:4},async()=>orders.POST(await request('/api/sales/x/service-order','seller','POST'),context)));
 assert.equal((await queryAll('select * from service_orders where sale_id=?',[sale.id])).length,1);
 assert.equal((await orders.GET(await request('/api/sales/x/service-order','seller'),context).then(r=>r.json())).versions.length,1);
 const edited=await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,notes:'INFORMAÇÃO ATUALIZADA'}),context);assert.equal(edited.status,200,await edited.clone().text());
 const stale=await orders.GET(await request('/api/sales/x/service-order','seller'),context).then(r=>r.json());assert.equal(stale.stale,true);assert.equal(stale.latest.snapshot.notes,initial.latest.snapshot.notes);
 const issued=await orders.POST(await request('/api/sales/x/service-order','seller','POST'),context).then(r=>r.json());assert.equal(issued.latest.version,2);assert.equal(issued.latest.snapshot.notes,'INFORMAÇÃO ATUALIZADA');
 const pdf=await orders.GET(await request('/api/sales/x/service-order?format=pdf&version=1','seller'),context);assert.equal(pdf.status,200,await pdf.clone().text());assert.equal(pdf.headers.get('Content-Type'),'application/pdf');
 const bytes=new Uint8Array(await pdf.arrayBuffer());const document=await PDFDocument.load(bytes);assert.match(document.getTitle()!,/Central Express/);assert.ok(document.getPageCount()>=1);
 if (process.env.CENTRAL_QA_OUTPUT) { const {mkdir,writeFile}=await import('node:fs/promises'); await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true}); await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/service-order.pdf`,bytes); }
 assert.equal((await orders.GET(await request('/api/sales/x/service-order?format=pdf&version=-1','seller'),context)).status,400);
 assert.equal((await edit.DELETE(await request('/api/sales/x','admin','DELETE'),context)).status,200);
 assert.equal(await queryFirst('select id from service_orders where sale_id=?',[sale.id]),null);
});

test('OS consulta todos os veículos do frete vinculado e detecta edição da carga',async()=>{
 const sales=await import('../../app/api/sales/route.ts');const orders=await import('../../app/api/sales/[id]/service-order/route.ts');
 const f=await queryFirst("select id from fleet_freights where client_name='CLIENTE CARGA'") as {id:string};
 const payload={...salePayload,fleetFreightId:f.id,cargoVehicles:[{model:'IGNORADO'}]};
 assert.equal((await sales.POST(await request('/api/sales','seller','POST',payload))).status,403);
 const response=await sales.POST(await request('/api/sales','admin','POST',payload));assert.equal(response.status,201,await response.clone().text());const sale=await response.json();
 const context={params:Promise.resolve({id:sale.id})};
 const first=await orders.POST(await request('/api/sales/x/service-order','admin','POST'),context).then(r=>r.json());assert.equal(first.latest.snapshot.cargoVehicles.length,2);assert.equal(first.latest.snapshot.cargoVehicles[0].model,'MODELO A');
 await pg.query("update fleet_freights set cargo_vehicles=$1::jsonb where id=$2",[JSON.stringify([{model:'ATUALIZADO',plate:null,identification:null}]),f.id]);
 const report=await orders.GET(await request('/api/sales/x/service-order','admin'),context).then(r=>r.json());assert.equal(report.stale,true);assert.equal(report.latest.snapshot.cargoVehicles[0].model,'MODELO A');
 const duplicate=await sales.POST(await request('/api/sales','admin','POST',payload));assert.notEqual(duplicate.status,201);
 const tables=await queryAll("select tablename,rowsecurity from pg_tables where tablename in ('sale_number_counters','service_orders','service_order_versions')");assert.equal(tables.length,3);assert.ok(tables.every(t=>(t as {rowsecurity:boolean}).rowsecurity));
 assert.equal((await queryAll("select * from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('sale_number_counters','service_orders','service_order_versions')")).length,0);
});

test('hodômetro persiste distância efetiva e rota; backend rejeita leituras inválidas e protege dados do Financeiro',async()=>{
 const create=await import('../../app/api/fleet/freights/route.ts');const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const payload={vehicleId:'results-truck',driverId:'results-driver',clientName:'ODOMETRO',origin:'A',destination:'B',pickupDate:'2030-01-01',billingDate:'2030-01-01',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:500000,distanceMeters:510000,routeDistanceMeters:510000,odometerStartMeters:125300000,odometerEndMeters:125795000,tollCents:30000,driverCommissionCents:40000,otherCostCents:20000,actualFuelCostCents:100000,cargoVehicles:[{model:'UNO'}]};
 const response=await create.POST(await request('/api/fleet/freights','admin','POST',payload));assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();const ctx={params:Promise.resolve({id})};
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 let freight=(await loadFleetData(true,true,true,false,'2030-01')).freights.find(f=>f.id===id)!;
 assert.equal(freight.distanceMeters,495000);assert.equal(freight.routeDistanceMeters,510000);assert.equal(freight.netRevenueCents,310000);assert.equal(freight.marginBasisPoints,6200);
 assert.equal((await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{odometerEndMeters:125299999}),ctx)).status,400);
 await assert.rejects(pg.query('update fleet_freights set odometer_end_meters=1 where id=$1',[id]));
 const financial=await edit.PATCH(await request('/api/fleet/freights/x','finance','PATCH',{odometerStartMeters:0,odometerEndMeters:10000,routeDistanceMeters:10000}),ctx);assert.equal(financial.status,200,await financial.clone().text());
 freight=(await loadFleetData(true,true,true,false,'2030-01')).freights.find(f=>f.id===id)!;assert.equal(freight.distanceMeters,495000);assert.equal(freight.odometerStartMeters,125300000);
 const changed=await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{odometerEndMeters:125800000,cargoVehicles:salePayload.cargoVehicles}),ctx);assert.equal(changed.status,200,await changed.clone().text());
 assert.equal((await queryFirst('select distance_meters from fleet_freights where id=?',[id]) as {distance_meters:number}).distance_meters,500000);
});

test('exclusão real de frete pago remove anexos, mantém venda e OS e desacopla vínculo com carga preservada',async()=>{
 const {id}=await queryFirst("select id from fleet_freights where client_name='ODOMETRO'") as {id:string};
 const sales=await import('../../app/api/sales/route.ts');const orders=await import('../../app/api/sales/[id]/service-order/route.ts');const remove=await import('../../app/api/fleet/freights/[id]/route.ts');
 const created=await sales.POST(await request('/api/sales','admin','POST',{...salePayload,fleetFreightId:id}));assert.equal(created.status,201,await created.clone().text());const sale=await created.json();
 assert.equal((await orders.POST(await request('/api/sales/x/service-order','admin','POST'),{params:Promise.resolve({id:sale.id})})).status,200);
 await pg.query("insert into fleet_attachments(id,freight_id,storage_key,file_name,size_bytes) values('delete-proof',$1,'delete-fleet/proof.pdf','proof.pdf',12)",[id]);
 stored.set('delete-fleet/proof.pdf',new ArrayBuffer(12));
 await pg.query("update fleet_freights set proof_attachment_id='delete-proof',payment_status='PAGO',paid_at='2030-01-01' where id=$1",[id]);
 await pg.exec("insert into users(id,email,name,role) values('delete-manager','delete-manager@example.test','Manager','GERENCIA') on conflict do nothing");
 for (const role of ['finance','seller','operator','delete-manager']) assert.equal((await remove.DELETE(await request('/api/fleet/freights/x',role,'DELETE'),{params:Promise.resolve({id})})).status,403);
 const deleted=await remove.DELETE(await request('/api/fleet/freights/x','admin','DELETE'),{params:Promise.resolve({id})});assert.equal(deleted.status,200,await deleted.clone().text());
 assert.equal(await queryFirst('select id from fleet_freights where id=?',[id]),null);assert.equal(stored.has('delete-fleet/proof.pdf'),false);
 const kept=await queryFirst('select fleet_freight_id,cargo_vehicles from freight_sales where id=?',[sale.id]) as {fleet_freight_id:string|null;cargo_vehicles:unknown[]};assert.equal(kept.fleet_freight_id,null);assert.equal(kept.cargo_vehicles.length,2);
 assert.ok(await queryFirst('select id from service_orders where sale_id=?',[sale.id]));assert.equal(await queryFirst("select id from fleet_attachments where id='delete-proof'"),null);
});

test('excluir venda com OS e versões mantém frete; falha no Storage fica na fila e pode ser reprocessada',async()=>{
 const f=await queryFirst("select id from fleet_freights where client_name='CLIENTE CARGA'") as {id:string};
 // Existing linked sale from the previous OS test.
 const sale=await queryFirst('select id from freight_sales where fleet_freight_id=?',[f.id]) as {id:string};
 const orders=await import('../../app/api/sales/[id]/service-order/route.ts');const remove=await import('../../app/api/sales/[id]/route.ts');
 const context={params:Promise.resolve({id:sale.id})};await orders.POST(await request('/api/sales/x/service-order','admin','POST'),context);
 const order=await queryFirst('select id from service_orders where sale_id=?',[sale.id]) as {id:string};
 assert.ok((await queryAll('select version from service_order_versions where order_id=?',[order.id])).length>=2);
 await pg.query("insert into sale_attachments(id,sale_id,storage_key,file_name,mime_type,size_bytes,uploaded_by) values('delete-sale-proof',$1,'delete-sale/proof.pdf','proof.pdf','application/pdf',12,'admin')",[sale.id]);
 stored.set('delete-sale/proof.pdf',new ArrayBuffer(12));const original=bucket.delete;
 bucket.delete=async()=>{throw new Error('Storage unavailable');};
 try {const response=await remove.DELETE(await request('/api/sales/x','admin','DELETE'),context);assert.equal(response.status,200,await response.clone().text());assert.equal((await response.json()).storageCleanupPending,true);} finally {bucket.delete=original;}
 assert.equal(await queryFirst('select id from freight_sales where id=?',[sale.id]),null);assert.ok(await queryFirst('select id from fleet_freights where id=?',[f.id]));
 assert.equal((await queryAll('select * from service_order_versions where order_id=?',[order.id])).length,0);
 assert.ok(await queryFirst("select storage_key from storage_cleanup_jobs where storage_key='delete-sale/proof.pdf'"));
 const retry=await import('../../app/api/storage-cleanup/route.ts');assert.equal((await retry.POST(await request('/api/storage-cleanup','finance','POST'))).status,403);
 assert.equal((await retry.POST(await request('/api/storage-cleanup','admin','POST'))).status,200);assert.equal(stored.has('delete-sale/proof.pdf'),false);
});

test('tipo de destino é independente, editável e incluído em novas OS; condição de pagamento é ignorada',async()=>{
 const create=await import('../../app/api/sales/route.ts');const edit=await import('../../app/api/sales/[id]/route.ts');
 const response=await create.POST(await request('/api/sales','seller','POST',{...salePayload,cargoVehicles:[{model:'UNO'}],paymentCondition:'Não deve ser salvo'}));assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();
 const ctx={params:Promise.resolve({id})};const updated=await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,destinationLocationType:'PONTO_DE_ENCONTRO'}),ctx);assert.equal(updated.status,200,await updated.clone().text());
 const row=await queryFirst('select origin_location_type,destination_location_type,payment_condition,jsonb_typeof(cargo_vehicles) as cargo_type from freight_sales where id=?',[id]) as Record<string,unknown>;
 assert.equal(row.origin_location_type,'PATIO');assert.equal(row.destination_location_type,'PONTO_DE_ENCONTRO');assert.equal(row.payment_condition,null);assert.equal(row.cargo_type,'array');
 const exporter=await import('../../app/api/exports/sales.csv/route.ts');
 const csv=await exporter.GET(await request('/api/exports/sales.csv?competency=2026-09','admin'));assert.equal(csv.status,200);assert.match(await csv.text(),/TIPO LOCAL DESTINO/);
 assert.equal((await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,destinationLocationType:'INVALIDO'}),ctx)).status,400);
 const removed=await edit.DELETE(await request('/api/sales/x','admin','DELETE'),ctx);assert.equal(removed.status,200,await removed.clone().text());
});

test('faturamento mensal não trunca em 500 e comissões incluem apenas motoristas cadastrados',async()=>{
 await pg.exec(`insert into fleet_freights(id,vehicle_plate,driver_id,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,driver_commission_cents)
 select 'billing-'||i,'ABC1D23',case when i<=600 then 'results-driver' else null end,'MOTORISTA','CLIENTE','A','B','2031-01-01','2031-02-01','FATURADO',1000,1000,100 from generate_series(1,601) i`);
 const {loadFleetData}=await import('../../lib/server/fleet.ts');const fleet=await loadFleetData(true,true,true,false,'2031-02');
 assert.equal(fleet.freights.length,0);assert.equal(fleet.billing.freightCount,601);assert.equal(fleet.billing.revenueCents,601000);assert.equal(fleet.billing.commissionCents,60000);assert.equal(fleet.billing.drivers[0].freights.length,600);
 assert.equal('possibleMatchCount' in fleet.summary,false);assert.equal('matchWindowDays' in fleet.parameters,false);
});

test('rota CEP a CEP retorna endereços e distância rodoviária; falta de integração e timeout permitem manual',async()=>{
 const route=await import('../../app/api/fleet/route-lookup/route.ts');const original=globalThis.fetch;const key=process.env.GOOGLE_MAPS_API_KEY;
 process.env.GOOGLE_MAPS_API_KEY='test-key';
 try {
  globalThis.fetch=async(input)=>String(input).includes('viacep') ? Response.json({logradouro:'Rua A',localidade:'São Paulo',uf:'SP'}) : Response.json({routes:[{distanceMeters:510000}]});
  const call=()=>request('/api/fleet/route-lookup','admin','POST',{originCep:'01001000',destinationCep:'20040002'}).then(route.POST);
  const result=await call();assert.equal(result.status,200);assert.equal((await result.json()).distanceMeters,510000);
  delete process.env.GOOGLE_MAPS_API_KEY;const missing=await (await call()).json();assert.equal(missing.distanceMeters,null);assert.match(missing.notice,/manualmente/);assert.ok(missing.origin);
  process.env.GOOGLE_MAPS_API_KEY='test-key';globalThis.fetch=async(input)=>{if(String(input).includes('viacep'))return Response.json({localidade:'São Paulo',uf:'SP'});throw new Error('Timeout');};
  assert.match((await (await call()).json()).notice,/manualmente/);
  assert.equal((await route.POST(await request('/api/fleet/route-lookup','finance','POST',{origin:'A',destination:'B'}))).status,403);
 } finally {globalThis.fetch=original;if(key===undefined)delete process.env.GOOGLE_MAPS_API_KEY;else process.env.GOOGLE_MAPS_API_KEY=key;}
});

test('exclusão de frete sem vínculo preserva histórico mensal; migration nova é reaplicável sem perda',async()=>{
 const history=await queryAll('select * from fleet_vehicle_costs order by id');assert.ok(history.length>0);
 const remove=await import('../../app/api/fleet/freights/[id]/route.ts');
 const response=await remove.DELETE(await request('/api/fleet/freights/linked-freight','admin','DELETE'),{params:Promise.resolve({id:'linked-freight'})});assert.equal(response.status,200,await response.clone().text());
 assert.equal(await queryFirst("select id from fleet_freights where id='linked-freight'"),null);
 await pg.exec(await readFile(new URL('../../supabase/migrations/20260923220518_fleet_operation_integrity.sql',import.meta.url),'utf8'));
 assert.deepEqual(await queryAll('select * from fleet_vehicle_costs order by id'),history);
 const tables=await queryAll("select rowsecurity from pg_tables where schemaname='public' and tablename='storage_cleanup_jobs'");assert.equal((tables[0] as {rowsecurity:boolean}).rowsecurity,true);
 assert.equal((await queryAll("select 1 from information_schema.role_table_grants where table_name='storage_cleanup_jobs' and grantee in ('anon','authenticated')")).length,0);
});
