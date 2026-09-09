import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Neon serverless Postgres client.
 *
 * Reads the connection string from `POSTGRES_URL` (the env var Vercel's
 * Neon integration populates by default) or `DATABASE_URL` as a
 * fallback. When neither is set, `hasDb()` returns false and callers
 * should render an "unconfigured" state — the app must not crash.
 */

let cachedSql: NeonQueryFunction<false, false> | null = null;

function readUrl(): string | null {
  const raw = process.env.POSTGRES_URL ?? process.env.DATABASE_URL ?? "";
  return raw.trim().length === 0 ? null : raw;
}

export function hasDb(): boolean {
  return readUrl() !== null;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (cachedSql) return cachedSql;
  const url = readUrl();
  if (!url) {
    throw new Error(
      "No Postgres connection string is set. Add the Neon (or another Postgres) integration on Vercel so POSTGRES_URL is populated, or set DATABASE_URL locally.",
    );
  }
  cachedSql = neon(url);
  return cachedSql;
}
