import assert from "node:assert/strict";
import test from "node:test";
import { readRuntimeConfig } from "../scripts/runtime-config.mjs";

const validEnvironment = {
  DATABASE_URL: "postgresql://postgres.project:secret@aws-0-sa-east-1.pooler.supabase.com:5432/postgres",
  CENTRAL_FRETE_SESSION_SECRET: "segredo-de-teste-com-pelo-menos-32-caracteres",
  SUPABASE_URL: "https://project.supabase.co/",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-apenas-para-teste",
  RENDER: "true",
};

test("aceita a conexão Session Pooler do projeto em São Paulo", () => {
  const config = readRuntimeConfig(validEnvironment);
  assert.equal(config.databaseHost, "aws-0-sa-east-1.pooler.supabase.com");
  assert.equal(config.supabaseUrl, "https://project.supabase.co");
  assert.equal(config.storageBucket, "central-frete");
});

test("rejeita a conexão direta IPv6 do Supabase no Render", () => {
  assert.throws(
    () => readRuntimeConfig({
      ...validEnvironment,
      DATABASE_URL: "postgresql://postgres:secret@db.project.supabase.co:5432/postgres",
    }),
    /Session Pooler/,
  );
});

test("rejeita segredo de sessão ausente ou curto", () => {
  assert.throws(
    () => readRuntimeConfig({ ...validEnvironment, CENTRAL_FRETE_SESSION_SECRET: "curto" }),
    /32 caracteres/,
  );
});

test("permite executar somente a migração sem segredo de sessão", () => {
  const config = readRuntimeConfig(
    { DATABASE_URL: validEnvironment.DATABASE_URL },
    { requireSessionSecret: false },
  );
  assert.equal(config.databaseHost, "aws-0-sa-east-1.pooler.supabase.com");
});
