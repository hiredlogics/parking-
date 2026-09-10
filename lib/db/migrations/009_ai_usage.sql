/**
 * AI usage and cost (additive, idempotent).
 * Mirrors lib/db/usageSchema.ts.
 */

CREATE TABLE IF NOT EXISTS ai_usage (
  id                  TEXT PRIMARY KEY,
  case_id             TEXT REFERENCES appeal_cases(id) ON DELETE CASCADE,
  operation           TEXT NOT NULL,
  provider            TEXT NOT NULL,
  model               TEXT NOT NULL,
  input_tokens        INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens       INTEGER NOT NULL DEFAULT 0,
  request_id          TEXT,
  estimated_cost      NUMERIC NOT NULL DEFAULT 0,
  pricing_version     TEXT NOT NULL,
  failed              BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_usage_case_idx ON ai_usage (case_id);
CREATE INDEX IF NOT EXISTS ai_usage_operation_idx ON ai_usage (operation);
CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at);
