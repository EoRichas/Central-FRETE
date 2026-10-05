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
 for (let pass = 0; pass < 2; pass++) for (const file of ['001_central_frete_postgres.sql', '002_fleet.sql', '003_fleet_billing.sql', '004_operational_role.sql', '005_detach_driver_vehicle.sql', '006_fleet_vehicle_cost_average_flag.sql', '008_fleet_results.sql', '009_direct_paid_operation_costs.sql', '010_fleet_cargo_sales_orders.sql', '011_sale_origin_location_type.sql', '../supabase/migrations/20260923220518_fleet_operation_integrity.sql', '012_sales_channels_global_numbering_costs.sql', '013_fleet_document_costs.sql', '015_fleet_numbers_and_orders.sql', '../supabase/migrations/20260928224007_user_phone_vehicle_deletion.sql', '016_fleet_monthly_scope.sql', '../supabase/migrations/20260929161711_registry_channels_addresses.sql', '../supabase/migrations/20260929175656_fleet_client_reference.sql', '../supabase/migrations/20260930164106_seller_commission_access.sql', '../supabase/migrations/20260930172047_cegonha_monthly_scope.sql', '../supabase/migrations/20260930183118_fleet_vehicle_model.sql', '../supabase/migrations/20260930184218_fleet_location_types.sql', '../supabase/migrations/20261005122915_security_sessions_and_login_limits.sql']) await pg.exec(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
 await pg.exec("INSERT INTO users(id,email,name,role) VALUES ('admin','admin@example.test','Admin','ADMIN'),('finance','finance@example.test','Finance','FINANCEIRO'),('seller','seller@example.test','Seller','VENDEDOR');");
 await pg.exec("INSERT INTO clients(id,type,legal_name,sale_channel) VALUES ('freight-client-0','PJ','CLIENTE DE TESTE','FROTA'),('freight-client-1','PJ','CLIENTE TESTE','FROTA'),('freight-client-2','PJ','CLIENTE CARGA','FROTA'),('freight-client-3','PJ','ODOMETRO','FROTA'),('freight-client-4','PJ','CLIENTE CUSTOS','FROTA'),('freight-client-5','PJ','CLIENTE OS FROTA','FROTA'),('freight-client-6','PJ','CLIENTE ATUALIZADO','FROTA');");
 process.env.CENTRAL_FRETE_SESSION_SECRET = 'test-secret-never-use-in-production-1234';
});
after(async () => { mock.restoreAll(); await pg.close(); });

async function request(path: string, role = 'admin', method = 'GET', body?: object | FormData) {
 const { createUserSessionToken } = await import('../../lib/server/local-session.ts');
 if (role === 'missing') return new Request(`https://example.test${path}`);
 const token = await createUserSessionToken({id: role, email: `${role}@example.test`, username: role, name: role});
 return new Request(`https://example.test${path}`, {method, headers: {origin: 'https://example.test', cookie: `cf_local_session=${token}`, ...(body && !(body instanceof FormData) ? {'Content-Type': 'application/json'} : {})}, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined});
}

test('migrações rodam duas vezes e novas tabelas não expõem dados anonimamente', async () => {
 const tables = await queryAll("select tablename, rowsecurity from pg_tables where schemaname='public' and tablename in ('billing_periods','billing_payments','billing_email_outbox','fleet_attachments')");
 assert.equal(tables.length,4); assert.ok(tables.every(t => (t as {rowsecurity: boolean}).rowsecurity));
 const grants = await queryAll("select * from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('billing_periods','billing_payments','billing_email_outbox','fleet_attachments')");
 assert.equal(grants.length,0);
});

test('cadastro normaliza CPF, permite homônimos, desatrela motorista e exclui placa preservando fretes', async () => {
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
 // Removing the master record keeps the historical plate and freight values.
 await pg.query("INSERT INTO fleet_freights(id,vehicle_id,vehicle_plate,driver_id,driver_name,client_name,origin,destination,pickup_date,operational_status,freight_amount_cents,distance_meters) VALUES ('linked-freight','vehicle','ABC1D23',$1,'MOTORISTA TESTE','CLIENTE','A','B','2026-09-01','SEM_PREVISAO',1000,1000)", [created.id]);
 const deleteResult = await vehicles.DELETE(await request('/api/fleet/vehicles/vehicle','admin','DELETE'), {params: Promise.resolve({id:'vehicle'})});
 assert.equal(deleteResult.status,200, await deleteResult.clone().text());
 assert.equal(await queryFirst("select id from fleet_vehicles where id='vehicle'"),null);
 assert.deepEqual(await queryFirst("select vehicle_id,vehicle_plate,freight_amount_cents from fleet_freights where id='linked-freight'"), {vehicle_id:null,vehicle_plate:'ABC1D23',freight_amount_cents:1000});
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
 await pg.exec("ALTER TABLE freight_sales DISABLE TRIGGER freight_sale_number; INSERT INTO freight_sales(id,sale_number,sale_date,competency,seller_id,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) VALUES ('own','1','2026-09-01','2026-09','seller','Seller','A','B','2026-09-05','SEM_PREVISAO',1000,1000,'admin'),('other','2','2026-09-01','2026-09','admin','Admin','A','B','2026-09-05','SEM_PREVISAO',1000,1000,'admin'); ALTER TABLE freight_sales ENABLE TRIGGER freight_sale_number;");
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
   const edited=await operationCosts.PATCH(await request(`/api/sales/${sale.id}/operation-costs`,'finance','PATCH',{costId:cost.id,description:`EDITADO ${cost.category}`,amountCents:cost.category==='NOTA_FISCAL_IMPOSTO'?1500:900,status:cost.category==='NOTA_FISCAL_IMPOSTO'?'PAGO':'EM_ABERTO'}),{params:Promise.resolve({id:sale.id})});
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
 const payload={vehicleId:'calc-vehicle',driverId:'calc-driver',clientId:'freight-client-0',clientName:'CLIENTE DE TESTE',origin:'ORIGEM',destination:'DESTINO',pickupDate:'2026-11-09',operationalStatus:'SEM_PREVISAO',priority:'NORMAL',freightAmountCents:540000,distanceMeters:distanceInputToMeters('1200'),tollCents:13000,driverCommissionCents:20000,returnUsed:false};
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
 await pg.exec("UPDATE fleet_freights SET created_by='operator' WHERE id='freight'");
 const upload=await import('../../app/api/fleet/freights/[id]/attachments/route.ts');
 const payment=await import('../../app/api/fleet/freights/[id]/payment/route.ts');
 const download=await import('../../app/api/fleet/freights/[id]/attachments/[attachmentId]/route.ts');
 const form=new FormData();form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'recibo.png',{type:'image/png'}));
 const context={params:Promise.resolve({id:'freight'})};
 const result=await upload.POST(await request('/api/fleet/freights/freight/attachments','operator','POST',form),context);
 assert.equal(result.status,201,await result.clone().text()); const proof=await result.json();
 const body={status:'PAGO',proofId:proof.id,paidAt:'2026-09-10'};
 assert.equal((await payment.PATCH(await request('/api/fleet/freights/freight/payment','operator','PATCH',body),context)).status,200);
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
 const tripPayload = { name:'VIAGEM NOVEMBRO',vehicleId:'results-truck',driverId:'results-driver',operationDate:'2034-11-10',fuelCostCents:30000,tollCents:10000,otherCostCents:5000,notes:'Custos compartilhados' };
 assert.equal((await tripsApi.POST(await request('/api/fleet/trips','seller','POST',tripPayload))).status,403);
 const tripResponse = await tripsApi.POST(await request('/api/fleet/trips','admin','POST',tripPayload));
 assert.equal(tripResponse.status,201,await tripResponse.clone().text());
 const trip = await tripResponse.json();
 const base = {tripId:trip.id,vehicleId:'results-truck',driverId:'results-driver',clientId:'freight-client-1',clientName:'CLIENTE TESTE',origin:'A',destination:'B',pickupDate:'2034-11-10',deliveryDate:'2034-11-11',billingDate:'2034-11-11',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:0,driverCommissionCents:10000,returnUsed:false,yardCostCents:5000,pickupCostCents:2000,deliveryCostCents:3000,otherCostCents:1000};
 const f1Response = await freightsApi.POST(await request('/api/fleet/freights','admin','POST',base));
 assert.equal(f1Response.status,201,await f1Response.clone().text());
 const f1 = await f1Response.json();
 const f2Response = await freightsApi.POST(await request('/api/fleet/freights','admin','POST',{...base,freightAmountCents:150000,driverCommissionCents:15000}));
 assert.equal(f2Response.status,201,await f2Response.clone().text());
 const fleet = await loadFleetData(true,true,true,false,'2034-11');
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
 const month = '2034-11';
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
 const audit = await queryAll("select action from audit_logs where entity_type='MONTHLY_RESULT' and entity_id='2034-11'");
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

