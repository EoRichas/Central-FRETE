import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer, type Socket} from 'node:net';
import postgres from 'postgres';
import {PGlite} from '@electric-sql/pglite';
import {runPostgresQuery} from '../../lib/server/postgres-transaction.ts';

// Real driver + PostgreSQL protocol. A pooler may release its backend after an
// idle ReadyForQuery and lose subsequent pipelined transactions. Count that
// unsafe overlap before processing any frames, just as a remote peer sees it.
test('consultas concorrentes não sobrepõem transações na mesma conexão', {timeout: 20000}, async () => {
 const pg = new PGlite(); await pg.waitReady;
 const sockets = new Set<Socket>();
 let overlaps = 0;
 const server = createServer(socket => {
  sockets.add(socket); socket.on('close',()=>sockets.delete(socket)); socket.on('error',()=>{});
  let pending=Buffer.alloc(0), startup=true, outstanding=0, inTransaction=false;
  let chain=Promise.resolve();
  socket.on('data',chunk=>{
   pending=Buffer.concat([pending,chunk]);
   if(startup){
    if(pending.length<4 || pending.length<pending.readInt32BE(0))return;
    pending=pending.subarray(pending.readInt32BE(0));startup=false;
    socket.write(Buffer.from([82,0,0,0,8,0,0,0,0,90,0,0,0,5,73]));
   }
   while(pending.length>=5){
    const length=pending.readInt32BE(1)+1;if(pending.length<length)break;
    const message=Buffer.from(pending.subarray(0,length));pending=pending.subarray(length);
    if(message[0]===88){socket.end();break;}
    if(message[0]===81 || message[0]===80){
     if(outstanding>0 && !inTransaction) overlaps++;
     outstanding++;
    }
    chain=chain.then(async()=>{
     const response=await pg.execProtocolRaw(message);
     for(let pos=0;pos+5<=response.length;){
      const size=new DataView(response.buffer,response.byteOffset+pos+1,4).getInt32(0)+1;
      if(response[pos]===90){ outstanding--; inTransaction=response[pos+5]!==73; }
      pos+=size;
     }
     if(response.length)socket.write(response);
    }).catch(error=>{socket.destroy(error);});
   }
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address && typeof address!=='string');
 const sql=postgres({host:'127.0.0.1',port:address.port,user:'postgres',database:'postgres',ssl:false,prepare:false,max:1,fetch_types:false});
 try {
  await sql.unsafe('select 0');
  // Reproduce the unsafe production behavior with more queries than connections.
  await Promise.all(Array.from({length:7},()=>sql.unsafe('select 1')));
  assert.ok(overlaps>0,'a configuração anterior deve reproduzir sobreposição');
  overlaps=0;
  const results=await Promise.all(Array.from({length:14},(_,i)=>runPostgresQuery(sql,'select $1::integer as n',[i])));
  assert.deepEqual(results.map(rows=>rows[0].n),Array.from({length:14},(_,i)=>i));
  assert.equal(overlaps,0,'cada transação aguarda uma conexão exclusiva');
  await runPostgresQuery(sql,'create temporary table operation_test (id integer primary key)');
  await sql.begin(async tx=>{await tx.unsafe('insert into operation_test values (1)');await tx.unsafe('insert into operation_test values (2)');});
  await assert.rejects(sql.begin(async tx=>{await tx.unsafe('insert into operation_test values (3)');await tx.unsafe('insert into operation_test values (1)');}),{code:'23505'});
  assert.deepEqual((await runPostgresQuery(sql,'select id from operation_test order by id')).map(row=>row.id),[1,2]);
  assert.equal(overlaps,0,'transações de escrita preservam exclusividade e rollback');
 }finally{
  await sql.end({timeout:0}); for(const socket of sockets)socket.destroy();
  await new Promise<void>(resolve=>server.close(()=>resolve())); await pg.close();
 }
});
