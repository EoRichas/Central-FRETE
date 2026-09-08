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
 for (let pass = 0; pass < 2; pass++) for (const file of ['001_central_frete_postgres.sql', '002_fleet.sql', '003_fleet_billing.sql']) await pg.exec(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
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

test('cadastro normaliza CPF, permite homônimos e preserva veículo com vínculos', async () => {
 const drivers = await import('../../app/api/fleet/drivers/route.ts');
 const vehicles = await import('../../app/api/fleet/vehicles/[id]/route.ts');
 await pg.exec("INSERT INTO fleet_vehicles(id,plate) VALUES ('vehicle','ABC1D23');");
 const payload = {name:'Motorista Teste', cpf:'529.982.247-25', address:'Rua de Teste 1', phone:'(11) 99999-9999', vehicleId:'vehicle', active:true};
 const result = await drivers.POST(await request('/api/fleet/drivers','admin','POST',payload));
 assert.equal(result.status,201, await result.clone().text());
 const duplicate = await drivers.POST(await request('/api/fleet/drivers','admin','POST',payload));
 assert.notEqual(duplicate.status,201);
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
 let status = 'approved'; let amount=149.99;
 globalThis.fetch = async () => Response.json({id:100, status, transaction_amount:amount, currency_id:'BRL', collector_id:123, external_reference:`cf:test:${month}`, date_approved:new Date().toISOString(), live_mode:false});
 try {
  await billing.reconcilePayment('100'); await billing.reconcilePayment('100');
  assert.equal((await queryAll('select * from billing_payments')).length,1);
  assert.equal((await queryAll('select * from billing_email_outbox')).length,1);
  assert.equal((await billing.billingStatus()).blocked,false);
  const key=(await billing.periods())[0].licenseKey;
  await billing.reconcilePayment('100'); assert.equal((await billing.periods())[0].licenseKey,key);
  amount=1; await assert.rejects(billing.reconcilePayment('100')); amount=149.99;
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
