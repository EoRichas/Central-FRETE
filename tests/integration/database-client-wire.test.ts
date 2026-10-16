import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Socket } from "node:net";
import postgres from "postgres";
import { createDatabaseRunner, DatabaseTimeoutError } from "../../lib/server/database-client.ts";

test("driver real encerra socket que aceita TCP mas nunca responde", async () => {
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on("data", () => {}); // Simulate an unresponsive pooler, no SQL is executed.
    socket.on("error", () => {});
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const clients: ReturnType<typeof postgres>[] = [];
  const run = createDatabaseRunner(() => {
    const client = postgres({ host: "127.0.0.1", port: address.port, ssl: false, prepare: false, fetch_types: false, connect_timeout: 60 });
    clients.push(client);
    return client;
  }, { timeoutMs: 200 });
  try {
    await assert.rejects(run(client => client.unsafe("select 1")), DatabaseTimeoutError);
    assert.equal(clients.length, 1);
    // A subsequent operation obtains a new driver, not the stranded singleton.
    await run(async client => { assert.notEqual(client, clients[0]); });
    assert.equal(clients.length, 2);
    await Promise.all(clients.map(client => client.end({ timeout: 0 })));
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
