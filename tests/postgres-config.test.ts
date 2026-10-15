import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { postgresRuntimeConfig } from "../lib/server/postgres-config.ts";

const sessionUrl = "postgresql://postgres.example:fake%40password%3Avalue@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?application_name=central&sslmode=require";

test("Vercel usa Transaction Pooler sem alterar credenciais, banco ou parâmetros", async () => {
  const config = postgresRuntimeConfig(sessionUrl, true);
  const before = new URL(sessionUrl);
  const after = new URL(config.url);
  assert.equal(after.port, "6543");
  for (const key of ["protocol", "hostname", "username", "password", "pathname", "search"] as const) {
    assert.equal(after[key], before[key]);
  }
  // Postgres.js parses the actual options without opening a connection.
  const sql = postgres(config.url, config.options);
  try {
    assert.deepEqual(sql.options.port, [6543]);
    assert.equal(sql.options.max, 1);
    assert.equal(sql.options.idle_timeout, 5);
    assert.equal(sql.options.prepare, false);
    assert.equal(sql.options.ssl, "require");
  } finally {
    await sql.end();
  }
});

test("Vercel adapta porta padrão omitida e preserva Transaction Pooler explícito", () => {
  assert.equal(new URL(postgresRuntimeConfig(sessionUrl.replace(":5432", ""), true).url).port, "6543");
  const transactionUrl = sessionUrl.replace(":5432", ":6543");
  assert.equal(postgresRuntimeConfig(transactionUrl, true).url, transactionUrl);
});

test("não redireciona conexões diretas, locais, hosts semelhantes ou portas personalizadas", () => {
  for (const url of [
    "postgresql://postgres:fictional@db.example.supabase.co:5432/postgres",
    "postgresql://postgres:fictional@localhost:5432/postgres",
    "postgresql://postgres:fictional@aws-0.pooler.supabase.com.example.org:5432/postgres",
    sessionUrl.replace(":5432", ":5555"),
  ]) {
    assert.equal(postgresRuntimeConfig(url, true).url, url);
  }
});

test("servidor persistente mantém a configuração existente", () => {
  const config = postgresRuntimeConfig(sessionUrl, false);
  assert.equal(config.url, sessionUrl);
  assert.equal(config.options.max, 5);
  assert.equal(config.options.idle_timeout, 20);
  assert.equal(config.options.prepare, false);
});

test("erro de configuração não inclui a URL com credenciais", () => {
  assert.throws(() => postgresRuntimeConfig("invalid://fictional-secret@[invalid", true), {
    message: "DATABASE_URL inválida.",
  });
});
