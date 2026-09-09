/**
 * Phase 1 — durable appeal case foundation (additive).
 * Applied via ensureSchema() / migrate runner. No drops.
 */

-- Durable case for private parking INITIAL_OPERATOR_APPEAL
CREATE TABLE IF NOT EXISTS appeal_cases (
  id                   TEXT PRIMARY KEY,
  public_id            TEXT UNIQUE NOT NULL,
  customer_id          TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status               TEXT NOT NULL DEFAULT 'DRAFT',
  operator_name        TEXT,
  pcn_number           TEXT,
  vrm                  TEXT,
  parking_location     TEXT,
  parking_event_date   TEXT,
  notice_issue_date    TEXT,
  notice_received_date TEXT,
  notice_route         TEXT NOT NULL DEFAULT 'UNKNOWN',
  operator_ata         TEXT NOT NULL DEFAULT 'UNKNOWN',
  case_stage           TEXT NOT NULL DEFAULT 'INITIAL_OPERATOR_APPEAL',
  driver_status        TEXT NOT NULL DEFAULT 'UNKNOWN',
  pofa_route           TEXT,
  payment_status       TEXT NOT NULL DEFAULT 'UNPAID',
  appeal_locked        BOOLEAN NOT NULL DEFAULT TRUE,
  order_id             TEXT,
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS appeal_cases_customer_idx ON appeal_cases (customer_id);
CREATE INDEX IF NOT EXISTS appeal_cases_public_id_idx ON appeal_cases (public_id);

CREATE TABLE IF NOT EXISTS case_facts (
  id                  TEXT PRIMARY KEY,
  case_id             TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  field               TEXT NOT NULL,
  value_json          JSONB,
  source              TEXT NOT NULL,
  document_id         TEXT,
  confidence          NUMERIC,
  customer_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at          TEXT NOT NULL,
  UNIQUE (case_id, field, source)
);

CREATE INDEX IF NOT EXISTS case_facts_case_idx ON case_facts (case_id);

CREATE TABLE IF NOT EXISTS case_answers (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  question_id  TEXT NOT NULL,
  answer_json  JSONB NOT NULL,
  created_at   TEXT NOT NULL,
  UNIQUE (case_id, question_id)
);

CREATE TABLE IF NOT EXISTS case_documents_meta (
  id            TEXT PRIMARY KEY,
  case_id       TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  storage_key   TEXT NOT NULL,
  file_name     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  uploaded_at   TEXT NOT NULL,
  uploaded_by   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS case_documents_meta_case_idx ON case_documents_meta (case_id);

CREATE TABLE IF NOT EXISTS case_events (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  payload      JSONB,
  actor_id     TEXT,
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events (case_id);

CREATE TABLE IF NOT EXISTS generation_jobs (
  id           TEXT PRIMARY KEY,
  case_id      TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'QUEUED',
  error        TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS generation_jobs_case_idx ON generation_jobs (case_id);
