import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { readRuntimeConfig } from "./runtime-config.mjs";

export async function migrateDatabase(configuration) {
  const config = configuration ?? readRuntimeConfig(process.env, { requireSessionSecret: false });
  const migrationFiles = [
    "001_central_frete_postgres.sql",
    "002_fleet.sql",
  ];
  const migrations = await Promise.all(
    migrationFiles.map((file) =>
      readFile(new URL(`../database/${file}`, import.meta.url), "utf8"),
    ),
  );
  const sql = postgres(config.databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
    connect_timeout: 15,
    idle_timeout: 5,
  });

  try {
    console.info(`Preparando as tabelas do Central Frete em ${config.databaseHost}.`);
    for (const migration of migrations) await sql.unsafe(migration);
    console.info("Estrutura PostgreSQL criada ou atualizada com sucesso.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await migrateDatabase();
  } catch (error) {
    console.error("Não foi possível preparar o banco:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
