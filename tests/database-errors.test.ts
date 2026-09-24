import assert from 'node:assert/strict';
import {test,mock} from 'node:test';
import {databaseError} from '../lib/server/d1.ts';
test('erros de banco preservam diagnóstico nos logs sem revelar detalhes técnicos na resposta',()=>{
 const logger=mock.method(console,'error',()=>{});
 try {
  const technical=Object.assign(new Error('internal SQL with secret details'),{code:'23514',constraint_name:'fleet_freights_cargo_vehicles_check'});
  const mapped=databaseError(technical,'insert into fleet_freights');assert.equal(mapped.status,400);assert.match(mapped.message,/veículos transportados/);assert.doesNotMatch(mapped.message,/SQL|constraint|secret/);
  const unknown=databaseError(new Error('postgres password leaked'), 'select 1');assert.equal(unknown.status,503);assert.doesNotMatch(unknown.message,/password|postgres/);
  assert.ok(logger.mock.callCount()>=2);
 } finally {logger.mock.restore();}
});
