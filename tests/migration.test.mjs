import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(new URL("database/001_central_frete_postgres.sql", root), "utf8");
const applicationTables = [
  "users",
  "clients",
  "providers",
  "financial_accounts",
  "freight_sales",
  "client_contacts",
  "client_addresses",
  "freight_costs",
  "receivable_installments",
  "payment_transactions",
  "import_runs",
  "audit_logs",
  "seller_commission_statuses",
  "seller_payment_profiles",
  "sale_attachments",
];

test("cria as 15 tabelas PostgreSQL de forma idempotente e protegida", () => {
  for (const table of applicationTables) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table} \\(`, "i"));
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, "i"));
  }

  assert.match(migration, /BEGIN;/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /REVOKE ALL ON TABLE[\s\S]+FROM anon, authenticated;/);
  assert.match(migration, /COMMIT;/);
});

test("ordena tabelas de acordo com as dependências de chaves estrangeiras", () => {
  const tablePosition = (table) => migration.indexOf(`CREATE TABLE IF NOT EXISTS public.${table}`);
  assert.ok(tablePosition("users") < tablePosition("freight_sales"));
  assert.ok(tablePosition("clients") < tablePosition("client_addresses"));
  assert.ok(tablePosition("freight_sales") < tablePosition("freight_costs"));
  assert.ok(tablePosition("receivable_installments") < tablePosition("payment_transactions"));
});

test("não utiliza sintaxe exclusiva do SQLite", () => {
  assert.doesNotMatch(migration, /strftime\s*\(/i);
  assert.doesNotMatch(migration, /insert\s+or\s+ignore/i);
  assert.doesNotMatch(migration, /`/);
});

test("mantém package.json e package-lock.json sincronizados", async () => {
  const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
  const packageLock = JSON.parse(await readFile(new URL("package-lock.json", root), "utf8"));

  assert.equal(packageLock.name, packageJson.name);
  assert.deepEqual(packageLock.packages[""].dependencies, packageJson.dependencies);
  assert.deepEqual(packageLock.packages[""].devDependencies, packageJson.devDependencies);
  assert.equal(packageLock.packages["node_modules/postgres"].version, packageJson.dependencies.postgres);
  assert.match(packageLock.packages["node_modules/postgres"].integrity, /^sha512-/);
});

test("não fixa o identificador do projeto Supabase excluído", async () => {
  const [environmentExample, renderConfig] = await Promise.all([
    readFile(new URL(".env.example", root), "utf8"),
    readFile(new URL("render.yaml", root), "utf8"),
  ]);

  assert.doesNotMatch(environmentExample, /wntrfpypxpqsglluqvkt/);
  assert.doesNotMatch(renderConfig, /wntrfpypxpqsglluqvkt/);
  assert.match(renderConfig, /CENTRAL_FRETE_SESSION_SECRET[\s\S]*generateValue: true/);
});

test("não publica registros reais de vendedores, placas ou valores operacionais", async () => {
  const embeddedImport = await readFile(new URL("data/central-frete-import.ts", root), "utf8");

  assert.match(embeddedImport, /validRows:\s*0/);
  assert.match(embeddedImport, /providers:\s*\[\]/);
  assert.match(embeddedImport, /sales:\s*\[\]/);
  assert.doesNotMatch(embeddedImport, /plate:\s*"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}"/);
});
