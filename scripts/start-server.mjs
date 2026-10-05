import { spawn } from "node:child_process";
import { migrateDatabase } from "./migrate-postgres.mjs";
import { readRuntimeConfig } from "./runtime-config.mjs";

async function ensureStorageBucket(config) {
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    console.warn(
      "SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada: anexos e comprovantes ficarão indisponíveis.",
    );
    return;
  }

  const response = await fetch(`${config.supabaseUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ id: config.storageBucket, name: config.storageBucket, public: false }),
  });

  if (response.ok || response.status === 409 || /already exists|duplicate/i.test(await response.text())) {
    const check = await fetch(`${config.supabaseUrl}/storage/v1/bucket/${encodeURIComponent(config.storageBucket)}`, {
      headers: {Authorization: `Bearer ${config.serviceRoleKey}`, apikey: config.serviceRoleKey},
      signal: AbortSignal.timeout(5000),
    });
    if (!check.ok || (await check.json()).public !== false) {
      throw new Error('O bucket de comprovantes precisa estar privado. Anexos permanecerão bloqueados.');
    }
    console.info('Bucket privado de comprovantes verificado.');
    return;
  }

  console.warn(
    `Não foi possível verificar o bucket ${config.storageBucket} (HTTP ${response.status}). ` +
      "O sistema continuará, mas os anexos precisam da chave service_role correta.",
  );
}

try {
  const config = readRuntimeConfig();
  if (config.migrateOnStart) await migrateDatabase(config);
  try {
    await ensureStorageBucket(config);
  } catch (error) {
    console.warn(
      "Não foi possível verificar o Supabase Storage:",
      error instanceof Error ? error.message : String(error),
    );
  }

  const server = spawn(
    process.execPath,
    ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", config.port],
    { stdio: "inherit", env: process.env },
  );

  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => { server.kill(signal); });
  }

  server.once("error", (error) => {
    console.error("Não foi possível iniciar o servidor Next.js:", error.message);
    process.exitCode = 1;
  });

  server.once("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exitCode = code ?? 1;
  });
} catch (error) {
  console.error("Falha ao iniciar o Central Frete:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
