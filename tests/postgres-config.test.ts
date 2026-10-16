import assert from "node:assert/strict";
import { test } from "node:test";
import postgres from "postgres";
import { X509Certificate } from "node:crypto";
import { SUPABASE_CA, databaseTlsOptions } from "../lib/server/database-tls.mjs";
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
    assert.equal(sql.options.max, 3);
    assert.equal(sql.options.idle_timeout, 5);
    assert.equal(sql.options.prepare, false);
    assert.deepEqual(sql.options.ssl, { rejectUnauthorized: true, ca: SUPABASE_CA });
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

 test("certificado CA opcional preserva validação mesmo com sslmode=require na URL", async () => {
  const config = postgresRuntimeConfig(sessionUrl, true, "CERTIFICATE\\nCONTENTS");
  const sql = postgres(config.url, config.options);
  try { assert.deepEqual(sql.options.ssl, { rejectUnauthorized: true, ca: "CERTIFICATE\nCONTENTS" }); }
  finally { await sql.end(); }
});


test("CA oficial é válida e usada somente para hosts Supabase reconhecidos", () => {
  const certificate = new X509Certificate(SUPABASE_CA);
  assert.equal(certificate.ca, true);
  assert.equal(certificate.fingerprint256.replaceAll(":", ""), "807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA");
  assert.ok(Date.parse(certificate.validTo) > Date.now());
  assert.equal(databaseTlsOptions("postgres://db.example.supabase.co/postgres", undefined).ca, SUPABASE_CA);
  for (const hostname of ["localhost", "pooler.supabase.com.attacker.test", "other.example.com"]) {
    assert.deepEqual(databaseTlsOptions(`postgres://${hostname}/postgres`, undefined), { rejectUnauthorized: true });
  }
});
