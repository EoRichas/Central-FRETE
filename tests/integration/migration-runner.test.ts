import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {PGlite} from '@electric-sql/pglite';

test('runner aplica migration uma vez, gera 201/202 e não reabre scripts anuais em reinício',async()=>{
 const pg=new PGlite();await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 mock.module('postgres',{defaultExport:()=>({unsafe:async(sql:string,args:unknown[]=[])=>{
   if(args.length || /^SELECT /i.test(sql)) return (await pg.query(sql,args)).rows;
   await pg.exec(sql);return [];
 },end:async()=>{}})});
 try {
  const {migrateDatabase}=await import('../../scripts/migrate-postgres.mjs');
  await migrateDatabase({databaseUrl:'postgres://test:test@localhost/test',databaseHost:'local-test'});
  await pg.exec("insert into users(id,email,name,role) values('test-admin','test@example.test','TESTE','ADMIN')");
  const insert=(id:string,channel='CEGONHA')=>pg.query<{sale_number:string}>("insert into freight_sales(id,sale_number,sale_date,competency,seller_name,origin,destination,financial_due_date,operational_status,freight_amount_cents,commission_basis_points,created_by,sale_channel) values($1,null,'2026-09-28','2026-09','TESTE','A','B','2026-09-30','CONFIRMAR',10000,0,'test-admin',$2) returning sale_number",[id,channel]);
  assert.equal((await insert('first','FROTA')).rows[0].sale_number,'201');
  assert.equal((await insert('second')).rows[0].sale_number,'202');
  await pg.exec("insert into freight_costs(id,sale_id,category,amount_cents,confirmed,payment_status) values('cte','first','CTE_MDFE',1000,0,'EM_ABERTO')");
  assert.equal((await pg.query("select column_name from information_schema.columns where table_name='fleet_freights' and column_name in ('insurance_cost_cents','invoice_cost_cents','icms_cost_cents','cte_mdfe_cost_cents')")).rows.length,4);
  const before=await pg.query('select * from central_schema_migrations order by name');
  await migrateDatabase({databaseUrl:'postgres://test:test@localhost/test',databaseHost:'local-test'});
  assert.deepEqual((await pg.query('select * from central_schema_migrations order by name')).rows,before.rows);
  assert.equal((await insert('third','FROTA')).rows[0].sale_number,'203');
  assert.deepEqual((await pg.query("select confirmed,payment_status from freight_costs where id='cte'")).rows,[{confirmed:0,payment_status:'EM_ABERTO'}]);
 }finally{mock.restoreAll();await pg.close();}
});