test('numeração global nasce na transação, rejeita manual e não reinicia por ano',async()=>{
 const api=await import('../../app/api/sales/route.ts');
 const response=await api.POST(await request('/api/sales','seller','POST',salePayload));
 assert.equal(response.status,201,await response.clone().text());
 const first=await response.json();assert.match(first.saleNumber,/^[0-9]+$/);assert.ok(Number(first.saleNumber)>200);
 const responses=await Promise.all(Array.from({length:8},async()=>api.POST(await request('/api/sales','seller','POST',salePayload))));
 const rows=await Promise.all(responses.map(async r=>{assert.equal(r.status,201,await r.clone().text());return r.json();}));
 assert.equal(new Set(rows.map(r=>r.saleNumber)).size,8);
 assert.equal((await api.POST(await request('/api/sales','seller','POST',{...salePayload,saleNumber:'2026-999'}))).status,400);
 assert.equal((await api.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2026-02-30'}))).status,400);
 const nextYear=await api.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2027-01-01'}));
 assert.equal(Number((await nextYear.json()).saleNumber),Number(first.saleNumber)+9);
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
 assert.equal(Number((await afterDelete.json()).saleNumber),Number(first.saleNumber)+10);
});

test('falha após gerar número reverte venda e contador no PostgreSQL',async()=>{
 const {getD1}=await import('../../lib/server/d1.ts');const db=await getD1();
 const before=await queryFirst('select last_value from global_sale_number_counter where id=1');
 await assert.rejects(db.batch([
   db.prepare(`insert into freight_sales(id,sale_number,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by)
     values('rollback-sale',null,'2026-09-23','2026-09','SELLER','A','B','2026-09-30','CONFIRMAR',100,0,'admin')`),
   db.prepare("insert into receivable_installments(id,sale_id,installment_number,installment_count,due_date,payment_method,expected_amount_cents) values('bad','rollback-sale',0,1,'2026-09-30','PIX',100)"),
 ]));
 assert.equal(await queryFirst("select id from freight_sales where id='rollback-sale'"),null);
 assert.deepEqual(await queryFirst('select last_value from global_sale_number_counter where id=1'),before);
});

test('múltiplos veículos e combustível persistem; financeiro não altera a carga; zero real substitui estimativa',async()=>{
 const create=await import('../../app/api/fleet/freights/route.ts');
 const patch=await import('../../app/api/fleet/freights/[id]/route.ts');
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const payload={vehicleId:'results-truck',driverId:'results-driver',clientId:'freight-client-2',clientName:'CLIENTE CARGA',origin:'A',destination:'B',pickupDate:'2028-01-10',billingDate:'2028-01-11',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:1000,driverCommissionCents:2000,returnUsed:false,
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
 let fleet=await loadFleetData(true,true,true,false,'2034-11');
 const trip=fleet.tripResults[0];const f=trip.freights[0];
 const before=(await loadMonthlyReport('2034-11')).current;
 const oldTrip=before.trips.find(t=>t.id===trip.id)!;
 const res=await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{actualFuelCostCents:12345,fuelLitersMilli:20123,fuelPumpAmountCents:615}),{params:Promise.resolve({id:f.id})});assert.equal(res.status,200,await res.clone().text());
 fleet=await loadFleetData(true,true,true,false,'2034-11');
 const updated=fleet.tripResults.find(t=>t.id===trip.id)!;
 assert.equal(updated.sharedCostCents,trip.sharedCostCents-f.historicalFuelShareCents+12345);
 assert.equal(updated.freights.reduce((sum,freight)=>sum+freight.netRevenueCents,0),updated.resultCents);
 const after=(await loadMonthlyReport('2034-11')).current;
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
 const payload={vehicleId:'results-truck',driverId:'results-driver',clientId:'freight-client-3',clientName:'ODOMETRO',origin:'A',destination:'B',pickupDate:'2030-01-01',billingDate:'2030-01-01',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:500000,distanceMeters:510000,routeDistanceMeters:510000,odometerStartMeters:125300000,odometerEndMeters:125795000,tollCents:30000,driverCommissionCents:40000,otherCostCents:20000,actualFuelCostCents:100000,cargoVehicles:[{model:'UNO'}]};
 const response=await create.POST(await request('/api/fleet/freights','admin','POST',payload));assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();const ctx={params:Promise.resolve({id})};
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 let freight=(await loadFleetData(true,true,true,false,'2030-01')).freights.find(f=>f.id===id)!;
 assert.equal(freight.distanceMeters,495000);assert.equal(freight.routeDistanceMeters,null);assert.equal(freight.netRevenueCents,310000);assert.equal(freight.marginBasisPoints,6200);
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

test('faturamento mensal não trunca em 500 e preserva comissões sem cadastro de motorista',async()=>{
 await pg.exec(`insert into fleet_freights(id,vehicle_plate,driver_id,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,driver_commission_cents)
 select 'billing-'||i,'ABC1D23',case when i<=600 then 'results-driver' else null end,'MOTORISTA','CLIENTE','A','B','2031-01-01','2031-02-01','FATURADO',1000,1000,100 from generate_series(1,601) i`);
 const {loadFleetData}=await import('../../lib/server/fleet.ts');const fleet=await loadFleetData(true,true,true,false,'2031-02');
 assert.equal(fleet.freights.length,0);assert.equal(fleet.billing.freightCount,601);assert.equal(fleet.billing.revenueCents,601000);assert.equal(fleet.billing.commissionCents,0);assert.equal(fleet.billing.drivers.length,0);
 const january=await loadFleetData(true,true,true,false,'2031-01');
 assert.equal(january.billing.commissionCents,60100);assert.equal(january.billing.drivers.find(d=>d.id==='results-driver')!.freights.length,600);assert.equal(january.billing.drivers.length,2);
 await pg.exec("delete from fleet_freights where id like 'billing-%'");
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

test('venda Frota usa sequência global, escopo do vendedor e OS comum; operacional cria Cegonha e Frota sem comissão',async()=>{
 const sales=await import('../../app/api/sales/route.ts');
 const detail=await import('../../app/api/sales/[id]/route.ts');
 const orders=await import('../../app/api/sales/[id]/service-order/route.ts');
 const fleet=await import('../../app/api/fleet/route.ts');
 const clients=await import('../../app/api/clients/route.ts');
 const sellers=await import('../../app/api/sales/sellers/route.ts');
 const before=Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value);
 const created=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleChannel:'FROTA'}));
 assert.equal(created.status,201,await created.clone().text()); const f=await created.json();
 assert.equal(Number(f.saleNumber),before+1);
 const operational=await sales.POST(await request('/api/sales','operator','POST',{...salePayload,sellerName:undefined,sellerId:'seller'}));
 assert.equal(operational.status,201,await operational.clone().text());const c=await operational.json();
 assert.equal(Number(c.saleNumber),before+2);
 assert.equal((await sales.POST(await request('/api/sales','operator','POST',{...salePayload,saleChannel:'FROTA',sellerId:'seller'}))).status,201);
 assert.equal((await sales.POST(await request('/api/sales','operator','POST',{...salePayload,sellerId:'admin'}))).status,201);
 assert.equal((await sales.POST(await request('/api/sales','operator','POST',{...salePayload,sellerId:'seller',advanceAmountCents:100}))).status,403);
 assert.equal((await detail.DELETE(await request('/api/sales/x','operator','DELETE'),{params:Promise.resolve({id:c.id})})).status,403);
 assert.equal((await fleet.GET(await request('/api/fleet','seller'))).status,403);
 assert.equal((await clients.GET(await request('/api/clients','operator'))).status,200);
 assert.equal((await clients.POST(await request('/api/clients','operator','POST',{}))).status,400);
 const sellerOptions=await sellers.GET(await request('/api/sales/sellers','operator'));
 assert.equal(sellerOptions.status,403);
 const listed=await sales.GET(await request('/api/sales?competency=2026-09&saleChannel=FROTA','seller')).then(r=>r.json());
 assert.ok(listed.sales.some((s:{id:string})=>s.id===f.id));assert.ok(listed.sales.every((s:{saleChannel:string})=>s.saleChannel==='FROTA'));
 const legacy=await sales.GET(await request('/api/sales?competency=2026-09&saleChannel=CEGONHA','seller')).then(r=>r.json());
 assert.ok(!legacy.sales.some((s:{id:string})=>s.id===f.id));
 const finance=await sales.GET(await request('/api/sales?competency=2026-09','finance')).then(r=>r.json());
 assert.ok(finance.sales.some((s:{id:string})=>s.id===f.id));assert.ok(finance.sales.some((s:{id:string})=>s.id===c.id));
 const ctx={params:Promise.resolve({id:f.id})};
 const emitted=await orders.POST(await request('/api/sales/x/service-order','seller','POST'),ctx);
 assert.equal(emitted.status,200,await emitted.clone().text());assert.equal((await emitted.json()).latest.snapshot.saleChannel,'FROTA');
 assert.equal((await detail.GET(await request('/api/sales/x','operator'),ctx)).status,200);
});

test('custos separados, pagamentos diretos e alteração de custo preservam snapshots anteriores',async()=>{
 const sales=await import('../../app/api/sales/route.ts');const costsApi=await import('../../app/api/sales/[id]/operation-costs/route.ts');
 const orders=await import('../../app/api/sales/[id]/service-order/route.ts');
 const costs=[['NOTA_FISCAL_IMPOSTO',1200],['SEGURO_ALLIANZ',2300],['ICMS',3400],['CTE_MDFE',4500],['ICMS_CTE_MDFE',5600],['OUTRAS_DESPESAS',600]];
 const created=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,costs:costs.map(([category,amountCents])=>({category,amountCents}))}));
 assert.equal(created.status,201,await created.clone().text());const sale=await created.json();const context={params:Promise.resolve({id:sale.id})};
 const rows=await queryAll('select id,category,confirmed,payment_status from freight_costs where sale_id=?',[sale.id]) as {id:string;category:string;confirmed:number;payment_status:string}[];
 for(const row of rows){const direct=['NOTA_FISCAL_IMPOSTO','SEGURO_ALLIANZ','ICMS'].includes(row.category);assert.equal(row.payment_status,direct?'PAGO':'EM_ABERTO');assert.equal(row.confirmed,direct?1:0);}
 const issued=await orders.POST(await request('/api/sales/x/service-order','seller','POST'),context);assert.equal(issued.status,200,await issued.clone().text());const initial=await issued.json();
 assert.equal(initial.latest.snapshot.schemaVersion,3);
 assert.equal('operationValues' in initial.latest.snapshot,false); assert.equal('operationCosts' in initial.latest.snapshot,false);
 const nf=rows.find(r=>r.category==='NOTA_FISCAL_IMPOSTO')!;
 assert.equal((await costsApi.PATCH(await request('/api/sales/x/operation-costs','finance','PATCH',{costId:nf.id,amountCents:1500,status:'EM_ABERTO'}),context)).status,400);
 const update=await costsApi.PATCH(await request('/api/sales/x/operation-costs','finance','PATCH',{costId:nf.id,amountCents:1500,status:'PAGO'}),context);
 assert.equal(update.status,200,await update.clone().text());
 const stale=await orders.GET(await request('/api/sales/x/service-order','seller'),context).then(r=>r.json());assert.equal(stale.stale,false);assert.deepEqual(stale.latest.snapshot,initial.latest.snapshot);
 const next=await orders.POST(await request('/api/sales/x/service-order','seller','POST'),context).then(r=>r.json());assert.equal(next.latest.version,1);assert.deepEqual(next.latest.snapshot,initial.latest.snapshot);
 const audit=await queryAll("select * from audit_logs where entity_type='SERVICE_ORDER' and entity_id=?",[next.latest.orderId]);assert.equal(audit.length,1);
 const {listSales}=await import('../../lib/server/repository.ts');
 const sorted=await listSales({id:'admin',email:'admin@example.test',name:'Admin',role:'ADMIN'},{limit:500});
 const nums=sorted.filter(s=>/^\d+$/.test(s.saleNumber)).map(s=>Number(s.saleNumber));assert.deepEqual(nums,[...nums].sort((a,b)=>a-b));
 const page1=await listSales({id:'admin',email:'admin@example.test',name:'Admin',role:'ADMIN'},{limit:2});
 const page2=await listSales({id:'admin',email:'admin@example.test',name:'Admin',role:'ADMIN'},{limit:2,offset:2});
 assert.deepEqual([...page1,...page2].map(s=>s.id),sorted.slice(0,4).map(s=>s.id));
});

test('migração renumera somente vendas anuais sem OS e é repetível',async()=>{
 const migration=await readFile(new URL('../../database/012_sales_channels_global_numbering_costs.sql',import.meta.url),'utf8');
 const before=Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value);
 const seed=(id:string,number:string)=>pg.query("insert into freight_sales(id,sale_number,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) values($1,$2,'2020-01-01','2020-01','SELLER','A','B','2020-01-02','CONFIRMAR',100,0,'admin')",[id,number]);
 await pg.exec('ALTER TABLE freight_sales DISABLE TRIGGER freight_sale_number');
 await seed('migrate-a','2020-1');await seed('migrate-b','2020-2');await seed('migrate-issued','2020-3');
 await pg.exec('ALTER TABLE freight_sales ENABLE TRIGGER freight_sale_number');
 await pg.exec("insert into service_orders(id,sale_id,created_by) values('migration-order','migrate-issued','admin'); insert into service_order_versions(order_id,version,snapshot,created_by) values('migration-order',1,'{\"schemaVersion\":1,\"saleNumber\":\"2020-3\"}','admin');");
 await pg.exec(migration);
 const numbers=await queryAll("select id,sale_number from freight_sales where id like 'migrate-%' order by id") as {id:string;sale_number:string}[];
 assert.deepEqual(numbers.map(r=>r.sale_number),[String(before+1),String(before+2),'2020-3']);
 await pg.exec(migration);assert.deepEqual(await queryAll("select id,sale_number from freight_sales where id like 'migrate-%' order by id"),numbers);
 assert.deepEqual((await queryFirst("select snapshot from service_order_versions where order_id='migration-order'") as {snapshot:object}).snapshot,{schemaVersion:1,saleNumber:'2020-3'});
 assert.equal((await queryAll("select * from audit_logs where action='SALE_RENUMBERED' and entity_id like 'migrate-%'")).length,2);
});

test('prestador em aberto não é confirmado ao cadastrar ou editar valor',async()=>{
 const sales=await import('../../app/api/sales/route.ts');const providers=await import('../../app/api/sales/[id]/provider-costs/route.ts');
 const result=await sales.POST(await request('/api/sales','seller','POST',salePayload));const sale=await result.json();const context={params:Promise.resolve({id:sale.id})};
 for(const amountCents of [1000,2000]) {
  const res=await providers.POST(await request('/api/sales/x/provider-costs','finance','POST',{providerSlot:1,providerName:'PRESTADOR DEMONSTRAÇÃO',amountCents,paymentStatus:'EM_ABERTO'}),context);
  assert.ok([200,201].includes(res.status),await res.clone().text());
  const cost=await queryFirst("select confirmed,payment_status from freight_costs where sale_id=? and provider_slot=1",[sale.id]);
  assert.deepEqual(cost,{confirmed:0,payment_status:'EM_ABERTO'});
 }
});

test('custos fiscais da Frota persistem no cadastro e edição, compõem resultado e preservam escopo', async()=>{
 const create=await import('../../app/api/fleet/freights/route.ts');
 const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const payload={vehicleId:'results-truck',driverId:'results-driver',clientId:'freight-client-4',clientName:'CLIENTE CUSTOS',origin:'A',destination:'B',pickupDate:'2031-01-01',billingDate:'2031-01-01',operationalStatus:'FATURADO',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:1000,driverCommissionCents:2000,actualFuelCostCents:10000,insuranceCostCents:3000,invoiceCostCents:4000,icmsCostCents:5000,cteMdfeCostCents:6000};
 const res=await create.POST(await request('/api/fleet/freights','admin','POST',payload));assert.equal(res.status,201,await res.clone().text());
 const {id}=await res.json();const ctx={params:Promise.resolve({id})};
 let f=(await loadFleetData(true,true,true,false,'2031-01')).freights.find(f=>f.id===id)!;
 assert.equal(f.totalCostCents,31000);assert.equal(f.netRevenueCents,69000);
 assert.deepEqual([f.insuranceCostCents,f.invoiceCostCents,f.icmsCostCents,f.cteMdfeCostCents],[3000,4000,5000,6000]);
 const patched=await edit.PATCH(await request('/api/fleet/freights/x','finance','PATCH',{icmsCostCents:7000,origin:'ALTERACAO BLOQUEADA'}),ctx);assert.equal(patched.status,200,await patched.clone().text());
 f=(await loadFleetData(true,true,true,false,'2031-01')).freights.find(f=>f.id===id)!;
 assert.equal(f.icmsCostCents,7000);assert.equal(f.insuranceCostCents,3000);assert.equal(f.totalCostCents,33000);assert.equal(f.origin,'A');
 assert.equal((await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{insuranceCostCents:-1}),ctx)).status,400);
 assert.equal((await edit.PATCH(await request('/api/fleet/freights/x','seller','PATCH',{insuranceCostCents:1}),ctx)).status,403);
 const audit=await queryAll("select new_value from audit_logs where entity_type='FLEET_FREIGHT' and entity_id=? and action='UPDATED'",[id]) as {new_value:string}[];
 assert.equal(JSON.parse(audit[0].new_value).icmsCostCents,7000);
});

test('CEP calcula rota sem chave Google, usa longitude/latitude e rejeita coordenadas ausentes',async()=>{
 const route=await import('../../app/api/fleet/route-lookup/route.ts');const original=globalThis.fetch;const key=process.env.GOOGLE_MAPS_API_KEY;delete process.env.GOOGLE_MAPS_API_KEY;
 const urls:string[]=[];
 try {
  globalThis.fetch=async(input)=>{
   const url=String(input);urls.push(url);
   if(url.includes('viacep')) return Response.json({logradouro:'Rua Teste',localidade:'São Paulo',uf:'SP'});
   if(url.includes('brasilapi')) return Response.json({street:'Rua Teste',city:'São Paulo',state:'SP',location:{coordinates:url.includes('09820000')?{longitude:'-46.5',latitude:'-23.6'}:{longitude:'-43.2',latitude:'-22.9'}}});
   return Response.json({code:'Ok',routes:[{distance:510123.7}]});
  };
  const response=await route.POST(await request('/api/fleet/route-lookup','admin','POST',{originCep:'09820000',destinationCep:'20210020'}));
  assert.equal(response.status,200);const data=await response.json();assert.equal(data.distanceMeters,510124);assert.match(data.attribution,/OpenStreetMap/);
  assert.ok(urls.some(u=>u.includes('/driving/-46.5,-23.6;-43.2,-22.9?')));
  const {cepCoordinates}=await import('../../lib/server/cep-routing.ts');
  for(const value of [{},{latitude:'',longitude:''},{latitude:null,longitude:null},{latitude:91,longitude:-46},{latitude:-23,longitude:'NaN'}]) assert.equal(cepCoordinates(value),null);
  const invalid=await route.POST(await request('/api/fleet/route-lookup','admin','POST',{originCep:'12',destinationCep:'20210020'}));assert.equal(invalid.status,400);
 }finally{globalThis.fetch=original;if(key===undefined)delete process.env.GOOGLE_MAPS_API_KEY;else process.env.GOOGLE_MAPS_API_KEY=key;}
});

test('consulta de todos os meses preserva canal e permissões e identifica vendas vinculadas',async()=>{
 const sales=await import('../../app/api/sales/route.ts');
 const fleetApi=await import('../../app/api/fleet/route.ts');
 const exporter=await import('../../app/api/exports/sales.csv/route.ts');
 const linkedFreight=await queryFirst("select id from fleet_freights where client_name='CLIENTE CUSTOS'") as {id:string};
 const created=await sales.POST(await request('/api/sales','admin','POST',{...salePayload,fleetFreightId:linkedFreight.id,saleDate:'2020-02-01',saleChannel:'FROTA'}));
 assert.equal(created.status,201,await created.clone().text());const sale=await created.json();
 await pg.exec("insert into users(id,email,name,role) values('other-seller','other-seller@example.test','OTHER SELLER','VENDEDOR')");
 const other=await sales.POST(await request('/api/sales','admin','POST',{...salePayload,sellerId:'other-seller',sellerName:'OTHER SELLER',saleDate:'2020-02-01',saleChannel:'FROTA'}));
 assert.equal(other.status,201,await other.clone().text());const otherSale=await other.json();

 const listed=await (await sales.GET(await request('/api/sales?period=all&saleChannel=FROTA','seller'))).json();
 assert.ok(listed.sales.some((s:{id:string})=>s.id===sale.id));
 assert.ok(!listed.sales.some((s:{id:string})=>s.id===otherSale.id));
 assert.ok(listed.sales.every((s:{saleChannel:string})=>s.saleChannel==='FROTA'));
 const scoped=await (await sales.GET(await request('/api/sales?competency=2026-09&saleChannel=FROTA','seller'))).json();
 assert.ok(!scoped.sales.some((s:{id:string})=>s.id===sale.id));
 const fleet=await (await fleetApi.GET(await request('/api/fleet?period=all','finance'))).json();
 assert.equal(fleet.fleet.freights.find((f:{id:string})=>f.id===linkedFreight.id).linkedFleetSaleId,sale.id);
 assert.ok(fleet.fleet.freights.some((f:{linkedFleetSaleId:string|null})=>f.linkedFleetSaleId===null));
 assert.ok(fleet.fleet.billing.freights.every((f:{billingDate:string|null;operationalStatus:string})=>f.billingDate||f.operationalStatus==='FATURADO'));
 assert.equal((await fleetApi.GET(await request('/api/fleet?period=all','seller'))).status,403);
 const csv=await exporter.GET(await request('/api/exports/sales.csv?period=all&saleChannel=FROTA','seller'));
 assert.equal(csv.status,200);assert.match(await csv.text(),/2020-02-01/);
});

