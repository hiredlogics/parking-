/**
 * AI-dynamic questions (additive, idempotent).
 * Mirrors lib/db/questionSchema.ts.
 */

CREATE TABLE IF NOT EXISTS case_questions (
  id                TEXT PRIMARY KEY,
  case_id           TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  seq               INTEGER NOT NULL,
  target_fact       TEXT NOT NULL,
  reason_code       TEXT NOT NULL,
  route             TEXT NOT NULL,
  question_json     JSONB NOT NULL,
  label             TEXT NOT NULL,
  origin            TEXT NOT NULL,
  provider_id       TEXT,
  model             TEXT,
  prompt_version    TEXT,
  rejections        JSONB NOT NULL DEFAULT '[]',
  validation_passed BOOLEAN NOT NULL DEFAULT TRUE,
  answer_json       JSONB,
  asked_at          TEXT NOT NULL,
  answered_at       TEXT
);

CREATE INDEX IF NOT EXISTS case_questions_case_idx ON case_questions (case_id);

CREATE UNIQUE INDEX IF NOT EXISTS case_questions_fact_idx
  ON case_questions (case_id, target_fact);

CREATE UNIQUE INDEX IF NOT EXISTS case_questions_pending_idx
  ON case_questions (case_id)
  WHERE answered_at IS NULL;
