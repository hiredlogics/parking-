import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { hardenOutboundConnections } from "@/lib/net/bootstrap";

/**
 * Neon serverless Postgres client.
 *
 * Reads the connection string from `POSTGRES_URL` (the env var Vercel's
 * Neon integration populates by default) or `DATABASE_URL` as a
 * fallback. When neither is set, `hasDb()` returns false and callers
 * should render an "unconfigured" state — the app must not crash.
 *
 * Queries go through a small bounded retry. Neon's HTTP driver turns a
 * transient connect failure into a thrown `NeonDbError`, which
 * otherwise propagates all the way out of an API route as a 500 — a
 * single dropped connect was enough to fail case creation outright.
 */

let cachedSql: NeonQueryFunction<false, false> | null = null;

function readUrl(): string | null {
  const raw = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  return raw.trim().length === 0 ? null : raw;
}

export function hasDb(): boolean {
  return readUrl() !== null;
}

/** Connect-level failures worth one more attempt. */
function isTransientDbError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  if (/fetch failed|Error connecting to database|ETIMEDOUT|ECONNRESET|socket hang up|terminating connection|Connection terminated/i.test(message)) {
    return true;
  }
  const code = (err as { sourceError?: { cause?: { code?: string } } })
    ?.sourceError?.cause?.code
    ?? (err as { cause?: { code?: string } })?.cause?.code;
  return code === "ETIMEDOUT" || code === "ECONNRESET";
}

const RETRY_ATTEMPTS = 3;
const RETRY_BASE_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Wrap the driver so every `sql.query(...)` retries a transient
 * connect failure. Query errors (bad SQL, constraint violations) are
 * rethrown untouched on the first attempt.
 */
function withRetry(
  sql: NeonQueryFunction<false, false>,
): NeonQueryFunction<false, false> {
  const originalQuery = sql.query.bind(sql);

  const retryingQuery = async (...args: unknown[]) => {
    let lastError: unknown;
    for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
      try {
        return await (originalQuery as (...a: unknown[]) => Promise<unknown>)(...args);
      } catch (err) {
        lastError = err;
        if (!isTransientDbError(err) || attempt === RETRY_ATTEMPTS) throw err;
        await sleep(RETRY_BASE_MS * attempt);
      }
    }
    throw lastError;
  };

  (sql as unknown as { query: unknown }).query = retryingQuery;
  return sql;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (cachedSql) return cachedSql;
  const url = readUrl();
  if (!url) {
    throw new Error(
      "No Postgres connection string is set. Add the Neon (or another Postgres) integration on Vercel so POSTGRES_URL is populated, or set DATABASE_URL locally.",
    );
  }
  // Must run before the first connect, not after it has already failed.
  hardenOutboundConnections();
  cachedSql = withRetry(neon(url));
  return cachedSql;
}