test('histórico mensal recupera meses antigos e custos fiscais sem duplicar custos históricos',async()=>{
 const monthly=await import('../../app/api/fleet/monthly/route.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const response=await monthly.GET(await request('/api/fleet/monthly?competency=2026-04','finance'));
 assert.equal(response.status,200,await response.clone().text());
 const report=await response.json() as import('../../lib/domain/fleet-results.ts').MonthlyReport;
 assert.ok(['2026-04','2026-05','2026-06'].every(month=>report.periods.some(p=>p.competency===month && p.hasVehicleHistory)));
 assert.equal(report.periods.find(p=>p.competency==='2034-11')?.closed,true);
 assert.deepEqual(report.vehicleHistory.find(h=>h.id==='calc-history'),{id:'calc-history',vehiclePlate:'CAL1C23',competency:'2026-04',distanceMeters:14345000,monthlyCostCents:1054963});
 assert.equal(calculateMonthlyResult(report.current).resultCents,0);
 const current=await (await monthly.GET(await request('/api/fleet/monthly?competency=2031-01','finance'))).json();
 const totals=calculateMonthlyResult(current.current);
 assert.equal(totals.directCostCents,29000);assert.equal(totals.transportCostCents,11000);assert.equal(totals.resultCents,60000);
 assert.equal(current.current.unbilledCount,0);
 const closed=await (await monthly.GET(await request('/api/fleet/monthly?competency=2034-11','finance'))).json();
 assert.equal(closed.history.length,2);
 assert.ok(closed.history.some((h:import('../../lib/domain/fleet-results.ts').MonthlyClosing)=>calculateMonthlyResult(h.snapshot).resultCents===172000));
});

// The suite above exercises the historical 012 behavior before this corrective
// upgrade, including the legacy identifiers and documents that it left behind.
test('014 converte todos os legados, preserva OS e vínculos, impede números manuais e mantém sequência compartilhada',async()=>{
 const migration=await readFile(new URL('../../database/014_complete_global_sale_numbers.sql',import.meta.url),'utf8');
 await pg.exec("insert into freight_sales(id,sale_number,sale_channel,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) values('legacy-fleet','2021-7','FROTA','2021-01-01','2021-01','SELLER','A','B','2021-01-02','CONFIRMAR',100,0,'admin')");
 const before=await queryAll('select id,sale_number,sale_channel from freight_sales order by sale_date,created_at,id') as {id:string;sale_number:string;sale_channel:string}[];
 const counter=Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value);
 const snapshots=await queryAll('select * from service_order_versions order by order_id,version');
 const payments=await queryAll('select * from payment_transactions order by id');
 const costs=await queryAll('select * from freight_costs order by id');
 // Any failure must roll back renumbering, audit, counter and trigger together.
 await pg.exec("alter table audit_logs add constraint test_block_014 check(actor_email <> 'migration:014')");
 await assert.rejects(pg.exec(migration));await pg.exec('ROLLBACK');
 assert.deepEqual(await queryAll('select id,sale_number,sale_channel from freight_sales order by sale_date,created_at,id'),before);
 assert.equal(Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value),counter);
 await pg.exec('alter table audit_logs drop constraint test_block_014');
 await pg.exec(migration);
 const after=await queryAll('select id,sale_number,sale_channel from freight_sales order by sale_date,created_at,id') as typeof before;
 let next=counter;
 for(let index=0;index<before.length;index++){
  const old=before[index];const current=after[index];
  assert.equal(current.id,old.id);assert.equal(current.sale_channel,old.sale_channel);
  const canonical=/^[1-9][0-9]*$/.test(old.sale_number) && Number(old.sale_number)>=201;
  assert.equal(current.sale_number,canonical?old.sale_number:String(++next));
 }
 assert.ok(after.every(s=>/^[1-9][0-9]*$/.test(s.sale_number) && Number(s.sale_number)>=201));
 assert.equal(new Set(after.map(s=>s.sale_number)).size,after.length);
 assert.deepEqual(await queryAll('select * from service_order_versions order by order_id,version'),snapshots);
 assert.deepEqual(await queryAll('select * from payment_transactions order by id'),payments);
 assert.deepEqual(await queryAll('select * from freight_costs order by id'),costs);
 const audit=await queryAll("select entity_id,previous_value,new_value from audit_logs where actor_email='migration:014' order by entity_id") as {entity_id:string;previous_value:string;new_value:string}[];
 assert.equal(audit.length,next-counter);
 for(const entry of audit){assert.equal(JSON.parse(entry.previous_value).saleNumber,before.find(s=>s.id===entry.entity_id)!.sale_number);assert.equal(JSON.parse(entry.new_value).saleNumber,after.find(s=>s.id===entry.entity_id)!.sale_number);}
 await pg.exec(migration);
 assert.deepEqual(await queryAll('select id,sale_number,sale_channel from freight_sales order by sale_date,created_at,id'),after);
 assert.equal((await queryAll("select id from audit_logs where actor_email='migration:014'")).length,audit.length);
 await assert.rejects(pg.exec("update freight_sales set sale_number='999999' where id='legacy-fleet'"),/não pode ser alterado/);
 await assert.rejects(pg.exec("insert into freight_sales(id,sale_number,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) values('manual-number','999999','2026-09-28','2026-09','SELLER','A','B','2026-09-30','CONFIRMAR',100,0,'admin')"),/gerado automaticamente/);
 const sales=await import('../../app/api/sales/route.ts');const edit=await import('../../app/api/sales/[id]/route.ts');
 const newIds:string[]=[];
 for(const saleChannel of ['FROTA','CEGONHA','FROTA','CEGONHA']){
  const response=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleChannel}));
  assert.equal(response.status,201,await response.clone().text());const sale=await response.json();
  assert.equal(sale.saleNumber,String(++next));newIds.push(sale.id);
 }
 assert.equal((await sales.POST(await request('/api/sales','admin','POST',{...salePayload,saleChannel:'CEGONHA',saleNumber:'999999'}))).status,400);
 assert.equal((await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,saleNumber:'999999'}),{params:Promise.resolve({id:newIds[1]})})).status,400);
 const {issueOrder,readOrderVersion,orderReport}=await import('../../lib/server/service-orders.ts');
 assert.equal((await orderReport('migrate-issued')).stale,true);
 const issued=await issueOrder('migrate-issued',{id:'admin',email:'admin@example.test',name:'Admin',role:'ADMIN'});
 assert.equal(issued.latest!.version,2);assert.equal(issued.latest!.snapshot.saleNumber,after.find(s=>s.id==='migrate-issued')!.sale_number);
 assert.deepEqual((await readOrderVersion('migrate-issued',1))!.snapshot,{schemaVersion:1,saleNumber:'2020-3'});
});

test('importação usa numeração automática e mantém referência da planilha sem reutilizar o número',async()=>{
 const {CENTRAL_FRETE_IMPORT}=await import('../../data/central-frete-import.ts');
 const original={...CENTRAL_FRETE_IMPORT};
 const before=Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value);
 Object.assign(CENTRAL_FRETE_IMPORT,{importKey:'numbering-import-test',workbookName:'fixture.xlsx',sourceSheet:'VENDAS',sourceHash:'fixture-hash',validRows:1,providers:[{id:'numbering-import-provider',name:'PRESTADOR TESTE'}],sales:[{
  id:'numbering-import-sale',importKey:'numbering-import-row',sourceRow:2,saleNumber:'2026-9000',saleDate:'2026-09-28',competency:'2026-09',sellerName:'SELLER',vehicle:'UNO',plate:'ABC1D23',initialProviderId:'numbering-import-provider',initialProviderName:'PRESTADOR TESTE',origin:'A',destination:'B',dueDate:'2026-09-30',operationalStatus:'CONFIRMAR',legacyOperationalStatus:'CONFIRMAR',freightAmountCents:10000,commissionBasisPoints:0,paymentMethod:'PIX',costs:[],advance:{amountCents:100,occurredAt:'2026-09-28',notes:'TESTE'}
 }]});
 try{
  const api=await import('../../app/api/import/central-frete/route.ts');
  const result=await api.POST(await request('/api/import/central-frete','admin','POST'));
  assert.equal(result.status,201,await result.clone().text());
  const sale=await queryFirst("select sale_number,notes,source_row from freight_sales where id='numbering-import-sale'") as {sale_number:string;notes:string;source_row:number};
  assert.equal(sale.sale_number,String(before+1));assert.match(sale.notes,/REFERÊNCIA ORIGINAL: 2026-9000/);assert.equal(sale.source_row,2);
  const again=await api.POST(await request('/api/import/central-frete','admin','POST'));
  assert.equal((await again.json()).alreadyImported,true);
  assert.equal(Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value),before+1);
 }finally{Object.assign(CENTRAL_FRETE_IMPORT,original);}
});


