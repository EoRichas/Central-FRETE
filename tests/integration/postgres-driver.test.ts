import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createServer} from 'node:net';
import postgres from 'postgres';
import {PGlite} from '@electric-sql/pglite';

// Exercise the actual production driver over the PostgreSQL wire protocol.
// PGlite's JS query adapter alone does not reproduce Postgres.js JSON encoding.
test('Postgres.js envia JSON como array real via texto, sem dupla serialização',async()=>{
 const pg=new PGlite();await pg.waitReady;
 const server=createServer(socket=>{
  let pending=Buffer.alloc(0);let startup=true;let chain=Promise.resolve();
  socket.on('error',()=>{});
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
    chain=chain.then(async()=>{const response=await pg.execProtocolRaw(message);if(response.length)socket.write(response);}).catch(error=>{socket.destroy(error);});
   }
  });
 });
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address && typeof address!=='string');
 const sql=postgres({host:'127.0.0.1',port:address.port,user:'postgres',database:'postgres',ssl:false,prepare:false,max:1,fetch_types:false});
 try {
  const cargo=[{model:'FIAT UNO',plate:'ABC1D23',identification:null}];
  const legacy=await sql.unsafe('select jsonb_typeof($1::jsonb) as kind',[JSON.stringify(cargo)]);
  assert.equal(legacy[0].kind,'string'); // Reproduce the production failure first.
  const fixed=await sql.unsafe('select jsonb_typeof($1::text::jsonb) as kind, jsonb_array_length($1::text::jsonb) as count',[JSON.stringify(cargo)]);
  assert.equal(fixed[0].kind,'array');assert.equal(fixed[0].count,1);
  const multiple=await sql.unsafe('select jsonb_array_length($1::text::jsonb) as count',[JSON.stringify([...cargo,...cargo])]);assert.equal(multiple[0].count,2);
 }finally{await sql.end({timeout:1});await new Promise<void>(resolve=>server.close(()=>resolve()));await pg.close();}
});
