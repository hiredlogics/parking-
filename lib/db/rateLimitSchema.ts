/**
 * P1-a follow-up — rate limiting (additive).
 *
 * Backed by Postgres rather than process memory so the limit holds
 * across restarts and across more than one server instance. An
 * in-memory counter would be trivially defeated by a redeploy.
 */
export const RATE_LIMIT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS rate_limits (
    /* "<action>:<subject>:<window start>" */
    bucket_key   TEXT PRIMARY KEY,
    count        INTEGER NOT NULL DEFAULT 0,
    window_start TEXT NOT NULL,
    expires_at   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at)`,
];