test('Frota gera número global e OS própria, adota o documento ao vincular venda e preserva histórico',async()=>{
 await pg.exec(await readFile(new URL('../../database/015_fleet_numbers_and_orders.sql',import.meta.url),'utf8'));
 const create=await import('../../app/api/fleet/freights/route.ts');const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const orders=await import('../../app/api/fleet/freights/[id]/service-order/route.ts');const sales=await import('../../app/api/sales/route.ts');
 const {loadFleetData}=await import('../../lib/server/fleet.ts');const {readOrderVersion}=await import('../../lib/server/service-orders.ts');
 const before=Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value);
 const payload={vehicleId:'results-truck',driverId:'results-driver',clientId:'freight-client-5',clientName:'CLIENTE OS FROTA',originLocationType:'PATIO',destinationLocationType:'PORTA',origin:'ORIGEM OS',destination:'DESTINO OS',pickupDate:'2035-01-01',operationalStatus:'EM_ROTA',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:1000,driverCommissionCents:2000,actualFuelCostCents:10000,cargoVehicles:[{model:'UNO',plate:'ABC1D23'}]};
 const created=await create.POST(await request('/api/fleet/freights','admin','POST',payload));assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();const ctx={params:Promise.resolve({id})};
 const f=(await loadFleetData(true,true,true,false,'2035-01')).freights.find(f=>f.id===id)!;assert.equal(f.saleNumber,String(before+1));
 const cegonha=await sales.POST(await request('/api/sales','seller','POST',salePayload));assert.equal(cegonha.status,201);const c=await cegonha.json();assert.equal(c.saleNumber,String(before+2));
 for(const role of ['seller','operator']){assert.equal((await orders.GET(await request('/api/fleet/freights/x/service-order',role),ctx)).status,403);assert.equal((await orders.POST(await request('/api/fleet/freights/x/service-order',role,'POST'),ctx)).status,403);}
 assert.equal((await orders.GET(await request('/api/fleet/freights/x/service-order?format=pdf','finance'),ctx)).status,404);
 const result=await orders.POST(await request('/api/fleet/freights/x/service-order','finance','POST'),ctx);assert.equal(result.status,200,await result.clone().text());const first=await result.json();
 assert.equal(first.latest.snapshot.saleNumber,f.saleNumber);assert.equal(first.latest.snapshot.clientName,payload.clientName);assert.equal(first.latest.snapshot.originLocationType,'PATIO');assert.equal(first.latest.snapshot.destinationLocationType,'PORTA');assert.equal(first.latest.snapshot.financialDueDate,null);assert.equal(first.latest.snapshot.installments.length,0);assert.equal(first.latest.snapshot.cargoVehicles.length,1);assert.equal(first.latest.snapshot.operationValues,undefined);
 await Promise.all(Array.from({length:3},async()=>orders.POST(await request('/api/fleet/freights/x/service-order','admin','POST'),ctx)));
 assert.equal((await queryAll('select version from service_order_versions where order_id=?',[first.latest.orderId])).length,1);
 assert.equal((await edit.PATCH(await request('/api/fleet/freights/x','finance','PATCH',{insuranceCostCents:3000}),ctx)).status,200);
 assert.equal((await (await orders.GET(await request('/api/fleet/freights/x/service-order','finance'),ctx)).json()).stale,false);
 assert.equal((await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{clientId:'freight-client-6',clientName:'CLIENTE ATUALIZADO'}),ctx)).status,200);
 assert.equal((await (await orders.GET(await request('/api/fleet/freights/x/service-order','finance'),ctx)).json()).stale,true);
 const updated=await (await orders.POST(await request('/api/fleet/freights/x/service-order','admin','POST'),ctx)).json();assert.equal(updated.latest.version,2);
 assert.deepEqual((await readOrderVersion(id,1,'fleet'))!.snapshot,first.latest.snapshot);
 const pdf=await orders.GET(await request('/api/fleet/freights/x/service-order?format=pdf&download=1','finance'),ctx);assert.equal(pdf.status,200);assert.equal(pdf.headers.get('Content-Type'),'application/pdf');assert.equal(pdf.headers.get('Content-Disposition'),`attachment; filename="OS-Central-${f.saleNumber}.pdf"`);
 if(process.env.CENTRAL_QA_OUTPUT){const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/os-frota.pdf`,new Uint8Array(await pdf.arrayBuffer()));}
 const linked=await sales.POST(await request('/api/sales','admin','POST',{...salePayload,saleChannel:'FROTA',fleetFreightId:id}));assert.equal(linked.status,201,await linked.clone().text());const sale=await linked.json();assert.equal(sale.saleNumber,f.saleNumber);
 assert.equal(Number((await queryFirst('select last_value from global_sale_number_counter where id=1') as {last_value:number}).last_value),before+2);
 const owner=await queryFirst('select sale_id,fleet_freight_id from service_orders where id=?',[first.latest.orderId]);assert.deepEqual(owner,{sale_id:sale.id,fleet_freight_id:null});
 const adopted=await (await orders.POST(await request('/api/fleet/freights/x/service-order','admin','POST'),ctx)).json();assert.equal(adopted.latest.orderId,first.latest.orderId);assert.equal(adopted.latest.version,3);assert.equal(adopted.latest.snapshot.clientName,'CLIENTE ATUALIZADO');
 assert.deepEqual((await readOrderVersion(sale.id,1))!.snapshot,first.latest.snapshot);
 assert.equal((await create.POST(await request('/api/fleet/freights','admin','POST',{...payload,saleNumber:'9999'}))).status,400);
 assert.equal((await edit.PATCH(await request('/api/fleet/freights/x','admin','PATCH',{saleNumber:'9999'}),ctx)).status,400);
 await assert.rejects(pg.query('update fleet_freights set sale_number=$1 where id=$2',['9999',id]),/não pode ser alterado/);
 await assert.rejects(pg.query('update freight_sales set fleet_freight_id=$1 where id=$2',[id,c.id]),/números diferentes/);
 const removed=await edit.DELETE(await request('/api/fleet/freights/x','admin','DELETE'),ctx);assert.equal(removed.status,200,await removed.clone().text());assert.equal((await readOrderVersion(sale.id))!.version,3);
 const standalone=await create.POST(await request('/api/fleet/freights','admin','POST',payload));const solo=await standalone.json();const soloCtx={params:Promise.resolve({id:solo.id})};
 const soloOrder=await (await orders.POST(await request('/api/fleet/freights/x/service-order','admin','POST'),soloCtx)).json();
 assert.equal((await edit.DELETE(await request('/api/fleet/freights/x','admin','DELETE'),soloCtx)).status,200);
 assert.equal((await queryAll('select * from service_order_versions where order_id=?',[soloOrder.latest.orderId])).length,0);
});

test('telefone cadastrado sem email chega à OS; versões antigas e permissões são preservadas', async () => {
 const users = await import('../../app/api/users/route.ts');
 const userApi = await import('../../app/api/users/[id]/route.ts');
 const data = {name:'CONTATO TESTE',username:'contato.teste',phone:'(11) 98888-7766',password:'senha-ficticia-123',role:'ADMIN'};
 assert.equal((await users.POST(await request('/api/users','seller','POST',data))).status,403);
 assert.equal((await users.POST(await request('/api/users','admin','POST',{...data,phone:'123'}))).status,400);
 const response = await users.POST(await request('/api/users','admin','POST',data));
 assert.equal(response.status,201,await response.clone().text());
 const {id}=await response.json();
 assert.deepEqual(await queryFirst('select phone,email from users where id=?',[id]),{phone:'11988887766',email:'contato.teste@centralfrete.local'});
 const listed=await (await users.GET(await request('/api/users','admin'))).json();
 assert.equal(listed.users.find((u:{id:string})=>u.id===id).phone,'11988887766');
 const {issueOrder,readOrderVersion,orderReport}=await import('../../lib/server/service-orders.ts');
 const actor={id,email:'contato.teste@centralfrete.local',name:data.name,role:'ADMIN' as const};
 const freight=await queryFirst('select id from fleet_freights where not exists(select 1 from freight_sales where fleet_freight_id=fleet_freights.id) limit 1') as {id:string};
 await pg.query('update fleet_freights set created_by=$1 where id=$2',[id,freight.id]);
 const before=await issueOrder(freight.id,actor,'fleet');
 assert.equal(before.latest!.snapshot.issuer.contact,'11988887766');
 assert.equal(before.latest!.snapshot.issuer.contactSource,'CREATOR');
 const edited=await userApi.PATCH(await request('/api/users/x','admin','PATCH',{...data,phone:'(11) 97777-6655',active:true,password:''}),{params:Promise.resolve({id})});
 assert.equal(edited.status,200,await edited.clone().text());
 assert.equal((await orderReport(freight.id,'fleet')).stale,true);
 const after=await issueOrder(freight.id,actor,'fleet');
 assert.equal(after.latest!.snapshot.issuer.contact,'11977776655');
 assert.equal((await readOrderVersion(freight.id,before.latest!.version,'fleet'))!.snapshot.issuer.contact,'11988887766');
 const empty=await userApi.PATCH(await request('/api/users/x','admin','PATCH',{...data,phone:'',active:true}),{params:Promise.resolve({id})});
 assert.equal(empty.status,200,await empty.clone().text());
 assert.equal((await issueOrder(freight.id,actor,'fleet')).latest!.snapshot.issuer.contact,null);
});

test('excluir placa com viagem e histórico preserva relações, totais e auditoria',async()=>{
 await pg.exec(`insert into fleet_vehicles(id,plate) values('delete-history','DEL1A23');
 insert into fleet_trips(id,name,vehicle_id,driver_id,operation_date,fuel_cost_cents,toll_cents,other_cost_cents) values('delete-trip','VIAGEM PRESERVADA','delete-history','results-driver','2040-02-01',3000,1000,0);
 insert into fleet_vehicle_costs(id,vehicle_id,competency,distance_meters,monthly_cost_cents) values('delete-cost','delete-history','2040-02',100000,50000);
 insert into fleet_freights(id,trip_id,vehicle_id,vehicle_plate,driver_id,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters)
 values('delete-trip-freight','delete-trip','delete-history','DEL1A23','results-driver','MOTORISTA','CLIENTE','A','B','2040-02-01','2040-02-01','FATURADO',10000,1000);`);
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const before=calculateMonthlyResult((await loadMonthlyReport('2040-02')).current);
 const api=await import('../../app/api/fleet/vehicles/[id]/route.ts');
 const context={params:Promise.resolve({id:'delete-history'})};
 assert.equal((await api.DELETE(await request('/api/fleet/vehicles/x','finance','DELETE'),context)).status,403);
 const result=await api.DELETE(await request('/api/fleet/vehicles/x','admin','DELETE'),context);
 assert.equal(result.status,200,await result.clone().text());
 assert.equal(await queryFirst("select id from fleet_vehicles where id='delete-history'"),null);
 const report=await loadMonthlyReport('2040-02');
 assert.deepEqual(calculateMonthlyResult(report.current),before);
 assert.equal(report.vehicleHistory[0].vehiclePlate,'DEL1A23');
 assert.deepEqual(await queryFirst("select vehicle_id,vehicle_plate from fleet_trips where id='delete-trip'"),{vehicle_id:null,vehicle_plate:'DEL1A23'});
 assert.deepEqual(await queryFirst("select trip_id,vehicle_id,vehicle_plate from fleet_freights where id='delete-trip-freight'"),{trip_id:'delete-trip',vehicle_id:null,vehicle_plate:'DEL1A23'});
 assert.ok(await queryFirst("select id from audit_logs where entity_type='FLEET_VEHICLE' and entity_id='delete-history' and action='DELETED'"));
 assert.equal((await api.DELETE(await request('/api/fleet/vehicles/x','admin','DELETE'),context)).status,404);
});

test('apuração soma mais de 500 vendas e frota uma vez, mostra datas pendentes e preserva fechamento',async()=>{
 await pg.exec(`insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,operational_status,freight_amount_cents,distance_meters,actual_fuel_cost_cents)
 values('month-fallback','TES1T23','MOTORISTA','CLIENTE','A','B','2040-03-01','SEM_PREVISAO',10000,1000,2000);
 insert into freight_sales(id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,created_by)
 select 'monthly-sale-'||i,'2040-03-01','2040-03','TESTE','A','B','2040-03-30','SEM_PREVISAO',1000,1000,0,'admin' from generate_series(1,501) i;
 insert into freight_sales(id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,sale_channel,fleet_freight_id,created_by)
 values('monthly-linked','2040-03-01','2040-03','TESTE','A','B','2040-03-30','SEM_PREVISAO',10000,0,0,'FROTA','month-fallback','admin');`);
 await pg.exec("update freight_sales set sale_channel='FROTA',billing_date='2040-03-01' where id like 'monthly-sale-%'");
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const api=await import('../../app/api/fleet/monthly/route.ts');
 const report=await loadMonthlyReport('2040-03');
 const totals=calculateMonthlyResult(report.current);
 assert.equal(report.current.sales!.length,501);assert.equal(report.current.unbilledCount,1);
 assert.equal(totals.revenueCents,511000);assert.equal(totals.variableCostCents,52100);assert.equal(totals.resultCents,458900);
 assert.equal((await loadFleetData(true,true,true,false,'2040-03')).billing.revenueCents,501000);
 const close=()=>request('/api/fleet/monthly','finance','POST',{competency:'2040-03',action:'CLOSE',reviewed:true});
 assert.equal((await api.POST(await close())).status,409);
 await pg.exec("update fleet_freights set billing_date='2040-03-02' where id='month-fallback'; update freight_sales set costs_pending=1 where id='monthly-sale-1';");
 assert.equal((await api.POST(await close())).status,409);
 await pg.exec("update freight_sales set costs_pending=0 where id='monthly-sale-1';");
 const closed=await api.POST(await close());assert.equal(closed.status,200,await closed.clone().text());
 const saved=(await loadMonthlyReport('2040-03')).history[0].snapshot;
 await pg.exec("update freight_sales set freight_amount_cents=2000 where id='monthly-sale-1';");
 assert.deepEqual((await loadMonthlyReport('2040-03')).history[0].snapshot,saved);
 assert.equal(calculateMonthlyResult(saved).resultCents,458900);
 // A legacy snapshot keeps the old result, without pulling live sales into it.
 const legacy={...saved,sales:undefined,dateBasis:undefined};
 assert.equal(calculateMonthlyResult(legacy).resultCents,8000);
 await pg.exec("update fleet_freights set billing_date='2040-04-02' where id='month-fallback';");
 assert.equal((await loadFleetData(true,true,true,false,'2040-03')).billing.freightCount,501);
 assert.equal((await loadFleetData(true,true,true,false,'2040-04')).billing.freightCount,1);
});

test('faturamento e fechamento incluem vendas Frota, fretes antigos e comissão sem cadastro, sem duplicação',async()=>{
 await pg.exec(`insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,driver_commission_cents,actual_fuel_cost_cents)
 values('consolidated-freight','TES1T23','MOTORISTA HISTÓRICO','CLIENTE FROTA','A','B','2041-01-01','2041-02-01','FATURADO',10000,1000,2000,0),
 ('consolidated-fallback','TES1T23','SEM CADASTRO','CLIENTE SEM DATA','A','B','2041-02-01',null,'SEM_PREVISAO',3000,1000,700,0);
 insert into freight_sales(id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,sale_channel,created_by)
 select 'consolidated-sale-'||i,'2041-02-01','2041-02','TESTE','A','B','2041-02-28','SEM_PREVISAO',1000,0,0,'FROTA','admin' from generate_series(1,501) i;
 insert into freight_sales(id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,sale_channel,fleet_freight_id,created_by)
 values('consolidated-linked','2041-01-01','2041-01','TESTE','A','B','2041-01-30','SEM_PREVISAO',10000,0,0,'FROTA','consolidated-freight','admin'),
 ('consolidated-cegonha','2041-02-01','2041-02','TESTE','A','B','2041-02-28','SEM_PREVISAO',5000,0,0,'CEGONHA',null,'admin');`);
 await pg.exec("update freight_sales set billing_date='2041-02-01' where id like 'consolidated-sale-%'");
 const fleetApi=await import('../../app/api/fleet/route.ts');
 const monthlyApi=await import('../../app/api/fleet/monthly/route.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const response=await fleetApi.GET(await request('/api/fleet?competency=2041-02','finance'));
 assert.equal(response.status,200,await response.clone().text());
 const {fleet}=await response.json() as {fleet:import('../../lib/domain/fleet.ts').FleetData};
 assert.equal(fleet.billing.sales.length,501);assert.equal(fleet.billing.freightCount,502);
 assert.equal(fleet.billing.revenueCents,511000);assert.equal(fleet.billing.commissionCents,700);
 assert.equal(fleet.billing.drivers.reduce((sum,d)=>sum+d.commissionCents,0),700);
 assert.equal(fleet.billing.drivers.length,1);
 assert.equal(fleet.billing.freights.find(f=>f.id==='consolidated-freight')!.driverCommissionCents,2000);
 const monthly=await (await monthlyApi.GET(await request('/api/fleet/monthly?competency=2041-02','finance'))).json() as import('../../lib/domain/fleet-results.ts').MonthlyReport;
 const totals=calculateMonthlyResult(monthly.current);
 assert.equal(totals.fleetSalesRevenueCents,501000);assert.equal(totals.fleetRevenueCents,13000);
 assert.equal(totals.fleetRevenueCents+totals.fleetSalesRevenueCents-fleet.billing.revenueCents,3000); // apuração inclui o frete ainda não faturado
 assert.equal(totals.revenueCents,514000);assert.equal(totals.driverCommissionCents,700);
 assert.equal(totals.variableCostCents,700);assert.equal(monthly.current.unbilledCount,1);
 assert.ok(monthly.current.freights.every(f=>f.saleNumber && f.date));
 assert.equal(monthly.current.sales?.find(s=>s.id==='consolidated-sale-1')?.saleChannel,'FROTA');
 const january=await (await fleetApi.GET(await request('/api/fleet?competency=2041-01','finance'))).json();
 assert.equal(january.fleet.billing.revenueCents,0); // linked sale follows the operation's billing month
 assert.equal((await fleetApi.GET(await request('/api/fleet?competency=2041-02','seller'))).status,403);
});

test('OS usa vendedora da venda e não troca contato entre visualizadores ou emissores',async()=>{
 await pg.exec(`update users set phone='11911112222' where id='seller'; update users set phone='11933334444' where id='admin'; update users set phone='11955556666' where id='finance';
 insert into freight_sales(id,sale_date,competency,seller_id,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,created_by)
 values('seller-phone-sale','2041-03-01','2041-03','seller','SELLER','A','B','2041-03-30','SEM_PREVISAO',1000,0,0,'admin');`);
 const api=await import('../../app/api/sales/[id]/service-order/route.ts');
 const context={params:Promise.resolve({id:'seller-phone-sale'})};
 const issue=async(actor:string)=>(await api.POST(await request('/api/sales/seller-phone-sale/service-order',actor,'POST'),context)).json();
 const first=await issue('finance');
 assert.equal(first.latest.snapshot.issuer.contact,'11911112222');assert.equal(first.latest.snapshot.issuer.contactSource,'SELLER');
 for(const actor of ['admin','seller','finance']) {
   const report=await (await api.GET(await request('/api/sales/seller-phone-sale/service-order',actor),context)).json();
   assert.equal(report.stale,false);assert.equal(report.latest.snapshot.issuer.contact,'11911112222');
   assert.equal((await issue(actor)).latest.version,first.latest.version);
 }
 await pg.exec("update users set phone='11977778888' where id='finance'");
 assert.equal((await issue('finance')).latest.version,first.latest.version);
 await pg.exec("update users set phone='11922229999' where id='seller'");
 const after=await issue('admin');assert.equal(after.latest.version,first.latest.version+1);assert.equal(after.latest.snapshot.issuer.contact,'11922229999');
 const {readOrderVersion,orderReport}=await import('../../lib/server/service-orders.ts');
 assert.equal((await readOrderVersion('seller-phone-sale',first.latest.version))!.snapshot.issuer.contact,'11911112222');
 // Legacy name-only sales use a unique exact match; missing/ambiguous names stay empty.
 await pg.exec("update freight_sales set seller_id=null where id='seller-phone-sale'");
 assert.equal((await issue('finance')).latest.snapshot.issuer.contact,'11922229999');
 await pg.exec("insert into users(id,email,name,role,phone) values('seller-homonym','homonym@example.test','SELLER','VENDEDOR','11999990000')");
 assert.equal((await issue('admin')).latest.snapshot.issuer.contact,null);
 await pg.exec("update freight_sales set seller_id='seller' where id='seller-phone-sale'; update users set phone=null where id='seller'");
 assert.equal((await issue('admin')).latest.snapshot.issuer.contact,null);
 assert.equal((await orderReport('seller-phone-sale')).stale,false);
 // Documents issued with the former viewer-contact rule are detected as stale without overwriting history.
 await pg.exec(`update service_order_versions set snapshot=jsonb_set(snapshot,'{issuer,contactSource}','"USER"'::jsonb) where order_id='${first.latest.orderId}' and version=${(await issue('admin')).latest.version}`);
 assert.equal((await orderReport('seller-phone-sale')).stale,true);
});

test('relatório completo respeita canal, vendedor e permissões; PDF não trunca 501 vendas e o frete consolidado',async()=>{
 const api=await import('../../app/api/reports/sales/route.ts');
 const {PDFDocument}=await import('pdf-lib');
 const report=await (await api.GET(await request('/api/reports/sales?competency=2041-02&saleChannel=FROTA','finance'))).json();
 assert.equal(report.report.sales.length,502);assert.equal(report.report.totals.freight,504000);
 assert.ok(report.report.sales.some((s:{id:string})=>s.id==='freight:consolidated-fallback'));
 assert.equal(report.report.expenses.reduce((s:number,r:{value:number})=>s+r.value,0),report.report.totals.cost);
 const cegonha=await (await api.GET(await request('/api/reports/sales?competency=2041-02&saleChannel=CEGONHA','finance'))).json();assert.equal(cegonha.report.sales.length,1);
 const seller=await (await api.GET(await request('/api/reports/sales?competency=2041-02','seller'))).json();assert.equal(seller.report.sales.length,0);
 const mine=await (await api.GET(await request('/api/reports/sales?competency=2041-03','seller'))).json();assert.equal(mine.report.sales.length,1);assert.equal(mine.report.sales[0].sellerId,'seller');
 assert.equal((await api.GET(await request('/api/reports/sales?competency=2041-99','admin'))).status,400);
 assert.equal((await api.GET(await request('/api/reports/sales?saleChannel=INVALID','admin'))).status,400);
 assert.equal((await api.GET(await request('/api/reports/sales?format=pdf','operator'))).status,403);
 const pdf=await api.GET(await request('/api/reports/sales?competency=2041-02&saleChannel=FROTA&format=pdf','finance'));
 assert.equal(pdf.status,200,await pdf.clone().text());assert.equal(pdf.headers.get('cache-control'),'private, no-store');
 const bytes=new Uint8Array(await pdf.arrayBuffer());assert.ok((await PDFDocument.load(bytes)).getPageCount()>2);
 if(process.env.CENTRAL_QA_OUTPUT){const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/relatorio-extenso.pdf`,bytes);}
});

