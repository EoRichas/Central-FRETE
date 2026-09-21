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
 for (let pass = 0; pass < 2; pass++) for (const file of ['001_central_frete_postgres.sql', '002_fleet.sql', '003_fleet_billing.sql', '004_operational_role.sql', '005_detach_driver_vehicle.sql', '006_fleet_vehicle_cost_average_flag.sql', '008_fleet_results.sql']) await pg.exec(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
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
 assert.equal(result.freights[0].fuelCostCents,0);
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
