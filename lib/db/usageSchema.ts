/**
 * AI usage and cost (additive).
 *
 * The client wants the approximate AI cost of a COMPLETE appeal. Usage
 * was previously invisible: only the drafting provider read
 * `response.usage`, into a field nothing consumed, so cost per case was
 * unknowable.
 *
 * One row per actual provider call. Deterministic operations — PoFA,
 * Code resolution, validation, the bank fallback — make no call and get
 * no row, so a zero here means "no model was used", not "not measured".
 */
export const USAGE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_usage (
    id                  TEXT PRIMARY KEY,
    case_id             TEXT REFERENCES appeal_cases(id) ON DELETE CASCADE,
    /* EXTRACTION | QUESTION_GENERATION | ANALYSIS | DRAFTING | VALIDATION */
    operation           TEXT NOT NULL,
    provider            TEXT NOT NULL,
    model               TEXT NOT NULL,
    input_tokens        INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens       INTEGER NOT NULL DEFAULT 0,
    request_id          TEXT,
    /* Cost in GBP at the pricing version below. */
    estimated_cost      NUMERIC NOT NULL DEFAULT 0,
    pricing_version     TEXT NOT NULL,
    /* Set when the call failed; usage may still have been billed. */
    failed              BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS ai_usage_case_idx ON ai_usage (case_id)`,
  `CREATE INDEX IF NOT EXISTS ai_usage_operation_idx ON ai_usage (operation)`,
  `CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at)`,
];
