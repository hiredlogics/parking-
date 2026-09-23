import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import { hardenOutboundConnections } from "@/lib/net/bootstrap";

/**
 * Postgres client.
 *
 * Every route in this app declares `runtime = "nodejs"` (there is no
 * edge runtime anywhere) and it deploys as a single long-running Docker
 * container, not a serverless/edge function — so a real TCP connection
 * pool (`pg`) is always available and always preferable to an
 * HTTP-per-query driver: a request that issues N sequential queries
 * (schema setup alone is ~90 statements on a cold database) pays N
 * network round trips either way, but a pooled TCP connection keeps
 * those round trips to the DB's actual latency, while an HTTP driver
 * adds a full HTTPS request/response on top of every single one.
 *
 * `pg` is therefore the default for ANY connection string, including a
 * remote Neon host — Neon's own `sslmode=require` query param is parsed
 * by `pg-connection-string` into the right TLS config automatically, no
 * extra setup needed. The HTTP driver (`@neondatabase/serverless`) is
 * kept only as an explicit opt-out (`DB_HTTP_DRIVER=1`) for a genuinely
 * edge/serverless deployment target with no TCP access, which this
 * project is not.
 */

export type SqlClient = {
  query: (text: string, params?: unknown[]) => Promise<unknown>;
};

let cachedSql: SqlClient | null = null;

function readUrl(): string | null {
  const raw = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  return raw.trim().length === 0 ? null : raw;
}

export function hasDb(): boolean {
  return readUrl() !== null;
}

/** Explicit opt-out for a deployment target with no TCP access. */
function wantsHttpDriver(): boolean {
  return (process.env.DB_HTTP_DRIVER ?? "").trim() === "1";
}

/** Connect-level failures worth one more attempt. */
function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /fetch failed|Error connecting to database|ETIMEDOUT|ECONNRESET|socket hang up|terminating connection|Connection terminated/i.test(
      message,
    )
  ) {
    return true;
  }
  const code =
    (err as { sourceError?: { cause?: { code?: string } } })?.sourceError?.cause
      ?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "ETIMEDOUT" || code === "ECONNRESET";
}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function withRetry(queryFn: SqlClient["query"]): SqlClient["query"] {
  return async (text: string, params?: unknown[]) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        return await queryFn(text, params);
      } catch (err) {
        lastError = err;
        if (!isTransientDbError(err) || attempt === RETRY_ATTEMPTS) throw err;
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
    throw lastError;
  };
}

function createPooledPgClient(url: string): SqlClient {
  const pool = new PgPool({ connectionString: url, max: 10 });
  const query: SqlClient["query"] = async (text, params) => {
    const result = await pool.query(text, params as unknown[] | undefined);
    return { rows: result.rows };
  };
  return { query: withRetry(query) };
}

function createNeonClient(url: string): SqlClient {
  hardenOutboundConnections();
  const sql = neon(url) as NeonQueryFunction<false, false>;
  const query: SqlClient["query"] = async (text, params) => {
    return sql.query(text, params as unknown[] | undefined);
  };
  return { query: withRetry(query) };
}

export function getSql(): SqlClient {
  if (cachedSql) return cachedSql;
  const url = readUrl();
  if (!url) {
    throw new Error(
      "No Postgres connection string is set. Set POSTGRES_URL (local or Neon) or DATABASE_URL.",
    );
  }
  cachedSql = wantsHttpDriver() ? createNeonClient(url) : createPooledPgClient(url);
  return cachedSql;
}
