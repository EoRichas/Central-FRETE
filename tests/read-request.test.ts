import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchRead } from "../lib/client/read-request.ts";

test("GET sem resposta termina com mensagem e cancela a requisição", async () => {
  const original = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = async (_, init) => { signal = init?.signal; return new Promise<Response>(() => {}); };
  try {
    await assert.rejects(fetchRead("/api/me", undefined, 20), /carregamento demorou/);
    assert.equal(signal?.aborted, true);
    globalThis.fetch = async () => Response.json({ ok: true });
    assert.deepEqual(await (await fetchRead("/api/me")).json(), { ok: true });
  } finally { globalThis.fetch = original; }
});

test("prazo inclui corpo parado depois dos cabeçalhos", async () => {
  const original = globalThis.fetch;
  let stream!: ReadableStreamDefaultController<Uint8Array>;
  globalThis.fetch = async () => new Response(new ReadableStream({ start(controller) { stream = controller; } }));
  try {
    await assert.rejects(fetchRead("/api/auth/setup", undefined, 20), /carregamento demorou/);
  } finally { stream.close(); globalThis.fetch = original; }
});

test("preserva status de sessão e mensagem de erro sem transformar 503 em logout", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [200, 401, 403, 503]) {
      globalThis.fetch = async () => Response.json({ message: "resposta" }, { status });
      const response = await fetchRead("/api/me");
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { message: "resposta" });
    }
  } finally { globalThis.fetch = original; }
});

test("cancelamento de navegação é preservado", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_, init) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  });
  try {
    const controller = new AbortController();
    const request = fetchRead("/api/dashboard", controller.signal);
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
  } finally { globalThis.fetch = original; }
});
