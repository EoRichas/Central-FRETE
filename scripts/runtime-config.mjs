export function readRuntimeConfig(environment = process.env, options = {}) {
  const { requireSessionSecret = true } = options;
  const databaseUrl = environment.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("Configure DATABASE_URL com a conexão Session Pooler do projeto Supabase.");
  }

  let parsedDatabaseUrl;
  try {
    parsedDatabaseUrl = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL não é uma URI PostgreSQL válida. Copie novamente o Session Pooler do Supabase.");
  }

  if (!["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)) {
    throw new Error("DATABASE_URL precisa começar com postgresql:// ou postgres://.");
  }

  const runningOnRender = environment.RENDER === "true" || Boolean(environment.RENDER_SERVICE_ID);
  if (runningOnRender && /^db\.[^.]+\.supabase\.co$/i.test(parsedDatabaseUrl.hostname)) {
    throw new Error(
      "No Render, a conexão direta do Supabase utiliza IPv6 e falha. Use Connect > Session Pooler (porta 5432).",
    );
  }

  const sessionSecret = environment.CENTRAL_FRETE_SESSION_SECRET?.trim();
  if (requireSessionSecret && (!sessionSecret || sessionSecret.length < 32)) {
    throw new Error("CENTRAL_FRETE_SESSION_SECRET precisa conter pelo menos 32 caracteres aleatórios.");
  }

  return {
    databaseUrl,
    databaseHost: parsedDatabaseUrl.hostname,
    sessionSecret,
    supabaseUrl: environment.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "",
    serviceRoleKey: environment.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "",
    storageBucket: environment.SUPABASE_STORAGE_BUCKET?.trim() || "central-frete",
    port: environment.PORT?.trim() || "3000",
  };
}
