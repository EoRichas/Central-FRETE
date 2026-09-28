import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('015 numera fretes antigos, reutiliza vendas vinculadas e reverte integralmente uma falha',async()=>{
 const pg=new PGlite();
 try {
  await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  for(const file of ['001_central_frete_postgres.sql','002_fleet.sql','003_fleet_billing.sql','004_operational_role.sql','005_detach_driver_vehicle.sql','006_fleet_vehicle_cost_average_flag.sql','008_fleet_results.sql','009_direct_paid_operation_costs.sql','010_fleet_cargo_sales_orders.sql','011_sale_origin_location_type.sql','../supabase/migrations/20260923220518_fleet_operation_integrity.sql','012_sales_channels_global_numbering_costs.sql','013_fleet_document_costs.sql','014_complete_global_sale_numbers.sql']) await pg.exec(await readFile(new URL(`../../database/${file}`,import.meta.url),'utf8'));
  await pg.exec("insert into users(id,email,name,role) values('a','a@example.test','ADMIN','ADMIN')");
  const freight=(id:string)=>pg.query("insert into fleet_freights(id,vehicle_plate,driver_name,client_name,origin,destination,pickup_date,operational_status,freight_amount_cents,distance_meters) values($1,'ABC1D23','MOTORISTA','CLIENTE','A','B','2026-09-28','SEM_PREVISAO',1000,1000)",[id]);
  await freight('linked');await freight('unlinked-a');await freight('unlinked-b');
  const sale=(id:string,channel:string,freightId:string|null)=>pg.query<{sale_number:string}>("insert into freight_sales(id,sale_number,sale_channel,fleet_freight_id,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by) values($1,null,$2,$3,'2026-09-28','2026-09','ADMIN','A','B','2026-09-30','CONFIRMAR',1000,0,'a') returning sale_number",[id,channel,freightId]);
  assert.equal((await sale('s-linked','FROTA','linked')).rows[0].sale_number,'201');
  assert.equal((await sale('s-cegonha','CEGONHA',null)).rows[0].sale_number,'202');
  await pg.exec(`insert into service_orders(id,sale_id,created_by) values('old-order','s-linked','a');insert into service_order_versions(order_id,version,snapshot,created_by) values('old-order',1,'{"saleNumber":"201","schemaVersion":3}','a')`);
  const snapshot=(await pg.query('select * from service_order_versions')).rows;
  const migration=await readFile(new URL('../../database/015_fleet_numbers_and_orders.sql',import.meta.url),'utf8');
  await pg.exec("alter table audit_logs add constraint test_audit_failure check(actor_email <> 'migration:015')");
  await assert.rejects(pg.exec(migration));await pg.exec('ROLLBACK');
  assert.equal((await pg.query("select column_name from information_schema.columns where table_name='fleet_freights' and column_name='sale_number'")).rows.length,0);
  assert.equal(Number((await pg.query<{last_value:string}>('select last_value from global_sale_number_counter')).rows[0].last_value),202);
  await pg.exec('alter table audit_logs drop constraint test_audit_failure');
  await pg.exec(migration);
  const expected=[{id:'linked',sale_number:'201'},{id:'unlinked-a',sale_number:'203'},{id:'unlinked-b',sale_number:'204'}];
  assert.deepEqual((await pg.query('select id,sale_number from fleet_freights order by id')).rows,expected);
  assert.deepEqual((await pg.query('select * from service_order_versions')).rows,snapshot);
  const audit=(await pg.query("select * from audit_logs where actor_email='migration:015' order by entity_id")).rows;assert.equal(audit.length,3);
  await pg.exec(migration);
  assert.deepEqual((await pg.query('select id,sale_number from fleet_freights order by id')).rows,expected);
  assert.deepEqual((await pg.query("select * from audit_logs where actor_email='migration:015' order by entity_id")).rows,audit);
  await freight('next');
  assert.equal((await pg.query<{sale_number:string}>("select sale_number from fleet_freights where id='next'")).rows[0].sale_number,'205');
  assert.equal((await sale('s-next','FROTA','next')).rows[0].sale_number,'205');
  assert.equal((await sale('s-last','CEGONHA',null)).rows[0].sale_number,'206');
  await assert.rejects(pg.exec("update fleet_freights set sale_number='999' where id='next'"),/não pode ser alterado/);
  assert.equal((await pg.query("select * from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('service_orders','service_order_versions','global_sale_number_counter')")).rows.length,0);
 } finally { await pg.close(); }
});
