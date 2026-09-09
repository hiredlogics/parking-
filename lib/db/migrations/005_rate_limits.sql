/**
 * P1-a follow-up — rate limiting (additive, idempotent).
 * Mirrors lib/db/rateLimitSchema.ts.
 */

CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key   TEXT PRIMARY KEY,
  count        INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS rate_limits_expires_idx ON rate_limits (expires_at);