test('fechamento e PDF exclusivos Frota classificam lançamentos, preservam histórico e reconciliam despesas',async()=>{
 const monthly=await import('../../app/api/fleet/monthly/route.ts');
 const exporter=await import('../../app/api/fleet/monthly/pdf/route.ts');
 const reportApi=await import('../../app/api/reports/sales/route.ts');
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const {PDFDocument}=await import('pdf-lib');
 const revenue=[8500,6700,9200,5800,7600,10400,6400,7900],direct=[600,500,700,400,600,900,400,600],fuel=[900,650,1100,550,800,1300,600,900],toll=[200,150,250,100,180,300,120,200];
 for(let i=0;i<8;i++)await pg.query(`insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,driver_commission_cents,other_cost_cents,actual_fuel_cost_cents,toll_cents)
 values($1,'DEM1A23',$2,$3,'ORIGEM','DESTINO','2042-09-01',$4,'FATURADO',$5,100000,$6,$7,$8,$9)`,[`pdf-freight-${i}`,`MOTORISTA ${String.fromCharCode(65+i%3)}`,`CLIENTE ${String.fromCharCode(65+i%4)}`,`2042-09-${String(3+i*3).padStart(2,'0')}`,revenue[i]*100,revenue[i]*10,direct[i]*100,fuel[i]*100,toll[i]*100]);
 for(const [i,rev] of [4200,3600,5800,3900].entries()){
 await pg.query(`insert into freight_sales(id,sale_date,competency,seller_id,seller_name,client_id,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,sale_channel,created_by)
 values($1,'2042-09-08','2042-09','seller','SELLER',null,'A','B','2042-09-30','CONFIRMAR',$2,700,0,'FROTA','admin')`,[`pdf-sale-${i}`,rev*100]);
 await pg.query("insert into freight_costs(id,sale_id,category,amount_cents,confirmed) values($1,$2,'PRESTADOR_SERVICO',$3,1)",[`pdf-cost-${i}`,`pdf-sale-${i}`,rev*50]);}
 await pg.exec(`insert into freight_sales(id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,sale_channel,created_by)
 values('pdf-cegonha','2042-09-01','2042-09','CEGONHA','A','B','2042-09-30','CONFIRMAR',9900000,0,1,'CEGONHA','admin');
 insert into company_monthly_entries(id,competency,kind,description,amount_cents) values('unassigned-fleet','2042-09','VARIABLE','OUTRA DESPESA FROTA',60000),('unassigned-cegonha','2042-09','FIXED','DESPESA CEGONHA',700000);`);
 const post=(body:object)=>request('/api/fleet/monthly','finance','POST',{competency:'2042-09',...body});
 assert.equal((await monthly.POST(await post({action:'ENTRY',kind:'FIXED',description:'Custos fixos da Frota',amountCents:450000}))).status,200);
 let data=await loadMonthlyReport('2042-09');assert.equal(data.unassignedEntries.length,2);assert.equal(data.current.sales!.length,4);assert.equal(calculateMonthlyResult(data.current).resultCents,4627500);
 assert.equal((await monthly.POST(await post({action:'CLASSIFY_ENTRY',id:'unassigned-fleet'}))).status,400);
 assert.equal((await monthly.POST(await post({action:'CLASSIFY_ENTRY',id:'unassigned-fleet',confirmed:true}))).status,200);
 data=await loadMonthlyReport('2042-09');assert.equal(data.unassignedEntries.length,1);
 const totals=calculateMonthlyResult(data.current);assert.equal(totals.revenueCents,8000000);assert.equal(totals.resultCents,4567500);assert.equal(totals.driverCommissionCents,625000);
 assert.equal(data.current.freights[0].driverName,'MOTORISTA A');assert.equal(data.current.scope,'FROTA');
 assert.equal((await monthly.POST(await post({action:'CLOSE',reviewed:true}))).status,200); // pending Cegonha costs do not block Frota
 const saved=(await loadMonthlyReport('2042-09')).history[0];
 assert.equal((await monthly.POST(await post({action:'CLASSIFY_ENTRY',id:'unassigned-cegonha',confirmed:true}))).status,409);
 assert.equal((await exporter.GET(await request('/api/fleet/monthly/pdf?competency=2042-09','seller'))).status,403);
 assert.equal((await exporter.GET(await request('/api/fleet/monthly/pdf?competency=2042-08&closingId='+saved.id,'finance'))).status,404);
 for(const [name,url,api] of [['fechamento',`/api/fleet/monthly/pdf?competency=2042-09&closingId=${saved.id}`,exporter],['relatorio','/api/reports/sales?competency=2042-09&saleChannel=FROTA&format=pdf',reportApi]] as const){
 const response=await api.GET(await request(url,'finance'));assert.equal(response.status,200,await response.clone().text());assert.equal(response.headers.get('content-type'),'application/pdf');
 const bytes=new Uint8Array(await response.arrayBuffer());assert.ok((await PDFDocument.load(bytes)).getPageCount()>=2);
 if(process.env.CENTRAL_QA_OUTPUT){const {mkdir,writeFile}=await import('node:fs/promises');await mkdir(process.env.CENTRAL_QA_OUTPUT,{recursive:true});await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/${name}.pdf`,bytes);}}
 await pg.exec("update fleet_freights set freight_amount_cents=freight_amount_cents+10000 where id='pdf-freight-0'");
 data=await loadMonthlyReport('2042-09');assert.deepEqual(data.history[0].snapshot,saved.snapshot);assert.equal(calculateMonthlyResult(data.current).resultCents,4577500);
 // Reapplying migration classifies only proven fleet-only archives, preserving every snapshot.
 await pg.query("insert into company_monthly_closings(id,competency,snapshot,closed_by) values('archive-safe','2043-01',$1,'admin'),('archive-mixed','2043-02',$2,'admin')",[JSON.stringify({...saved.snapshot,competency:'2043-01',entries:[]}),JSON.stringify({...saved.snapshot,competency:'2043-02',sales:[{id:'c',saleChannel:'CEGONHA',revenueCents:100,costCents:0,costsPending:false}]})]);
 const before=await queryAll("select id,snapshot from company_monthly_closings where id like 'archive-%' order by id");
 const migration=await readFile(new URL('../../database/016_fleet_monthly_scope.sql',import.meta.url),'utf8');await pg.exec(migration);await pg.exec(migration);
 assert.deepEqual(await queryAll("select id,snapshot from company_monthly_closings where id like 'archive-%' order by id"),before);
 assert.equal((await loadMonthlyReport('2043-01')).history.length,1);assert.equal((await loadMonthlyReport('2043-02')).legacyClosings.length,1);assert.equal((await loadMonthlyReport('2043-02')).history.length,0);
 assert.equal((await exporter.GET(await request('/api/fleet/monthly/pdf?competency=2043-02&closingId=archive-mixed','finance'))).status,404);
 assert.equal((await monthly.POST(await request('/api/fleet/monthly','finance','POST',{action:'CLOSE',competency:'2043-02',reviewed:true}))).status,200); // General archive does not block the fleet month.
});

test('faturamento aceita data ou status Faturado, não inclui recebimento isolado e segue o mês faturado',async()=>{
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 await pg.exec(`insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,driver_commission_cents)
 values('bill-explicit','TES1T23','MOTORISTA','CLIENTE','A','B','2043-01-01','2043-02-01','ENTREGUE',10000,1000,1000),
 ('bill-status','TES1T23','MOTORISTA','CLIENTE','A','B','2043-01-01',null,'FATURADO',20000,1000,2000),
 ('bill-pending','TES1T23','MOTORISTA','CLIENTE','A','B','2043-01-01',null,'ENTREGUE',30000,1000,3000);
 update fleet_freights set payment_status='PAGO' where id='bill-pending';`);
 const jan=await loadFleetData(true,true,true,false,'2043-01');
 assert.deepEqual(jan.billing.freights.map(f=>f.id),['bill-status']);assert.equal(jan.billing.commissionCents,6000);
 assert.equal(jan.freights.length,3); // operação preservada
 const feb=await loadFleetData(true,true,true,false,'2043-02');assert.deepEqual(feb.billing.freights.map(f=>f.id),['bill-explicit']);assert.equal(feb.billing.commissionCents,0);
 const sales=await import('../../app/api/sales/route.ts');const edit=await import('../../app/api/sales/[id]/route.ts');
 const payload={...salePayload,saleChannel:'FROTA',saleDate:'2043-01-02',financialDueDate:'2043-03-01',paymentMethod:'FATURADO',billingDate:'2043-02-02'};
 const created=await sales.POST(await request('/api/sales','seller','POST',payload));assert.equal(created.status,201,await created.clone().text());const {id}=await created.json();
 assert.ok((await loadFleetData(true,true,true,false,'2043-02')).billing.sales.some(s=>s.id===id));
 assert.ok(!(await loadFleetData(true,true,true,false,'2043-01')).billing.sales.some(s=>s.id===id));
 const ctx={params:Promise.resolve({id})};
 assert.equal((await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...payload,billingDate:'2043-02-30'}),ctx)).status,400);
 assert.equal((await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...payload,billingDate:null}),ctx)).status,200);
 assert.ok(!(await loadFleetData(true,true,true,false,'2043-02')).billing.sales.some(s=>s.id===id)); // método FATURADO não comprova faturamento
});

test('clientes Frota, Cegonha e Ambos filtram seletores e validam criação/edição sem perder vínculos históricos',async()=>{
 const api=await import('../../app/api/clients/route.ts');const detail=await import('../../app/api/clients/[id]/route.ts');
 const sales=await import('../../app/api/sales/route.ts');const edit=await import('../../app/api/sales/[id]/route.ts');
 const ids:Record<string,string>={};
 for(const channel of ['FROTA','CEGONHA','AMBOS']){
  const response=await api.POST(await request('/api/clients','seller','POST',{type:'PJ',legalName:`CANAL ${channel}`,saleChannel:channel,contacts:[{name:'Contato'}],addresses:[]}));
  assert.equal(response.status,201,await response.clone().text());ids[channel]=(await response.json()).id;
 }
 const listed=await (await api.GET(await request('/api/clients?saleChannel=FROTA','seller'))).json();
 assert.ok(listed.clients.some((c:{id:string})=>c.id===ids.FROTA));assert.ok(listed.clients.some((c:{id:string})=>c.id===ids.AMBOS));assert.ok(!listed.clients.some((c:{id:string})=>c.id===ids.CEGONHA));
 const exact=await (await api.GET(await request('/api/clients?channel=AMBOS&q=CANAL','admin'))).json();assert.deepEqual(exact.clients.map((c:{id:string})=>c.id),[ids.AMBOS]);
 assert.equal((await api.GET(await request('/api/clients?saleChannel=INVÁLIDO'))).status,400);
 for(const channel of ['FROTA','CEGONHA']){
  const opposite=channel==='FROTA'?'CEGONHA':'FROTA';
  assert.equal((await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleChannel:channel,clientId:ids[opposite]}))).status,400);
  const response=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleChannel:channel,clientId:ids.AMBOS}));assert.equal(response.status,201,await response.clone().text());
 }
 const created=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleChannel:'FROTA',clientId:ids.FROTA}));const {id}=await created.json();assert.ok(id);
 const context={params:Promise.resolve({id:ids.FROTA})};
 const changed=await detail.PATCH(await request('/api/clients/x','admin','PATCH',{saleChannel:'CEGONHA',active:false}),context);assert.equal(changed.status,200,await changed.clone().text());
 assert.equal((await detail.PATCH(await request('/api/clients/x','seller','PATCH',{saleChannel:'FROTA'}),context)).status,403);
 const history=await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,saleChannel:'FROTA',clientId:ids.FROTA}),{params:Promise.resolve({id})});assert.equal(history.status,200,await history.clone().text());
 assert.equal((await edit.PATCH(await request('/api/sales/x','admin','PATCH',{...salePayload,saleChannel:'FROTA',clientId:ids.CEGONHA}),{params:Promise.resolve({id})})).status,400);
 const data=await (await detail.GET(await request('/api/clients/x'),context)).json();assert.equal(data.client.saleChannel,'CEGONHA');assert.equal(data.client.active,false);
});

test('motoristas e prestadores persistem endereço estruturado, situação e preservam endereços antigos',async()=>{
 const providers=await import('../../app/api/providers/route.ts');const providerEdit=await import('../../app/api/providers/[id]/route.ts');
 const drivers=await import('../../app/api/fleet/drivers/route.ts');const driverEdit=await import('../../app/api/fleet/drivers/[id]/route.ts');
 const address={cep:'18110-000',street:'Rua Teste',number:'20',complement:'Sala 1',district:'Centro',city:'Votorantim',state:'SP'};
 const payload={companyName:'Prestador estruturado',referenceName:'Contato',active:false,addressDetails:address};
 const response=await providers.POST(await request('/api/providers','admin','POST',payload));assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();
 const read=await (await providers.GET(await request('/api/providers','seller'))).json();const row=read.providers.find((p:{id:string})=>p.id===id);assert.equal(row.active,false);assert.equal(row.addressDetails.cep,'18110000');assert.match(row.yardAddress,/RUA TESTE, 20/);
 const changed=await providerEdit.PATCH(await request('/api/providers/x','admin','PATCH',{...payload,active:true,addressDetails:{...address,number:'30'}}),{params:Promise.resolve({id})});assert.equal(changed.status,200,await changed.clone().text());
 assert.equal((await providers.POST(await request('/api/providers','admin','POST',{...payload,addressDetails:{...address,cep:'123'}}))).status,400);
 assert.equal((await providers.POST(await request('/api/providers','seller','POST',payload))).status,403);
 const legacy=await providers.POST(await request('/api/providers','admin','POST',{companyName:'Prestador antigo',referenceName:'Contato',yardAddress:'ESTRADA ANTIGA 12'}));assert.equal(legacy.status,201);const old=await legacy.json();
 assert.equal((await providerEdit.PATCH(await request('/api/providers/x','admin','PATCH',{companyName:'Prestador antigo',referenceName:'Contato',active:false}),{params:Promise.resolve({id:old.id})})).status,200);
 assert.equal((await queryFirst('select yard_address as yardAddress from providers where id=?',[old.id]) as {yardAddress:string})?.yardAddress,'ESTRADA ANTIGA 12');
 await pg.exec("delete from fleet_drivers where cpf='12345678909'");
 const driver=await drivers.POST(await request('/api/fleet/drivers','admin','POST',{name:'Motorista Estruturado',cpf:'12345678909',phone:'11999998888',email:'motorista@example.test',whatsapp:'11988887777',notes:'Teste',active:false,addressDetails:address}));assert.equal(driver.status,201,await driver.clone().text());const d=await driver.json();
 const drow=await queryFirst('select active,address,email from fleet_drivers where id=?',[d.id]) as {active:number;address:string;email:string};assert.equal(drow?.active,0);assert.match(drow!.address,/VOTORANTIM/);assert.equal(drow?.email,'motorista@example.test');
 const update=await driverEdit.PATCH(await request('/api/fleet/drivers/x','admin','PATCH',{active:true}),{params:Promise.resolve({id:d.id})});assert.equal(update.status,200,await update.clone().text());
 const snapshot=await queryFirst('select address_details as addressDetails from fleet_drivers where id=?',[d.id]) as {addressDetails:unknown};assert.ok(snapshot?.addressDetails);
 assert.equal((await driverEdit.PATCH(await request('/api/fleet/drivers/x','admin','PATCH',{addressDetails:{...address,state:'ZZ'}}),{params:Promise.resolve({id:d.id})})).status,400);
});

test('busca digitada separa canais, normaliza nomes e documentos e encontra clientes além dos primeiros 300', async () => {
 const search = await import('../../app/api/clients/search/route.ts');
 await pg.exec("INSERT INTO clients(id,type,legal_name,trade_name,cpf_cnpj,sale_channel,active) VALUES ('lookup-f','PJ','JOÃO FROTA','TRANSPORTES ÁGIL','12345678000190','FROTA',1),('lookup-c','PJ','JOÃO CEGONHA',null,null,'CEGONHA',1),('lookup-a','PJ','JOÃO AMBOS',null,null,'AMBOS',1),('lookup-off','PJ','JOÃO INATIVO',null,null,'FROTA',0); INSERT INTO clients(id,type,legal_name,sale_channel) SELECT 'lookup-'||n,'PJ','PESQUISA '||lpad(n::text,4,'0'),'FROTA' FROM generate_series(1,350) n;");
 const find = async (q:string, channel='FROTA') => search.GET(await request(`/api/clients/search?channel=${channel}&q=${encodeURIComponent(q)}`,'seller'));
 const fleet = await (await find('joao')).json();
 assert.deepEqual(fleet.clients.map((c:{id:string})=>c.id),['lookup-a','lookup-f']);
 assert.deepEqual(Object.keys(fleet.clients[0]).sort(),['cpfCnpj','id','legalName','tradeName']);
 assert.deepEqual((await (await find('joao','CEGONHA')).json()).clients.map((c:{id:string})=>c.id),['lookup-a','lookup-c']);
 assert.equal((await (await find('agil')).json()).clients[0].id,'lookup-f');
 assert.equal((await (await find('12.345.678/0001-90')).json()).clients[0].id,'lookup-f');
 assert.equal((await (await find('PESQUISA 0350')).json()).clients[0].id,'lookup-350');
 const broad=await (await find('PESQUISA')).json(); assert.equal(broad.clients.length,20); assert.equal(broad.hasMore,true);
 assert.equal((await (await find('%%')).json()).clients.length,0);
 assert.equal((await (await find('j')).json()).clients.length,0);
 assert.equal((await find('joao','AMBOS')).status,400);
 assert.equal((await search.GET(new Request('https://example.test/api/clients/search?channel=FROTA&q=joao'))).status,401);
});

const registeredFreight = {vehicleId:'calc-vehicle',driverId:'calc-driver',clientId:'lookup-f',clientName:'NOME FORJADO',origin:'ORIGEM',destination:'DESTINO',pickupDate:'2026-09-29',operationalStatus:'SEM_PREVISAO',priority:'NORMAL',freightAmountCents:100000,distanceMeters:100000,tollCents:0,driverCommissionCents:1000};

test('Frota valida cliente no servidor e preserva edição de vínculos históricos', async () => {
 const create = await import('../../app/api/fleet/freights/route.ts');
 const edit = await import('../../app/api/fleet/freights/[id]/route.ts');
 for(const clientId of [null,'missing','lookup-c','lookup-off']) {
  const invalid=await create.POST(await request('/api/fleet/freights','admin','POST',{...registeredFreight,clientId}));
  assert.equal(invalid.status,400,await invalid.clone().text());
 }
 const created=await create.POST(await request('/api/fleet/freights','admin','POST',registeredFreight));
 assert.equal(created.status,201,await created.clone().text());
 const {id}=await created.json(); const context={params:Promise.resolve({id})};
 assert.deepEqual(await queryFirst('select client_id,client_name from fleet_freights where id=?',[id]),{client_id:'lookup-f',client_name:'JOÃO FROTA'});
 await pg.exec("UPDATE clients SET active=0,sale_channel='CEGONHA' WHERE id='lookup-f'");
 const payload={...registeredFreight,clientName:'JOÃO FROTA',freightAmountCents:200000};
 const updated=await edit.PATCH(await request(`/api/fleet/freights/${id}`,'admin','PATCH',payload),context);
 assert.equal(updated.status,200,await updated.clone().text());
 assert.equal((await queryFirst('select freight_amount_cents from fleet_freights where id=?',[id]) as {freight_amount_cents:number}).freight_amount_cents,200000);
 assert.equal((await edit.PATCH(await request(`/api/fleet/freights/${id}`,'admin','PATCH',{...payload,clientId:'lookup-c'}),context)).status,400);
 const switched=await edit.PATCH(await request(`/api/fleet/freights/${id}`,'admin','PATCH',{...payload,clientId:'lookup-a'}),context);
 assert.equal(switched.status,200,await switched.clone().text());
 assert.equal((await queryFirst('select client_name from fleet_freights where id=?',[id]) as {client_name:string}).client_name,'JOÃO AMBOS');
 await pg.query("UPDATE fleet_freights SET client_id=null,client_name='LEGADO' WHERE id=$1",[id]);
 const legacy={...payload,clientId:null,clientName:'LEGADO',freightAmountCents:300000};
 assert.equal((await edit.PATCH(await request(`/api/fleet/freights/${id}`,'admin','PATCH',legacy),context)).status,200);
 assert.equal((await queryFirst('select freight_amount_cents from fleet_freights where id=?',[id]) as {freight_amount_cents:number}).freight_amount_cents,300000);
 assert.equal((await edit.PATCH(await request(`/api/fleet/freights/${id}`,'admin','PATCH',{...legacy,clientName:'DIGITADO LIVRE'}),context)).status,400);
});

test('vendedor cria frete e consulta somente os próprios sem receber administração da Frota', async () => {
 const create=await import('../../app/api/fleet/freights/route.ts');
 const options=await import('../../app/api/fleet/freights/options/route.ts');
 const edit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const response=await options.GET(await request('/api/fleet/freights/options','seller'));
 assert.equal(response.status,200,await response.clone().text());
 const {fleet}=await response.json();
 assert.equal(fleet.canEditFreights,true); assert.equal(fleet.canDeleteFreights,false); assert.equal(fleet.canManagePayments,false);
 assert.equal(fleet.parameters.officeMonthlyCostCents,null); assert.equal('freights' in fleet,false);
 assert.ok(fleet.vehicles.every((v:{costs:unknown[]})=>v.costs.length===0));
 assert.ok(fleet.drivers.every((d:{cpf:unknown;phone:unknown;address:unknown})=>d.cpf===null&&d.phone===null&&d.address===null));
 const payload={...registeredFreight,clientId:'lookup-a'};
 assert.equal((await create.POST(await request('/api/fleet/freights','seller','POST',{...payload,tripId:'admin-trip'}))).status,403);
 const created=await create.POST(await request('/api/fleet/freights','seller','POST',payload));
 assert.equal(created.status,201,await created.clone().text());
 const {id}=await created.json(); const context={params:Promise.resolve({id})};
 assert.equal((await queryFirst('select created_by from fleet_freights where id=?',[id]) as {created_by:string}).created_by,'seller');
 const own=await create.GET(await request('/api/fleet/freights?created_by=admin','seller'));
 const ownIds=(await own.json()).freights.map((f:{id:string})=>f.id);
 assert.ok(ownIds.includes(id));
 for(const ownId of ownIds)assert.equal((await queryFirst('select seller_id from fleet_freights where id=?',[ownId]) as {seller_id:string}).seller_id,'seller');
 assert.equal((await edit.PATCH(await request(`/api/fleet/freights/${id}`,'seller','PATCH',payload),context)).status,403);
 assert.equal((await edit.DELETE(await request(`/api/fleet/freights/${id}`,'seller','DELETE'),context)).status,403);
 assert.equal((await options.GET(await request('/api/fleet/freights/options','finance'))).status,403);
});

test('consulta mensal da Frota preserva rateio de viagens com membros em meses diferentes', async()=>{
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 await pg.exec("INSERT INTO fleet_trips(id,name,vehicle_id,driver_id,operation_date,fuel_cost_cents,toll_cents,other_cost_cents,created_by) VALUES ('scope-trip','VIAGEM ENTRE MESES','calc-vehicle','calc-driver','2027-07-10',12000,3000,900,'admin'); INSERT INTO fleet_freights(id,vehicle_id,vehicle_plate,driver_id,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,trip_id) VALUES ('scope-a','calc-vehicle','CAL1C23','calc-driver','TESTE','CLIENTE','A','B','2027-05-15','2027-06-05','FATURADO',100000,100000,'scope-trip'),('scope-b','calc-vehicle','CAL1C23','calc-driver','TESTE','CLIENTE','A','B','2027-08-15',null,'SEM_PREVISAO',100000,100000,'scope-trip');");
 const all=await loadFleetData(true,true,true,false);
 for(const month of ['2027-05','2027-06','2027-07','2027-08','2027-12']) {
  const scoped=await loadFleetData(true,true,true,false,month);
  assert.deepEqual(scoped.freights,all.freights.filter(f=>f.pickupDate.startsWith(month)));
  assert.deepEqual(scoped.billing.freights,all.billing.freights.filter(f=>(f.billingDate||f.pickupDate).startsWith(month)));
  assert.deepEqual(scoped.tripResults,all.tripResults.filter(t=>t.operationDate.startsWith(month)));
 }
});

test('comissão do cadastro valida percentual e só administrador altera; venda e Frota ignoram comissão e vendedor forjados',async()=>{
 const users=await import('../../app/api/users/route.ts');
 const editUser=await import('../../app/api/users/[id]/route.ts');
 const sales=await import('../../app/api/sales/route.ts');
 const fleets=await import('../../app/api/fleet/freights/route.ts');
 const detail=await import('../../app/api/fleet/freights/[id]/route.ts');
 const base={username:'commission-test',name:'Commission Test',role:'VENDEDOR',password:'TestPassword123!',commissionPercent:'12,35'};
 const created=await users.POST(await request('/api/users','admin','POST',base));assert.equal(created.status,201,await created.clone().text());
 const {id}=await created.json();const ctx={params:Promise.resolve({id})};
 assert.equal((await queryFirst('select commission_basis_points from users where id=?',[id]) as {commission_basis_points:number}).commission_basis_points,1235);
 for(const value of [-1,101,'abc','2.555',null,''])assert.equal((await editUser.PATCH(await request('/api/users/x','admin','PATCH',{...base,active:true,commissionPercent:value}),ctx)).status,400);
 assert.equal((await editUser.PATCH(await request('/api/users/x',id,'PATCH',{...base,active:true,commissionPercent:100}),ctx)).status,403);
 const me=await import('../../app/api/me/route.ts');assert.equal((await (await me.GET(await request('/api/me',id))).json()).user.commissionBasisPoints,1235);
 const saleResponse=await sales.POST(await request('/api/sales',id,'POST',{...salePayload,saleDate:'2039-06-01',financialDueDate:'2039-06-20',sellerId:'seller',sellerName:'SELLER',commissionBasisPoints:9999,operationalStatus:'ENTREGUE'}));assert.equal(saleResponse.status,201,await saleResponse.clone().text());const sale=await saleResponse.json();
 assert.deepEqual(await queryFirst('select seller_id,commission_basis_points,operational_status from freight_sales where id=?',[sale.id]),{seller_id:id,commission_basis_points:1235,operational_status:'CONFIRMAR'});
 const fResponse=await fleets.POST(await request('/api/fleet/freights',id,'POST',{...registeredFreight,clientId:'lookup-a',pickupDate:'2039-06-01',sellerId:'seller',sellerCommissionBasisPoints:9999}));assert.equal(fResponse.status,201,await fResponse.clone().text());const f=await fResponse.json();const fc={params:Promise.resolve({id:f.id})};
 const fd=await detail.GET(await request('/api/fleet/freights/x',id),fc);assert.equal(fd.status,200,await fd.clone().text());const freight=(await fd.json()).freight;
 assert.equal(freight.sellerId,id);assert.equal(freight.sellerCommissionBasisPoints,1235);assert.equal(freight.sellerCommissionCents,12350);
 for(const other of ['seller'])assert.equal((await detail.GET(await request('/api/fleet/freights/x',other),fc)).status,404);
 assert.equal((await detail.PATCH(await request('/api/fleet/freights/x',id,'PATCH',{freightAmountCents:1}),fc)).status,403);
 assert.equal((await editUser.PATCH(await request('/api/users/x','admin','PATCH',{...base,password:undefined,active:true,commissionPercent:5}),ctx)).status,200);
 assert.equal((await queryFirst('select commission_basis_points from freight_sales where id=?',[sale.id]) as {commission_basis_points:number}).commission_basis_points,1235);
 assert.equal((await queryFirst('select seller_commission_basis_points from fleet_freights where id=?',[f.id]) as {seller_commission_basis_points:number}).seller_commission_basis_points,1235);
 const next=await sales.POST(await request('/api/sales',id,'POST',{...salePayload,saleDate:'2039-06-02',financialDueDate:'2039-06-20'}));assert.equal(next.status,201);const nextId=(await next.json()).id;
 assert.equal((await queryFirst('select commission_basis_points from freight_sales where id=?',[nextId]) as {commission_basis_points:number}).commission_basis_points,500);
 const commissions=await import('../../app/api/sellers/commissions/route.ts');const result=await commissions.GET(await request('/api/sellers/commissions?competency=2039-06',id));assert.equal(result.status,200,await result.clone().text());const records=(await result.json()).commissions;
 assert.equal(records.length,3);assert.ok(records.every((r:{sellerId:string})=>r.sellerId===id));assert.equal(records.find((r:{saleId:string})=>r.saleId===f.id).commissionCents,12350);
 const finance=(await (await detail.GET(await request('/api/fleet/freights/x','finance'),fc)).json()).freight;assert.equal('sellerCommissionCents' in finance,false);assert.equal('sellerCommissionBasisPoints' in finance,false);
});

test('operacional acessa todas as vendas e comissão é omitida de detalhes, dashboard, clientes e relatório',async()=>{
 const sales=await import('../../app/api/sales/route.ts');const detail=await import('../../app/api/sales/[id]/route.ts');
 const dashboard=await import('../../app/api/dashboard/route.ts');const reports=await import('../../app/api/reports/sales/route.ts');const clients=await import('../../app/api/clients/[id]/route.ts');const commissions=await import('../../app/api/sellers/commissions/route.ts');
 const response=await sales.POST(await request('/api/sales','operator','POST',{...salePayload,saleDate:'2040-01-01',financialDueDate:'2040-01-20',sellerId:'seller',clientId:'lookup-a'}));assert.equal(response.status,201,await response.clone().text());const {id}=await response.json();
 assert.deepEqual(await queryFirst('select seller_id,created_by,commission_basis_points from freight_sales where id=?',[id]),{seller_id:'operator',created_by:'operator',commission_basis_points:0});
 const own=await detail.GET(await request('/api/sales/x','operator'),{params:Promise.resolve({id})});assert.equal(own.status,200);const ownSale=(await own.json()).sale;assert.equal('commissionBasisPoints' in ownSale,false);assert.equal('commissionCents' in ownSale.financial,false);
 assert.equal((await detail.GET(await request('/api/sales/x','seller'),{params:Promise.resolve({id})})).status,404);
 const foreign=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2040-01-01',financialDueDate:'2040-01-20',clientId:'lookup-a'}));const foreignId=(await foreign.json()).id;
 assert.equal((await detail.GET(await request('/api/sales/x','operator'),{params:Promise.resolve({id:foreignId})})).status,200);
 const list=await (await sales.GET(await request('/api/sales?competency=2040-01','operator'))).json();assert.deepEqual(new Set(list.sales.map((s:{id:string})=>s.id)),new Set([id,foreignId]));
 const dash=(await (await dashboard.GET(await request('/api/dashboard?competency=2040-01','operator'))).json()).data;assert.equal(dash.salesCount,2);assert.equal(dash.showCommission,false);assert.ok(dash.bySeller.every((s:object)=>!('commissionCents' in s)));
 for(const role of ['operator','finance'])assert.equal((await commissions.GET(await request('/api/sellers/commissions?competency=2040-01',role))).status,403);
 const report=(await (await reports.GET(await request('/api/reports/sales?competency=2040-01','finance'))).json());assert.equal(report.showCommission,false);assert.equal('commissions' in report.report,false);assert.ok(report.report.sales.every((s:{financial:object})=>!('commissionCents' in s.financial)));assert.ok(!report.report.expenses.some((e:{name:string})=>/comiss/i.test(e.name)));
 const client=(await (await clients.GET(await request('/api/clients/lookup-a','finance'),{params:Promise.resolve({id:'lookup-a'})})).json());assert.ok(client.sales.every((s:{financial:object})=>!('commissionCents' in s.financial)));
 const sellerDash=(await (await dashboard.GET(await request('/api/dashboard?competency=2039-06',(await queryFirst("select id from users where username='commission-test'") as {id:string}).id))).json()).data;
 assert.equal(sellerDash.bySeller[0].commissionCents,22230+9000);
});

test('homônimo não herda vendas e operador acessa frete de outro usuário sem comissão',async()=>{
 await pg.exec("insert into users(id,email,name,role) values('commission-homonym','commission-homonym@example.test','Seller','VENDEDOR')");
 const sales=await import('../../app/api/sales/route.ts');const fleets=await import('../../app/api/fleet/route.ts');const fleetDetail=await import('../../app/api/fleet/freights/[id]/route.ts');const attachments=await import('../../app/api/fleet/freights/[id]/attachments/route.ts');
 const list=await (await sales.GET(await request('/api/sales?period=all','commission-homonym'))).json();assert.equal(list.sales.length,0);
 const fleet=await (await fleets.GET(await request('/api/fleet?period=all','operator'))).json();assert.ok(fleet.fleet.freights.length>0);assert.ok(fleet.fleet.freights.some((f:{createdBy:string})=>f.createdBy!=='operator'));assert.equal(fleet.fleet.canManagePayments,true);assert.ok(fleet.fleet.freights.every((f:object)=>!('sellerCommissionCents' in f)));assert.equal(fleet.fleet.tripResults.length,0);assert.equal(fleet.fleet.billing.sales.length,0);
 const ctx={params:Promise.resolve({id:'scope-a'})};assert.equal((await fleetDetail.GET(await request('/api/fleet/freights/x','operator'),ctx)).status,200);assert.equal((await attachments.GET(await request('/api/fleet/freights/x/attachments','operator'),ctx)).status,200);
});

test('migração de comissão preserva taxas históricas, associa IDs inequívocos e não dá acesso por nome ambíguo',async()=>{
 await pg.exec("insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,operational_status,freight_amount_cents,distance_meters,created_by) values('commission-legacy-f','AAA1A11','DRIVER','CLIENT','A','B','2042-01-01','SEM_PREVISAO',100000,10000,'admin'),('commission-legacy-own','AAA1A11','DRIVER','CLIENT','A','B','2042-01-01','SEM_PREVISAO',100000,10000,'seller'); insert into freight_sales(id,sale_number,sale_channel,fleet_freight_id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) values('commission-legacy-sale',null,'FROTA','commission-legacy-f','2042-01-01','2042-01','COMMISSION TEST','A','B','2042-01-20','CONFIRMAR',100000,250,'admin'),('commission-ambiguous',null,'CEGONHA',null,'2042-01-01','2042-01','SELLER','A','B','2042-01-20','CONFIRMAR',100000,900,'admin')");
 const migration=await readFile(new URL('../../supabase/migrations/20260930164106_seller_commission_access.sql',import.meta.url),'utf8');
 for(let pass=0;pass<2;pass++){
  await pg.exec(migration);
  const user=(await queryFirst("select id from users where username='commission-test'") as {id:string}).id;
  assert.deepEqual(await queryFirst("select seller_id,seller_commission_basis_points from fleet_freights where id='commission-legacy-f'"),{seller_id:user,seller_commission_basis_points:250});
  assert.deepEqual(await queryFirst("select seller_id,seller_commission_basis_points from fleet_freights where id='commission-legacy-own'"),{seller_id:'seller',seller_commission_basis_points:0});
  assert.deepEqual(await queryFirst("select seller_id,commission_basis_points from freight_sales where id='commission-ambiguous'"),{seller_id:null,commission_basis_points:900});
 }
});

test('relatório geral une fretes e vendas sem duplicação, filtra período e vendedor por ID e protege comissões',async()=>{
 const api=await import('../../app/api/reports/sales/route.ts');
 await pg.exec(`INSERT INTO users(id,email,name,role) VALUES ('report-homonym','report-homonym@example.test','SELLER','VENDEDOR');
 INSERT INTO fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,actual_fuel_cost_cents,seller_id,seller_name,seller_commission_basis_points)
 VALUES ('report-freight','REL1A23','MOTORISTA RELATÓRIO','CLIENTE RELATÓRIO','A','B','2060-01-10','2060-02-01','FATURADO',200000,100000,20000,'seller','SELLER',500);
 INSERT INTO freight_sales(id,sale_date,competency,seller_id,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,costs_pending,sale_channel,created_by,fleet_freight_id)
 VALUES ('report-own','2060-01-10','2060-01','seller','SELLER','A','B','2060-01-31','CONFIRMAR',100000,700,0,'CEGONHA','admin',null),
 ('report-other','2060-01-20','2060-01','report-homonym','SELLER','A','B','2060-01-31','CONFIRMAR',300000,700,0,'CEGONHA','admin',null),
 ('report-mirror','2060-01-12','2060-01','seller','SELLER','A','B','2060-01-31','CONFIRMAR',200000,500,0,'FROTA','admin','report-freight');`);
 const get=async(q='',role='admin')=>{const r=await api.GET(await request(`/api/reports/sales?from=2060-01-01&to=2060-01-31${q}`,role));assert.equal(r.status,200,await r.clone().text());return r.json();};
 const all=await get();assert.equal(all.report.sales.length,3);assert.equal(all.report.totals.freight,600000);assert.equal(all.report.commissions,38000);assert.equal(all.report.totals.cost,58000);assert.equal(all.report.totals.margin,542000);
 assert.equal(all.report.sellers.length,2);assert.equal(all.sellers.length,2);assert.ok(!all.report.sales.some((s:{id:string})=>s.id==='report-mirror'));
 const own=await get('&seller=seller');assert.equal(own.report.sales.length,2);assert.equal(own.report.commissions,17000);assert.equal(own.report.sellers[0].commission,17000);
 const fleet=await get('&saleChannel=FROTA');assert.equal(fleet.report.sales.length,1);assert.equal(fleet.report.sales[0].id,'freight:report-freight');
 const cegonha=await get('&saleChannel=CEGONHA');assert.equal(cegonha.report.sales.length,2);assert.equal(cegonha.report.totals.freight,400000);
 const seller=await get('','seller');assert.equal(seller.report.sales.length,2);assert.deepEqual(seller.sellers.map((s:{id:string})=>s.id),['seller']);assert.equal((await get('&seller=report-homonym','seller')).report.sales.length,0);
 const finance=await get('','finance');assert.equal(finance.showCommission,false);assert.equal('commissions' in finance.report,false);assert.ok(finance.report.sellers.every((s:object)=>!('commission' in s)));assert.ok(finance.report.sales.every((s:{financial:object})=>!('commissionBasisPoints' in s)&&!('commissionCents' in s.financial)));
 const unbounded=await (await api.GET(await request('/api/reports/sales','admin'))).json();assert.ok(unbounded.report.sales.some((s:{id:string})=>s.id==='report-own'));
 for(const q of ['from=2060-02-30','from=2060-02-01&to=2060-01-01'])assert.equal((await api.GET(await request(`/api/reports/sales?${q}`))).status,400);
 const csv=await api.GET(await request('/api/reports/sales?from=2060-01-10&to=2060-01-10&seller=seller&format=csv'));
 const text=await csv.text();assert.equal(text.trim().split('\r\n').length,3);assert.match(text,/CEGONHA/);assert.match(text,/FROTA/);assert.match(text,/Comissão/);
 const financeCsv=await (await api.GET(await request('/api/reports/sales?from=2060-01-01&format=csv','finance'))).text();assert.doesNotMatch(financeCsv,/Comissão/);
 const pdf=await api.GET(await request('/api/reports/sales?from=2060-01-01&to=2060-01-31&format=pdf'));
 assert.equal(pdf.status,200,await pdf.clone().text());const bytes=new Uint8Array(await pdf.arrayBuffer());
 if(process.env.CENTRAL_QA_OUTPUT){const {writeFile}=await import('node:fs/promises');await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/relatorio-geral.pdf`,bytes);await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/relatorio-geral.json`,JSON.stringify(all));}
});

test('fechamento Cegonha mantém escopo, bloqueia pendências, preserva versões e rejeita IDs da Frota',async()=>{
 const api=await import('../../app/api/cegonha/monthly/route.ts');const pdf=await import('../../app/api/cegonha/monthly/pdf/route.ts');const fleet=await import('../../app/api/fleet/monthly/route.ts');const fleetPdf=await import('../../app/api/fleet/monthly/pdf/route.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const post=async(body:object,role='finance')=>api.POST(await request('/api/cegonha/monthly',role,'POST',{competency:'2060-01',...body}));
 const get=async()=>{const r=await api.GET(await request('/api/cegonha/monthly?competency=2060-01','finance'));assert.equal(r.status,200,await r.clone().text());return r.json();};
 assert.equal((await api.GET(await request('/api/cegonha/monthly?competency=2060-01','seller'))).status,403);
 assert.equal((await post({action:'CLOSE',reviewed:true},'seller')).status,403);
 await pg.exec("INSERT INTO company_monthly_entries(id,competency,kind,description,amount_cents,scope) VALUES ('report-fleet-entry','2060-01','FIXED','FROTA',900000,'FROTA'),('report-general-entry','2060-01','FIXED','GENERAL',900000,'GENERAL')");
 assert.equal((await post({action:'DELETE_ENTRY',id:'report-fleet-entry'})).status,409);
 assert.equal((await post({action:'CLASSIFY_ENTRY',id:'report-general-entry',confirmed:true})).status,400);
 assert.equal((await post({action:'ENTRY',kind:'FIXED',description:'CUSTO CEGONHA',amountCents:12000})).status,200);
 const data=await get();assert.equal(data.current.scope,'CEGONHA');assert.equal(data.current.sales.length,2);assert.equal(data.current.freights.length,0);assert.equal(data.current.entries.length,1);assert.equal(calculateMonthlyResult(data.current).resultCents,360000);
 await pg.exec("UPDATE freight_sales SET costs_pending=1 WHERE id='report-own'");
 assert.equal((await post({action:'CLOSE',reviewed:true})).status,409);
 await pg.exec("UPDATE freight_sales SET costs_pending=0 WHERE id='report-own'");
 assert.equal((await post({action:'CLOSE',reviewed:false})).status,400);
 assert.equal((await post({action:'CLOSE',reviewed:true})).status,200);
 const saved=(await get()).history[0];assert.equal(saved.snapshot.scope,'CEGONHA');
 assert.equal((await post({action:'ENTRY',kind:'FIXED',description:'BLOQUEADO',amountCents:100})).status,409);
 assert.equal((await fleet.POST(await request('/api/fleet/monthly','finance','POST',{competency:'2060-01',action:'REOPEN',id:saved.id,reason:'Outro canal'}))).status,409);
 assert.equal((await fleetPdf.GET(await request(`/api/fleet/monthly/pdf?competency=2060-01&closingId=${saved.id}`,'finance'))).status,404);
 assert.equal((await pdf.GET(await request(`/api/cegonha/monthly/pdf?competency=2060-02&closingId=${saved.id}`,'finance'))).status,404);
 await pg.exec("UPDATE freight_sales SET freight_amount_cents=200000 WHERE id='report-own'");
 const changed=await get();assert.equal(calculateMonthlyResult(changed.history[0].snapshot).resultCents,360000);assert.equal(calculateMonthlyResult(changed.current).resultCents,453000);
 const exported=await pdf.GET(await request(`/api/cegonha/monthly/pdf?competency=2060-01&closingId=${saved.id}`,'finance'));assert.equal(exported.status,200,await exported.clone().text());
 const bytes=new Uint8Array(await exported.arrayBuffer());
 if(process.env.CENTRAL_QA_OUTPUT){const {writeFile}=await import('node:fs/promises');await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/fechamento-cegonha.pdf`,bytes);await writeFile(`${process.env.CENTRAL_QA_OUTPUT}/fechamento-cegonha.json`,JSON.stringify(changed));}
 assert.equal((await post({action:'REOPEN',id:saved.id,reason:'Conferência do valor'})).status,200);
 assert.equal((await post({action:'CLOSE',reviewed:true})).status,200);assert.equal((await get()).history.length,2);
 const feb=await (await api.GET(await request('/api/cegonha/monthly?competency=2060-02','finance'))).json();assert.equal(feb.current.sales.length,0);assert.ok(feb.periods.some((p:{competency:string})=>p.competency==='2060-01'));
});


