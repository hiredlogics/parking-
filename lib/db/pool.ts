import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { Pool as PgPool } from "pg";
import { hardenOutboundConnections } from "@/lib/net/bootstrap";

/**
 * Postgres client.
 *
 * - Neon / remote URLs → `@neondatabase/serverless` (HTTP)
 * - localhost / 127.0.0.1 → `pg` TCP pool (local PostgreSQL)
 *
 * Callers use `sql.query(text, params)` and accept either a row array
 * or `{ rows }` — see `lib/db/repos.ts`.
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

function isLocalPostgres(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return /@(localhost|127\.0\.0\.1)[:/]/i.test(url);
  }
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

function createLocalPgClient(url: string): SqlClient {
  const pool = new PgPool({ connectionString: url });
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
  cachedSql = isLocalPostgres(url)
    ? createLocalPgClient(url)
    : createNeonClient(url);
  return cachedSql;
}
