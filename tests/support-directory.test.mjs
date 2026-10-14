import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {verifyDirectory} from '../lib/server/support-directory.ts';
test('diretório exige assinatura de empresa, recusa replay/origem e devolve apenas nomes e referências opacas',()=>{
 const env={...process.env};process.env.SUP_CZAR_KEY='synthetic-key-'.repeat(5);process.env.SUP_CZAR_IDENTITY_KEY='synthetic-identity-'.repeat(4);
 const request=(changes={})=>{const time=String(Date.now()),nonce=randomUUID();return new Request('https://company.example.test/api/czar/support-directory',{headers:{'x-support-time':time,'x-support-nonce':nonce,'x-support-signature':createHmac('sha256',process.env.SUP_CZAR_KEY).update(`directory.v1.czar.${time}.${nonce}`).digest('hex'),...changes}});};
 try{
  assert.throws(()=>verifyDirectory(new Request('https://company.example.test'),'czar'),e=>e.status===401);
  assert.throws(()=>verifyDirectory(request({'x-support-signature':'f'.repeat(64)}),'czar'),e=>e.status===401);
  assert.throws(()=>verifyDirectory(request({'origin':'https://hostile.example.test'}),'czar'),e=>e.status===401);
  assert.throws(()=>verifyDirectory(request({'x-support-time':String(Date.now()-300000)}),'czar'),e=>e.status===401);
  const req=request(),build=verifyDirectory(req,'czar');assert.throws(()=>verifyDirectory(req,'czar'),e=>e.status===409);
  const result=build([{id:'real-private-id',name:'Pessoa Sintética',password:'never-forward'}]);
  assert.deepEqual(Object.keys(result.contacts[0]),['ref','name']);assert.equal(result.contacts[0].ref.length,64);assert.ok(!JSON.stringify(result).includes('real-private-id'));
 }finally{for(const k of ['SUP_CZAR_KEY','SUP_CZAR_IDENTITY_KEY']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
