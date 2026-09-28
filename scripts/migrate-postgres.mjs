import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { readRuntimeConfig } from "./runtime-config.mjs";

export async function migrateDatabase(configuration) {
  const config = configuration ?? readRuntimeConfig(process.env, { requireSessionSecret: false });
  const migrationFiles = [
    "001_central_frete_postgres.sql",
    "002_fleet.sql",
    "003_fleet_billing.sql",
    "004_operational_role.sql",
    "005_detach_driver_vehicle.sql",
    "006_fleet_vehicle_cost_average_flag.sql",
    "008_fleet_results.sql",
    "009_direct_paid_operation_costs.sql",
    "010_fleet_cargo_sales_orders.sql",
    "011_sale_origin_location_type.sql",
    "../supabase/migrations/20260923220518_fleet_operation_integrity.sql",
    "012_sales_channels_global_numbering_costs.sql",
    "013_fleet_document_costs.sql",
    "014_complete_global_sale_numbers.sql",
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
    // Run historical data migrations once. Replaying 009 after 012 would incorrectly
    // mark new, unpaid CTE/MDF costs as paid and restore the old annual trigger.
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS public.central_schema_migrations (
      name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    ); ALTER TABLE public.central_schema_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON public.central_schema_migrations FROM anon,authenticated;`);
    await sql.unsafe("SELECT pg_advisory_lock(hashtext('central-frete-migration-runner'))");
    try {
      for (let index=0; index<migrationFiles.length; index++) {
        const name=migrationFiles[index];
        const applied=await sql.unsafe('SELECT name FROM public.central_schema_migrations WHERE name=$1',[name]);
        if (applied.length) continue;
        // Each source already encloses its changes in BEGIN/COMMIT. Add the ledger
        // record before that COMMIT so schema and ledger are committed together.
        const marker=`INSERT INTO public.central_schema_migrations(name) VALUES ('${name.replaceAll("'", "''")}');`;
        await sql.unsafe(migrations[index].replace(/COMMIT;\s*$/i, `${marker}\nCOMMIT;`));
      }
    } catch (error) {
      await sql.unsafe("ROLLBACK");
      throw error;
    } finally {
      await sql.unsafe("SELECT pg_advisory_unlock(hashtext('central-frete-migration-runner'))");
    }
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