test('modelo do veículo persiste, valida limite e preserva os registros existentes', async()=>{
 const api=await import('../../app/api/fleet/vehicles/route.ts');
 const edit=await import('../../app/api/fleet/vehicles/[id]/route.ts');
 const create=await api.POST(await request('/api/fleet/vehicles','admin','POST',{plate:'MOD1A23',model:'Volvo FH 540',active:true}));
 assert.equal(create.status,201,await create.clone().text());const {id}=await create.json();
 const ctx={params:Promise.resolve({id})};
 assert.deepEqual(await queryFirst('select plate,model from fleet_vehicles where id=?',[id]),{plate:'MOD1A23',model:'VOLVO FH 540'});
 assert.equal((await edit.PATCH(await request('/api/fleet/vehicles/x','admin','PATCH',{plate:'MOD1A23',model:'X'.repeat(121)}),ctx)).status,400);
 assert.equal((await edit.PATCH(await request('/api/fleet/vehicles/x','seller','PATCH',{plate:'MOD1A23',model:'Outro'}),ctx)).status,403);
 assert.equal((await edit.PATCH(await request('/api/fleet/vehicles/x','admin','PATCH',{plate:'MOD1A23',model:'Scania R450',active:false}),ctx)).status,200);
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const fleet=await loadFleetData(true,true,true,false,'2070-01');
 assert.equal(fleet.vehicles.find(v=>v.id===id)?.model,'SCANIA R450');
});

