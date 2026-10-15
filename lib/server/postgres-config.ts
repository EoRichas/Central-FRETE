/** Runtime connections only: migrations must keep their session-scoped connection. */
export function postgresRuntimeConfig(databaseUrl: string, onVercel: boolean) {
  let url = databaseUrl;
  if (onVercel) {
    let parsed: URL;
    try {
      parsed = new URL(databaseUrl);
    } catch {
      // URL parsing errors can contain credentials; never propagate that input.
      throw new Error("DATABASE_URL inválida.");
    }
    // Supavisor exposes the same project/credentials on the transaction port.
    // Do not rewrite direct connections, custom hosts or custom ports.
    if (
      ["postgres:", "postgresql:"].includes(parsed.protocol) &&
      /^[a-z0-9-]+\.pooler\.supabase\.com$/i.test(parsed.hostname) &&
      (!parsed.port || parsed.port === "5432")
    ) {
      parsed.port = "6543";
      url = parsed.toString();
    }
  }
  return {
    url,
    options: {
      max: onVercel ? 1 : 5,
      idle_timeout: onVercel ? 5 : 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require" as const,
    },
  };
}
