import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { forwardSupport } from "../lib/server/support-bridge.ts";
test("bridge mantém credenciais no servidor e assina identidade obtida da sessão", async () => {
  const originalFetch = global.fetch,
    originalEnv = { ...process.env };
  process.env.SUP_SUPPORT_ORIGIN = "https://support.example.test";
  process.env.SUP_CZAR_KEY = "synthetic-key-".repeat(5);
  process.env.SUP_CZAR_IDENTITY_KEY = "synthetic-identity-".repeat(4);
  let called = 0;
  global.fetch = async (url, options) => {
    called++;
    assert.equal(String(url), "https://support.example.test/api/integration");
    assert.equal(options.headers.cookie, undefined);
    assert.equal(options.headers.authorization, undefined);
    assert.equal(options.headers.origin, undefined);
    const data = JSON.parse(options.body);
    assert.equal(data.actor.name, "Exemplo");
    assert.equal(data.actor.ref.length, 64);
    assert.equal(data.path, "/api/tickets");
    assert.ok(!options.body.includes("private-session-user-id"));
    assert.equal(
      options.headers["x-support-signature"],
      createHmac("sha256", process.env.SUP_CZAR_KEY)
        .update(
          `${options.headers["x-support-time"]}.${options.headers["x-support-nonce"]}.${options.body}`,
        )
        .digest("hex"),
    );
    return Response.json(
      { tickets: [] },
      { headers: { "set-cookie": "must-not-be-relayed" } },
    );
  };
  try {
    const r = await forwardSupport(
      new Request("https://company.example.test/api/czar/suporte/tickets", {
        headers: { cookie: "private-session-cookie" },
      }),
      "czar",
      { id: "private-session-user-id", name: "Exemplo Sintético" },
      ["tickets"],
    );
    assert.equal(r.headers.get("set-cookie"), null);
    assert.equal(r.status, 200);
    await assert.rejects(
      () =>
        forwardSupport(
          new Request("https://company.example.test/api/czar/suporte/login"),
          "czar",
          { id: "test", name: "Teste" },
          ["login"],
        ),
      (e) => e.status === 404,
    );
    await assert.rejects(
      () =>
        forwardSupport(
          new Request("https://company.example.test/api/ekon/suporte/tickets"),
          "ekon",
          { id: "test", name: "Teste" },
          ["tickets"],
        ),
      (e) => e.status === 503,
    );
    assert.equal(called, 1);
  } finally {
    global.fetch = originalFetch;
    for (const k of [
      "SUP_SUPPORT_ORIGIN",
      "SUP_CZAR_KEY",
      "SUP_CZAR_IDENTITY_KEY",
    ]) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
  }
});