test('comissão do motorista usa coleta na apuração, não duplica no mês faturado e preserva snapshot', async()=>{
 await pg.exec(`insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,billing_date,operational_status,freight_amount_cents,distance_meters,driver_commission_cents,actual_fuel_cost_cents)
 values('commission-month','MOD1A23','MOTORISTA','CLIENTE','A','B','2070-01-15',null,'ENTREGUE',100000,1000,12000,0)`);
 const {loadFleetData}=await import('../../lib/server/fleet.ts');
 const {loadMonthlyReport}=await import('../../lib/server/monthly-results.ts');
 const {calculateMonthlyResult}=await import('../../lib/domain/fleet-results.ts');
 const before=await loadMonthlyReport('2070-01');const frozen=JSON.stringify(before.current);
 assert.equal((await loadFleetData(true,true,true,false,'2070-01')).billing.commissionCents,12000);
 await pg.exec("update fleet_freights set billing_date='2070-02-01',operational_status='FATURADO' where id='commission-month'");
 const jan=(await loadMonthlyReport('2070-01')).current,feb=(await loadMonthlyReport('2070-02')).current;
 assert.equal(calculateMonthlyResult(jan).revenueCents,0);assert.equal(calculateMonthlyResult(jan).driverCommissionCents,12000);assert.equal(calculateMonthlyResult(jan).resultCents,-12000);
 assert.equal(jan.freights[0].commissionOnly,true);
 assert.equal(calculateMonthlyResult(feb).revenueCents,100000);assert.equal(calculateMonthlyResult(feb).driverCommissionCents,0);assert.equal(calculateMonthlyResult(feb).resultCents,100000);
 assert.equal(calculateMonthlyResult(JSON.parse(frozen)).driverCommissionCents,12000);
 assert.equal((await loadFleetData(true,true,true,false,'2070-02')).billing.commissionCents,0);
});

