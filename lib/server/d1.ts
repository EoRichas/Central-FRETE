import postgres from "postgres";
import { normalizeDatabaseValue, toPostgresSql } from "./postgres-sql.ts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type QueryResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta?: Record<string, unknown>;
};

type Prepared = D1PreparedStatement & {
  bind: (...values: unknown[]) => Prepared;
  all: <T = Record<string, unknown>>() => Promise<QueryResult<T>>;
  first: <T = Record<string, unknown>>() => Promise<T | null>;
  run: <T = Record<string, unknown>>() => Promise<QueryResult<T>>;
};

type Database = {
  prepare: (query: string) => Prepared;
  batch: <T = Record<string, unknown>>(statements: D1PreparedStatement[]) => Promise<QueryResult<T>[]>;
};

let client: ReturnType<typeof postgres> | null = null;
const statementData = new WeakMap<D1PreparedStatement, { query: string; params: unknown[] }>();

function databaseUrl() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new ApiError(503, "Banco de dados indisponível.");
  }
  return url;
}

function getClient() {
  if (!client) {
    client = postgres(databaseUrl(), {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false,
      ssl: "require",
      types: { bigint: postgres.BigInt },
    });
  }
  return client;
}

function queryResult<T>(rows: readonly unknown[]): QueryResult<T> {
  return {
    success: true,
    results: rows.map((row) => normalizeDatabaseValue(row) as T),
  };
}

function databaseError(error: unknown, query: string): ApiError {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : null;

  console.error("central_frete_database_error", { code, message, query });

  if (code === "23505") return new ApiError(409, "Já existe um registro com os dados informados.");
  if (code === "23503") return new ApiError(409, "O registro possui vínculos e não pode ser alterado dessa forma.");
  if (code === "42P01") {
    return new ApiError(503, "Banco de dados ainda não inicializado.");
  }

  return new ApiError(503, "Falha ao acessar o banco de dados.");
}

async function execute<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
  try {
    const rows = await getClient().unsafe(toPostgresSql(sql), params as never[]);
    return queryResult<T>(rows);
  } catch (error) {
    throw databaseError(error, sql);
  }
}

function prepared(query: string, params: unknown[] = []): Prepared {
  const statement: Prepared = {
    bind(...values: unknown[]) {
      return prepared(query, values);
    },
    async all<T = Record<string, unknown>>() {
      return execute<T>(query, params);
    },
    async first<T = Record<string, unknown>>() {
      const result = await execute<T>(query, params);
      return result.results[0] ?? null;
    },
    async run<T = Record<string, unknown>>() {
      return execute<T>(query, params);
    },
  };
  statementData.set(statement, { query, params });
  return statement;
}

export async function getD1(): Promise<Database> {
  return {
    prepare: (query: string) => prepared(query),
    batch: async <T = Record<string, unknown>>(statements: D1PreparedStatement[]) => {
      try {
        return await getClient().begin(async (transaction) => {
          const results: QueryResult<T>[] = [];
          for (const statement of statements) {
            const data = statementData.get(statement);
            if (!data) throw new ApiError(500, "A consulta não pertence à conexão do banco.");
            const rows = await transaction.unsafe(toPostgresSql(data.query), data.params as never[]);
            results.push(queryResult<T>(rows));
          }
          return results;
        });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw databaseError(error, "transaction batch");
      }
    },
  };
}

const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "central-frete";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new ApiError(503, "Armazenamento indisponível.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

function storageUrl(path: string) {
  const { url } = supabaseConfig();
  return `${url}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

class SupabaseStorageObject {
  constructor(
    public readonly body: ReadableStream<Uint8Array>,
    private readonly contentType: string | null,
  ) {}

  writeHttpMetadata(headers: Headers) {
    if (this.contentType) headers.set("content-type", this.contentType);
  }
}

class SupabaseStorageBucket {
  async put(
    path: string,
    body: ArrayBuffer,
    options?: {
      httpMetadata?: { contentType?: string };
      customMetadata?: Record<string, string>;
    },
  ) {
    const { key } = supabaseConfig();
    const response = await fetch(storageUrl(path), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": options?.httpMetadata?.contentType || "application/octet-stream",
        "x-upsert": "false",
      },
      body,
    });
    if (!response.ok) {
      console.error("central_frete_storage_put_error", {
        status: response.status,
        body: await response.text(),
      });
      throw new ApiError(503, "Falha ao salvar arquivo no Supabase Storage.");
    }
  }

  async get(path: string) {
    const { key } = supabaseConfig();
    const response = await fetch(storageUrl(path), {
      headers: { Authorization: `Bearer ${key}`, apikey: key },
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok || !response.body) {
      throw new ApiError(503, "Falha ao ler arquivo no Supabase Storage.");
    }
    return new SupabaseStorageObject(response.body, response.headers.get("content-type"));
  }

  async delete(path: string) {
    const { url, key } = supabaseConfig();
    const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(STORAGE_BUCKET)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}`, apikey: key, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [path] }),
    });
    if (!response.ok && response.status !== 404) {
      console.error("central_frete_storage_delete_error", {
        status: response.status,
        body: await response.text(),
      });
      throw new ApiError(503, "Falha ao remover arquivo do Supabase Storage.");
    }
  }
}

let bucket: SupabaseStorageBucket | null = null;

export async function getBucket() {
  bucket ??= new SupabaseStorageBucket();
  return bucket;
}

export async function queryAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await (await getD1()).prepare(sql).bind(...params).all<T>();
  if (!result.success) throw new ApiError(500, "Falha ao consultar os dados.");
  return result.results ?? [];
}

export async function queryFirst<T>(sql: string, params: unknown[] = []): Promise<T | null> {
  return (await getD1()).prepare(sql).bind(...params).first<T>();
}

export function jsonError(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  console.error("central_frete_unhandled_error", error);
  return Response.json({ error: "Não foi possível concluir a operação." }, { status: 500 });
}
