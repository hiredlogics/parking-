/**
 * P0-d — persisted appeal drafts (additive, idempotent).
 * Mirrors lib/db/draftSchema.ts.
 */

CREATE TABLE IF NOT EXISTS case_appeal_drafts (
  id                 TEXT PRIMARY KEY,
  case_id            TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  version            INTEGER NOT NULL DEFAULT 1,
  status             TEXT NOT NULL,
  body               TEXT,
  paragraphs         JSONB NOT NULL DEFAULT '[]',
  module_ids         JSONB NOT NULL DEFAULT '[]',
  primary_route      TEXT,
  secondary_routes   JSONB NOT NULL DEFAULT '[]',
  code_version_id    TEXT,
  pofa_route         TEXT,
  provider_id        TEXT,
  prompt_version     TEXT,
  model              TEXT,
  bespoke            BOOLEAN NOT NULL DEFAULT FALSE,
  validation         JSONB,
  checklist          JSONB,
  warnings           JSONB NOT NULL DEFAULT '[]',
  attempts           INTEGER NOT NULL DEFAULT 1,
  block_reason       TEXT,
  block_detail       TEXT,
  generation_version TEXT,
  created_at         TEXT NOT NULL,
  superseded_at      TEXT
);

CREATE INDEX IF NOT EXISTS case_appeal_drafts_case_idx ON case_appeal_drafts (case_id);
CREATE UNIQUE INDEX IF NOT EXISTS case_appeal_drafts_current_idx
  ON case_appeal_drafts (case_id)
  WHERE superseded_at IS NULL;