test('operacional cria frete Frota sem comissão, cadastra cliente e consulta prestadores sem comissão', async()=>{
 const freights=await import('../../app/api/fleet/freights/route.ts');
 const options=await import('../../app/api/fleet/freights/options/route.ts');
 const detail=await import('../../app/api/fleet/freights/[id]/route.ts');
 const clients=await import('../../app/api/clients/route.ts');
 const providers=await import('../../app/api/providers/route.ts');
 const fleetApi=await import('../../app/api/fleet/route.ts');
 assert.equal((await options.GET(await request('/api/fleet/freights/options','operator'))).status,200);
 const payload={...registeredFreight,clientId:'lookup-a',pickupDate:'2071-01-10',sellerId:'seller',sellerCommissionBasisPoints:5000};
 const res=await freights.POST(await request('/api/fleet/freights','operator','POST',payload));
 assert.equal(res.status,201,await res.clone().text());const {id}=await res.json();
 assert.deepEqual(await queryFirst('select seller_id,created_by,seller_commission_basis_points from fleet_freights where id=?',[id]),{seller_id:'operator',created_by:'operator',seller_commission_basis_points:0});
 const context={params:Promise.resolve({id})};
 const own=await detail.GET(await request('/api/fleet/freights/x','operator'),context);assert.equal(own.status,200);const f=(await own.json()).freight;
 assert.equal('sellerCommissionCents' in f,false);assert.equal('sellerCommissionBasisPoints' in f,false);
 const other=await detail.GET(await request('/api/fleet/freights/x','seller'),context);assert.equal(other.status,404);
 const list=(await (await fleetApi.GET(await request('/api/fleet?competency=2071-01','operator'))).json()).fleet;
 assert.equal(list.freights.length,1);assert.equal(list.freights[0].id,id);assert.equal('sellerCommissionCents' in list.freights[0],false);
 assert.equal((await freights.POST(await request('/api/fleet/freights','operator','POST',{...payload,tripId:'admin-trip'}))).status,403);
 const client=await clients.POST(await request('/api/clients','operator','POST',{type:'PJ',legalName:'CLIENTE OPERACIONAL',saleChannel:'AMBOS',active:true,contacts:[{name:'CONTATO',phone:'11999999999'}]}));
 assert.equal(client.status,201,await client.clone().text());
 assert.equal((await providers.GET(await request('/api/providers','operator'))).status,200);
 assert.equal((await providers.POST(await request('/api/providers','operator','POST',{}))).status,403);
 assert.equal((await detail.DELETE(await request('/api/fleet/freights/x','operator','DELETE'),context)).status,403);
});

test('operacional fatura vendas de terceiros, anexa comprovante e confirma recebimentos sem assumir comissão', async()=>{
 const sales=await import('../../app/api/sales/route.ts');
 const billing=await import('../../app/api/sales/[id]/billing/route.ts');
 const attachments=await import('../../app/api/sales/[id]/attachments/route.ts');
 const payments=await import('../../app/api/sales/[id]/payments/route.ts');
 const remove=await import('../../app/api/payments/[id]/route.ts');
 const create=await sales.POST(await request('/api/sales','seller','POST',{...salePayload,saleDate:'2072-01-10',financialDueDate:'2072-01-30',clientId:'lookup-a'}));
 assert.equal(create.status,201,await create.clone().text());const {id}=await create.json();const ctx={params:Promise.resolve({id})};
 const before=await queryFirst('select seller_id,commission_basis_points from freight_sales where id=?',[id]);
 const change={operationalStatus:'FINALIZADO',billingDate:'2072-01-20',sellerId:'operator',commissionBasisPoints:0};
 assert.equal((await billing.PATCH(await request('/api/sales/x/billing','seller','PATCH',change),ctx)).status,403);
 assert.equal((await billing.PATCH(await request('/api/sales/x/billing','operator','PATCH',{...change,billingDate:'2072-02-30'}),ctx)).status,400);
 const billed=await billing.PATCH(await request('/api/sales/x/billing','operator','PATCH',change),ctx);assert.equal(billed.status,200,await billed.clone().text());
 assert.deepEqual(await queryFirst('select seller_id,commission_basis_points from freight_sales where id=?',[id]),before);
 assert.deepEqual(await queryFirst('select billing_date,operational_status from freight_sales where id=?',[id]),{billing_date:'2072-01-20',operational_status:'FINALIZADO'});
 const form=new FormData();form.set('file',new File([new Uint8Array([137,80,78,71,13,10,26,10])],'recibo.png',{type:'image/png'}));
 const uploaded=await attachments.POST(await request('/api/sales/x/attachments','operator','POST',form),ctx);assert.equal(uploaded.status,201,await uploaded.clone().text());const proof=await uploaded.json();
 const pay=async(proofId?:string)=>{const req=await request('/api/sales/x/payments','operator','POST',{type:'RECEBIMENTO',status:'CONFIRMADO',amountCents:1000,occurredAt:'2072-01-20',paymentMethod:'PIX',proofId});req.headers.set('idempotency-key',crypto.randomUUID());return payments.POST(req,ctx);};
 assert.equal((await pay()).status,400);assert.equal((await pay('other-sale-proof')).status,400);
 const paid=await pay(proof.id);assert.equal(paid.status,201,await paid.clone().text());const payment=await paid.json();
 assert.equal((await queryFirst('select created_by from payment_transactions where id=?',[payment.id]) as {created_by:string}).created_by,'operator');
 assert.equal((await remove.DELETE(await request('/api/payments/x','operator','DELETE'),{params:Promise.resolve({id:payment.id})})).status,403);
 const freights=await import('../../app/api/fleet/freights/route.ts');const fleetEdit=await import('../../app/api/fleet/freights/[id]/route.ts');
 const newFreight=await freights.POST(await request('/api/fleet/freights','seller','POST',{...registeredFreight,clientId:'lookup-a',pickupDate:'2072-01-10'}));assert.equal(newFreight.status,201);const f=await newFreight.json();
 const owner=await queryFirst('select seller_id,seller_commission_basis_points from fleet_freights where id=?',[f.id]);
 const updated=await fleetEdit.PATCH(await request('/api/fleet/freights/x','operator','PATCH',{billingDate:'2072-01-20',operationalStatus:'FATURADO',sellerId:'operator',sellerCommissionBasisPoints:0}),{params:Promise.resolve({id:f.id})});assert.equal(updated.status,200,await updated.clone().text());
 assert.deepEqual(await queryFirst('select seller_id,seller_commission_basis_points from fleet_freights where id=?',[f.id]),owner);
});

test('FIPE por veículo persiste na venda Cegonha, permite limpar e valida centavos sem alterar frete', async()=>{
 const sales=await import('../../app/api/sales/route.ts');
 const saleEdit=await import('../../app/api/sales/[id]/route.ts');
 const cargoVehicles=[{model:'CARRO A',plate:'ABC1D23',fipeValueCents:5023456},{model:'CARRO B',plate:'DEF2G34',fipeValueCents:null}];
 const payload={...salePayload,sellerId:'seller',clientId:'lookup-a',saleChannel:'CEGONHA',cargoVehicles};
 const res=await sales.POST(await request('/api/sales','admin','POST',payload));assert.equal(res.status,201,await res.clone().text());const {id}=await res.json();const ctx={params:Promise.resolve({id})};
 const detail=async()=>(await (await saleEdit.GET(await request('/api/sales/x','admin'),ctx)).json()).sale;
 const initial=await detail();assert.equal(initial.cargoVehicles[0].fipeValueCents,5023456);assert.equal(initial.cargoVehicles[1].fipeValueCents,null);
 const edited=await saleEdit.PATCH(await request('/api/sales/x','admin','PATCH',{...payload,cargoVehicles:[{...cargoVehicles[0],fipeValueCents:6000000},cargoVehicles[1]]}),ctx);assert.equal(edited.status,200,await edited.clone().text());
 const after=await detail();assert.equal(after.cargoVehicles[0].fipeValueCents,6000000);assert.equal(after.freightAmountCents,initial.freightAmountCents);assert.deepEqual(after.financial,initial.financial);
 const cleared=await saleEdit.PATCH(await request('/api/sales/x','admin','PATCH',{...payload,cargoVehicles:[{...cargoVehicles[0],fipeValueCents:null},cargoVehicles[1]]}),ctx);assert.equal(cleared.status,200);assert.equal((await detail()).cargoVehicles[0].fipeValueCents,null);
 for(const invalid of [-1,1.5,'5023456',true,9_000_000_000_001]){
  assert.equal((await sales.POST(await request('/api/sales','seller','POST',{...payload,cargoVehicles:[{...cargoVehicles[0],fipeValueCents:invalid}]}))).status,400);
 }
});
