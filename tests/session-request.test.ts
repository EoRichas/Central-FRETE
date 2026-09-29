import assert from 'node:assert/strict';
import {test} from 'node:test';
import {fetchSession} from '../lib/client/session-request.ts';

test('sessão compartilha requisições simultâneas, permite leitores independentes e revalida depois', async()=>{
 const original=globalThis.fetch;
 let calls=0;
 let finish!:(r:Response)=>void;
 globalThis.fetch=async()=>{calls++;return new Promise<Response>(resolve=>{finish=resolve;});};
 try {
  const first=fetchSession(),second=fetchSession();
  assert.equal(calls,1);
  finish(Response.json({user:{id:'ana',role:'VENDEDOR'}}));
  assert.deepEqual(await (await first).json(),await (await second).json());
  const third=fetchSession();assert.equal(calls,2);
  finish(Response.json({error:'Sessão expirada'},{status:401}));
  assert.equal((await third).status,401);
  const fourth=fetchSession();assert.equal(calls,3);
  finish(Response.json({user:{id:'bia',role:'VENDEDOR'}}));
  assert.equal((await (await fourth).json()).user.id,'bia');
 } finally {globalThis.fetch=original;}
});
