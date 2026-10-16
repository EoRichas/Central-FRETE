import assert from "node:assert/strict";
import { test } from "node:test";
import { createDatabaseRunner, DatabaseTimeoutError } from "../lib/server/database-client.ts";

function fixture(timeoutMs = 1000) {
  let clock = 0;
  const clients: { id: number; closed: boolean; end: (options: { timeout: number }) => Promise<void> }[] = [];
  const run = createDatabaseRunner(() => {
    const client = {
      id: clients.length, closed: false,
      end: async (options: { timeout: number }) => { assert.equal(options.timeout, 0); client.closed = true; },
    };
    clients.push(client);
    return client;
  }, { idleMs: 10_000, timeoutMs, now: () => clock });
  return { run, clients, advance: (ms: number) => { clock += ms; } };
}

test("retomada após suspensão troca o cliente mesmo se o timer ocioso não executou", async () => {
  const f = fixture();
  assert.equal(await f.run(async c => c.id), 0);
  f.advance(5000);
  assert.equal(await f.run(async c => c.id), 0);
  f.advance(60_000);
  assert.equal(await f.run(async c => c.id), 1);
  assert.equal(f.clients[0].closed, true);
});

test("não recicla cliente ocupado e compartilha a instância entre requisições concorrentes", async () => {
  const f = fixture();
  let finish!: () => void;
  const first = f.run(c => new Promise<number>(resolve => { finish = () => resolve(c.id); }));
  f.advance(60_000);
  assert.equal(await f.run(async c => c.id), 0);
  assert.equal(f.clients[0].closed, false);
  finish();
  assert.equal(await first, 0);
});

test("operação travada termina, descarta conexão e a próxima consulta se recupera", async () => {
  const f = fixture(20);
  await assert.rejects(f.run(() => new Promise<never>(() => {})), DatabaseTimeoutError);
  assert.equal(f.clients[0].closed, true);
  assert.equal(await f.run(async c => c.id), 1);
});

test("não repete gravação cujo resultado ficou desconhecido após timeout", async () => {
  const f = fixture(20);
  let writes = 0;
  let finish!: () => void;
  await assert.rejects(f.run(() => { writes++; return new Promise<void>(resolve => { finish = resolve; }); }), DatabaseTimeoutError);
  assert.equal(writes, 1);
  assert.equal(await f.run(async c => c.id), 1);
  finish();
  await Promise.resolve();
  assert.equal(await f.run(async c => c.id), 1);
  assert.equal(writes, 1);
});

test("erro SQL é devolvido sem retry e limpa o contador de operações", async () => {
  const f = fixture();
  const error = new Error("constraint");
  await assert.rejects(f.run(async () => { throw error; }), e => e === error);
  f.advance(11_000);
  assert.equal(await f.run(async c => c.id), 1);
});
