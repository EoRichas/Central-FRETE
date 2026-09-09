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
 return { query, params, bind: (...values: unknown[]) => prepare(query, values), run: async () => ({results: await queryAll(query, params), success: true}) };
}
const stored = new Map<string, ArrayBuffer>();
const bucket = { put: async (key: string, data: ArrayBuffer) => stored.set(key, data), delete: async (key: string) => stored.delete(key) };
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
 for (let pass = 0; pass < 2; pass++) for (const file of ['001_central_frete_postgres.sql', '002_fleet.sql', '003_fleet_billing.sql', '004_operational_role.sql', '005_detach_driver_vehicle.sql']) await pg.exec(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
 await pg.exec("INSERT INTO users(id,email,name,role) VALUES ('admin','admin@example.test','Admin','ADMIN'),('finance','finance@example.test','Finance','FINANCEIRO'),('seller','seller@example.test','Seller','VENDEDOR');");
 process.env.CENTRAL_FRETE_SESSION_SECRET = 'test-secret-never-use-in-production-1234';
 process.env.BILLING_ENABLED = 'false';
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

test('financeiro confirma frete somente com PDF dele; vendedor não pode confirmar', async () => {
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
 const result = await payment.PATCH(await request('/api/fleet/freights/freight/payment','finance','PATCH',{status:'PAGO',proofId:proof.id}),context);
 assert.equal(result.status,200,await result.clone().text());
 assert.equal((await queryFirst("select payment_status from fleet_freights where id='freight'") as {payment_status: string}).payment_status,'PAGO');
});

test('notificação repetida quita uma vez; estorno bloqueia APIs inclusive do administrador', async () => {
 process.env.BILLING_ENABLED='true'; process.env.BILLING_COMPANY_ID='test'; process.env.BILLING_COMPANY_NAME='Empresa Teste';
 const { billingCalendar } = await import('../../lib/domain/billing.ts');
 const month = billingCalendar().activeCompetency;
 process.env.BILLING_FIRST_COMPETENCY=month;
 process.env.MERCADO_PAGO_ACCESS_TOKEN='test'; process.env.MERCADO_PAGO_COLLECTOR_ID='123'; process.env.MERCADO_PAGO_MODE='test';
 const billing = await import('../../lib/server/billing.ts');
 const auth = await import('../../lib/server/auth.ts');
 await billing.ensurePeriod(month);
 const originalFetch = globalThis.fetch;
 let status = 'approved'; let amount=1;
 globalThis.fetch = async () => Response.json({id:100, status, transaction_amount:amount, currency_id:'BRL', collector_id:123, external_reference:`cf:test:${month}`, date_approved:new Date().toISOString(), live_mode:false});
 try {
  await billing.reconcilePayment('100'); await billing.reconcilePayment('100');
  assert.equal((await queryAll('select * from billing_payments')).length,1);
  assert.equal((await queryAll('select * from billing_email_outbox')).length,1);
  assert.equal((await billing.billingStatus()).blocked,false);
  const key=(await billing.periods())[0].licenseKey;
  await billing.reconcilePayment('100'); assert.equal((await billing.periods())[0].licenseKey,key);
  amount=149.99; await assert.rejects(billing.reconcilePayment('100')); amount=1;
  status='refunded'; await billing.reconcilePayment('100');
  // Use previous month to ensure it is overdue on any test execution date.
  process.env.BILLING_FIRST_COMPETENCY='2020-01';
  await assert.rejects(auth.authorize(await request('/api/fleet')), (e: unknown) => e instanceof ApiError && e.status===402);
  assert.equal((await auth.authorize(await request('/api/billing'),['ADMIN','FINANCEIRO'])).role,'ADMIN');
  await assert.rejects(auth.authorize(await request('/api/billing','seller'),['ADMIN','FINANCEIRO']));
 } finally { globalThis.fetch=originalFetch; process.env.BILLING_ENABLED='false'; }
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

test('webhook rejeita assinatura forjada e divergência entre corpo e URL', async () => {
 const {createHmac}=await import('node:crypto');
 const {validateWebhook}=await import('../../lib/server/mercado-pago.ts');
 const webhook=await import('../../app/api/billing/webhook/route.ts');
 process.env.MERCADO_PAGO_WEBHOOK_SECRET='isolated-test-secret';
 const signature=createHmac('sha256','isolated-test-secret').update('id:100;request-id:test-request;ts:123456;').digest('hex');
 const headers={'x-request-id':'test-request','x-signature':`ts=123456,v1=${signature}`,'Content-Type':'application/json'};
 assert.equal(validateWebhook(new Request('https://example.test/api/billing/webhook?data.id=100',{headers})),'100');
 assert.throws(()=>validateWebhook(new Request('https://example.test/api/billing/webhook?data.id=101',{headers})));
 process.env.BILLING_ENABLED='true';
 try {
 const result=await webhook.POST(new Request('https://example.test/api/billing/webhook?data.id=100',{method:'POST',headers,body:JSON.stringify({type:'payment',data:{id:101}})}));
 assert.equal(result.status,400);
 } finally {process.env.BILLING_ENABLED='false';}
});

test('Frota salva e reabre 1200 km, rateia por competência e usa apenas Parâmetros', async () => {
 const {distanceInputToMeters, distanceToInput}=await import('../../lib/domain/number-input.ts');
 const {calculateFleetFreightPreview}=await import('../../lib/domain/fleet.ts');
 const list=await import('../../app/api/fleet/route.ts');
 const create=await import('../../app/api/fleet/freights/route.ts');
 const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const settings=await import('../../app/api/fleet/settings/route.ts');
 await pg.exec("INSERT INTO fleet_vehicles(id,plate) VALUES ('calc-vehicle','CAL1C23'); INSERT INTO fleet_drivers(id,name) VALUES ('calc-driver','MOTORISTA DO TESTE DE CÁLCULO');");
 // Histórico deliberadamente muito alto: não pode substituir o custo por km de Parâmetros.
 await pg.exec("INSERT INTO fleet_vehicle_costs(id,vehicle_id,competency,distance_meters,monthly_cost_cents) VALUES ('calc-history','calc-vehicle','2026-11',1000,100000000);");
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
  const result=await list.GET(await request('/api/fleet','finance'));
  assert.equal(result.status,200,await result.clone().text());
  return (await result.json()).fleet as import('../../lib/domain/fleet.ts').FleetData;
 }
 let fleet=await readFleet();
 const saved=fleet.freights.find(f=>f.id===id)!;
 assert.equal(saved.distanceMeters,1200000);
 assert.equal(saved.fuelCostCents,276750);
 assert.equal(saved.fixedCostCents,54000);
 assert.equal(saved.allocatedCostCents,80000);
 assert.equal(saved.totalCostCents,443750);
 const preview=calculateFleetFreightPreview({...saved,distanceMeters:distanceInputToMeters(distanceToInput(saved.distanceMeters))},fleet.parameters,fleet.freights);
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
 assert.equal(recalculated.fixedCostCents,60000);
 assert.equal(recalculated.allocatedCostCents,80000);
 assert.ok(await queryFirst("select id from fleet_vehicle_costs where id='calc-history'"));
});
