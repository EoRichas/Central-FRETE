import type postgres from "postgres";

/** Reserve a connection for the complete operation, including ReadyForQuery.
 * Postgres.js otherwise pipelines independent queries on busy connections;
 * the shared transaction pooler can drop the later replies.
 * Never replay writes after a timeout or connection failure.
 */
export async function runPostgresQuery(
  client: postgres.Sql,
  query: string,
  params: unknown[] = [],
) {
  return client.begin(async transaction =>
    [...await transaction.unsafe(query, params as never[])],
  );
}
