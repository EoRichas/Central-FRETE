import assert from 'node:assert/strict';
import {test} from 'node:test';
import {safeReturnPath} from '../lib/client/safe-return-path.ts';
test('login só redireciona para caminhos da própria aplicação',()=>{
 const origin='https://central.example.test';
 for(const value of ['//evil.test','/\\evil.test','https://evil.test','/\nevil.test']) assert.equal(safeReturnPath(value,origin),null);
 assert.equal(safeReturnPath('/vendas?canal=FROTA',origin),'/vendas?canal=FROTA');
});
