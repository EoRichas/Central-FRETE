import assert from 'node:assert/strict';
import {test,before,after,mock} from 'node:test';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {generateKeyPair,exportJWK,SignJWT} from 'jose';
import {toPostgresSql,normalizeDatabaseValue} from '../../lib/server/postgres-sql.ts';

const pg = new PGlite();
class ApiError extends Error {constructor(public status: number,message: string,public details?: Record<string,unknown>){super(message);}}
async function queryAll(query: string, params: unknown[] = []) {
 return (await pg.query(toPostgresSql(query),params)).rows.map(normalizeDatabaseValue) as Record<string,unknown>[];
}
async function queryFirst(query: string, params: unknown[] = []) {return (await queryAll(query,params))[0] ?? null;}
function prepare(query: string,params: unknown[] = []) {
 return {query,params,bind:(...values: unknown[])=>prepare(query,values),run:async()=>({success:true,results:await queryAll(query,params)})};
}
mock.module('../../lib/server/d1.ts',{namedExports:{
 ApiError,queryFirst,queryAll,
 getD1:async()=>({prepare,batch:async(statements: ReturnType<typeof prepare>[])=>pg.transaction(async tx=>{
  const result=[];for(const s of statements) result.push({success:true,results:(await tx.query(toPostgresSql(s.query),s.params)).rows});return result;
 })}),
 jsonError:(e: unknown)=>Response.json({error:e instanceof Error?e.message:'Error'}, {status:e instanceof ApiError?e.status:500,headers:e instanceof ApiError&&e.status===429?{'retry-after':String(e.details?.retryAfter??900)}:{}}),
}});
const originalFetch=globalThis.fetch;
const origin='https://central.example.test';
const setupSecret='fictional-setup-secret-only-used-in-local-laboratory';
let adminId='';
const req=(path: string,body?: object,headers: Record<string,string>={},method='POST')=>new Request(`${origin}${path}`,{method,headers:{origin,'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined});
const login=async(username='labadmin',password='123456')=>(await import('../../app/api/auth/login/route.ts')).POST(req('/api/auth/login',{username,password}));
const cookie=(response: Response)=>response.headers.get('set-cookie')!.split(';')[0];
const sessionRequest=(value: string)=>req('/api/me',undefined,{cookie:value},'GET');
before(async()=>{
 globalThis.fetch=async()=>{throw new Error('EXTERNAL NETWORK IS DISABLED IN THIS LAB');};
 process.env.CENTRAL_FRETE_SESSION_SECRET='fictional-session-secret-only-used-in-local-laboratory';
 delete process.env.CENTRAL_ACCESS_ISSUER;delete process.env.CENTRAL_ACCESS_AUDIENCE;
 delete process.env.CENTRAL_FRETE_SETUP_TOKEN;delete process.env.CENTRAL_FRETE_PUBLIC_ORIGIN;
 await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
 await pg.exec(await readFile(new URL('../../database/001_central_frete_postgres.sql',import.meta.url),'utf8'));
 await pg.exec('ALTER TABLE users ADD COLUMN commission_basis_points integer not null default 0;');
 const migration=await readFile(new URL('../../supabase/migrations/20261005122915_security_sessions_and_login_limits.sql',import.meta.url),'utf8');
 await pg.exec(migration);await pg.exec(migration);
});
after(async()=>{globalThis.fetch=originalFetch;mock.restoreAll();await pg.close();});

test('lab: setup fechado por padrão, rejeita segredo incorreto e só permite um administrador concorrente',async()=>{
 const setup=await import('../../app/api/auth/setup/route.ts');
 const payload={name:'LAB',username:'labadmin',password:'123456',passwordConfirmation:'123456'};
 assert.equal((await setup.POST(req('/api/auth/setup',payload))).status,403);
 assert.equal((await setup.GET(req('/api/auth/setup',undefined,{},'GET'))).status,200);
 process.env.CENTRAL_FRETE_SETUP_TOKEN=setupSecret;
 assert.equal((await setup.POST(req('/api/auth/setup',payload,{'x-setup-token':'wrong'}))).status,403);
 const results=await Promise.all([setup.POST(req('/api/auth/setup',payload,{'x-setup-token':setupSecret})),setup.POST(req('/api/auth/setup',{...payload,username:'otheradmin'},{'x-setup-token':setupSecret}))]);
 assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
 assert.equal((await queryFirst('select count(*)::integer as n from users'))?.n,1);
 const admin=(await queryFirst('select id,username from users'))!;
 adminId=String(admin.id);
 // Concurrent ordering must not make subsequent tests depend on the winner.
 await pg.query("update users set username='labadmin' where id=$1",[adminId]);
 delete process.env.CENTRAL_FRETE_SETUP_TOKEN;
});

test('lab: senha de seis caracteres preservada; token opaco armazenado somente por hash',async()=>{
 const response=await login();assert.equal(response.status,200,await response.clone().text());
 const token=cookie(response).split('=')[1];
 assert.match(token,/^[A-Za-z0-9_-]{43}$/);
 const stored=await queryAll('select token_hash from auth_sessions');
 assert.ok(stored.length>0);assert.ok(stored.every(s=>s.token_hash!==token));
 const {verifyLocalSession}=await import('../../lib/server/local-session.ts');
 assert.equal((await verifyLocalSession(sessionRequest(cookie(response))))?.userId,adminId);
});

test('lab: cookie copiado deixa de funcionar após logout; sessão paralela permanece válida',async()=>{
 const first=await login(),second=await login();
 const {verifyLocalSession}=await import('../../lib/server/local-session.ts');
 const {POST}=await import('../../app/api/auth/logout/route.ts');
 assert.equal((await POST(req('/api/auth/logout',undefined,{cookie:cookie(first)}))).status,200);
 assert.equal(await verifyLocalSession(sessionRequest(cookie(first))),null);
 assert.ok(await verifyLocalSession(sessionRequest(cookie(second))));
 assert.equal((await POST(req('/api/auth/logout?all=true',undefined,{cookie:cookie(second)}))).status,200);
 assert.equal(await verifyLocalSession(sessionRequest(cookie(second))),null);
});

test('lab: troca de senha revoga cópia de sessão e impede login iniciado com versão antiga',async()=>{
 const response=await login();assert.equal(response.status,200);
 const old=await queryFirst('select security_version from users where id=?',[adminId]);
 const {createPasswordCredential,createUserSessionToken,verifyLocalSession}=await import('../../lib/server/local-session.ts');
 const credential=await createPasswordCredential('123456');
 await pg.query('update users set password_hash=$1,password_salt=$2 where id=$3',[credential.passwordHash,credential.passwordSalt,adminId]);
 assert.equal(await verifyLocalSession(sessionRequest(cookie(response))),null);
 await assert.rejects(createUserSessionToken({id:adminId,email:'lab@example.test',username:'labadmin',name:'Lab',securityVersion:Number(old!.security_version)}), (e: unknown)=>e instanceof ApiError&&e.status===401);
});

test('lab: sessões expiradas, cookies forjados e cookies duplicados são rejeitados',async()=>{
 const {verifyLocalSession}=await import('../../lib/server/local-session.ts');
 const response=await login();assert.equal(response.status,200);
 const original=cookie(response);
 assert.equal(await verifyLocalSession(sessionRequest(`cf_local_session=${'a'.repeat(43)}`)),null);
 assert.equal(await verifyLocalSession(sessionRequest(`${original}; ${original}`)),null);
 assert.equal(await verifyLocalSession(sessionRequest('cf_local_session=legacy.signed')),null);
 const session=(await verifyLocalSession(sessionRequest(original)))!;
 await pg.query("update auth_sessions set expires_at=now()-interval '1 second' where token_hash=$1",[session.tokenHash]);
 assert.equal(await verifyLocalSession(sessionRequest(original)),null);
});

test('lab: CSRF bloqueado para outro site e subdomínio, mesmo com cookie e forwarded-host forjado',async()=>{
 await pg.exec('delete from auth_login_limits');
 const response=await login();assert.equal(response.status,200);
 const {authorize}=await import('../../lib/server/auth.ts');
 for(const badOrigin of ['https://attacker.test','https://www.example.test','null','']) {
  await assert.rejects(authorize(req('/api/users',{}, {cookie:cookie(response),origin:badOrigin,'x-forwarded-host':'attacker.test'})),(e: unknown)=>e instanceof ApiError&&e.status===403);
 }
 await assert.rejects(authorize(req('/api/users',{}, {cookie:cookie(response),'sec-fetch-site':'same-site'})),(e: unknown)=>e instanceof ApiError&&e.status===403);
 assert.equal((await authorize(req('/api/users',{}, {cookie:cookie(response),'sec-fetch-site':'same-origin'}))).id,adminId);
 const result=await (await import('../../app/api/auth/login/route.ts')).POST(req('/api/auth/login',{username:'labadmin',password:'123456'},{origin:'https://evil.test'}));
 assert.equal(result.status,403);
});

test('lab: limite por conta é atômico sob concorrência e persiste entre chamadas',async()=>{
 await pg.exec('delete from auth_login_limits');
 const responses=await Promise.all(Array.from({length:14},()=>login('labadmin','incorrect')));
 assert.equal(responses.filter(r=>r.status===401).length,10);
 assert.equal(responses.filter(r=>r.status===429).length,4);
 const denied=await login();assert.equal(denied.status,429);assert.ok(Number(denied.headers.get('retry-after'))>0);
 await pg.exec("update auth_login_limits set expires_at=now()-interval '1 second'");
 assert.equal((await login()).status,200);
});

test('lab: alternar nomes inventados e IPs em cabeçalhos não burla orçamento global',async()=>{
 await pg.exec('delete from auth_login_limits');
 const {POST}=await import('../../app/api/auth/login/route.ts');
 for(let i=0;i<120;i++) {
  const response=await POST(req('/api/auth/login',{username:`unknown-${i}`,password:'wrong'},{'x-forwarded-for':`192.0.2.${i+1}`}));
  assert.equal(response.status,401);
 }
 assert.equal((await login()).status,429);
 assert.equal((await queryFirst('select count(*)::integer as n from auth_login_limits'))?.n,121);
 await pg.exec('delete from auth_login_limits');
});

test('lab: JSON inválido e corpo excessivo rejeitados antes de verificar credenciais',async()=>{
 const {POST}=await import('../../app/api/auth/login/route.ts');
 const bad=new Request(`${origin}/api/auth/login`,{method:'POST',headers:{origin},body:'{'});
 assert.equal((await POST(bad)).status,400);
 assert.equal((await POST(req('/api/auth/login',{username:'labadmin',password:'x'.repeat(20000)}))).status,413);
});

test('lab: logs não guardam senha ou cookie; tabelas de autenticação não têm grants públicos',async()=>{
 const all=JSON.stringify(await queryAll("select * from audit_logs where entity_type='AUTH'"));
 assert.ok(!all.includes('123456'));assert.ok(!all.includes('incorrect'));assert.ok(!all.includes('cf_local_session'));
 assert.ok(all.includes('LOGIN_FAILED'));assert.ok(all.includes('LOGIN_THROTTLED'));assert.ok(all.includes('LOGOUT'));
 assert.equal((await queryAll("select * from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_name in ('auth_sessions','auth_login_limits')")).length,0);
 const tables=await queryAll("select rowsecurity from pg_tables where schemaname='public' and tablename in ('auth_sessions','auth_login_limits')");
 assert.equal(tables.length,2);assert.ok(tables.every(t=>t.rowsecurity));
});

test('lab: gateway falha fechado e rejeita bypass, assinatura, expiração e público incorretos',async()=>{
 const {assertAccessGateway}=await import('../../lib/server/access-gateway.ts');
 const issuer='https://local-lab.cloudflareaccess.com';
 process.env.CENTRAL_ACCESS_ISSUER=issuer;
 await assert.rejects(assertAccessGateway(req('/api/me',undefined,{},'GET')),(e: unknown)=>e instanceof ApiError&&e.status===503);
 process.env.CENTRAL_ACCESS_AUDIENCE='lab-app';
 await assert.rejects(assertAccessGateway(req('/api/me',undefined,{},'GET')),(e: unknown)=>e instanceof ApiError&&e.status===403);
 const keys=await generateKeyPair('RS256');const wrongKeys=await generateKeyPair('RS256');
 const jwk=await exportJWK(keys.publicKey);jwk.kid='lab';jwk.alg='RS256';jwk.use='sig';
 let keyFetches=0;
 globalThis.fetch=async(input)=>{assert.equal(String(input),`${issuer}/cdn-cgi/access/certs`);keyFetches++;return Response.json({keys:[jwk]});};
 const sign=(aud='lab-app',exp='5m',key=keys.privateKey)=>new SignJWT({type:'app',email:'lab@example.test'}).setProtectedHeader({alg:'RS256',kid:'lab'}).setIssuer(issuer).setAudience(aud).setSubject('lab').setIssuedAt().setExpirationTime(exp).sign(key);
 const accessRequest=(token: string)=>req('/api/me',undefined,{'cf-access-jwt-assertion':token},'GET');
 try {
  await assertAccessGateway(accessRequest(await sign()));
  for(const token of [await sign('other-app'),await sign('lab-app','-1m'),await sign('lab-app','5m',wrongKeys.privateKey)]) {
   await assert.rejects(assertAccessGateway(accessRequest(token)),(e: unknown)=>e instanceof ApiError&&e.status===403);
  }
  assert.equal(keyFetches,1);
 } finally {delete process.env.CENTRAL_ACCESS_ISSUER;delete process.env.CENTRAL_ACCESS_AUDIENCE;globalThis.fetch=async()=>{throw new Error('EXTERNAL NETWORK IS DISABLED IN THIS LAB');};}
});
