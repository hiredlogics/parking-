/**
 * Phase 1 — Admin-driven configuration + first-class appeals + email outbox.
 *
 * Additive only. Legacy CRM `appeals` table is untouched; the customer
 * journey appeal entity is `case_appeals` (CASE ≠ APPEAL).
 */
export const ADMIN_CONFIG_STATEMENTS: string[] = [
  /* ---------- Services ---------- */
  `CREATE TABLE IF NOT EXISTS services (
    id                TEXT PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    name              TEXT NOT NULL,
    description       TEXT,
    payment_required  BOOLEAN NOT NULL DEFAULT TRUE,
    amount_pence      INTEGER NOT NULL DEFAULT 1199,
    currency          TEXT NOT NULL DEFAULT 'GBP',
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    config_json       JSONB NOT NULL DEFAULT '{}',
    version           INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  )`,

  /* ---------- Issues (e.g. PAYMENT_KEYING, BREAKDOWN) ---------- */
  `CREATE TABLE IF NOT EXISTS issues (
    id                TEXT PRIMARY KEY,
    service_id        TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    code              TEXT NOT NULL,
    label             TEXT NOT NULL,
    description       TEXT,
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    sort_order        INTEGER NOT NULL DEFAULT 100,
    trigger_tags      JSONB NOT NULL DEFAULT '[]',
    version           INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (service_id, code)
  )`,
  `CREATE INDEX IF NOT EXISTS issues_service_idx ON issues (service_id, status)`,

  /* ---------- Required facts per issue ---------- */
  `CREATE TABLE IF NOT EXISTS issue_required_facts (
    id                TEXT PRIMARY KEY,
    issue_id          TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    fact_key          TEXT NOT NULL,
    reason_code       TEXT,
    priority          INTEGER NOT NULL DEFAULT 100,
    evidence_types    JSONB NOT NULL DEFAULT '[]',
    required_when     JSONB NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (issue_id, fact_key)
  )`,
  `CREATE INDEX IF NOT EXISTS issue_required_facts_issue_idx
     ON issue_required_facts (issue_id, status)`,

  /* ---------- Issue ↔ knowledge ---------- */
  `CREATE TABLE IF NOT EXISTS issue_knowledge (
    issue_id          TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    module_id         TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at        TEXT NOT NULL,
    PRIMARY KEY (issue_id, module_id)
  )`,

  /* ---------- Versioned prompts ---------- */
  `CREATE TABLE IF NOT EXISTS prompts (
    id                TEXT PRIMARY KEY,
    purpose           TEXT NOT NULL,
    name              TEXT NOT NULL,
    body              TEXT NOT NULL,
    version           INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    change_notes      TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    UNIQUE (purpose, version)
  )`,
  `CREATE INDEX IF NOT EXISTS prompts_purpose_idx ON prompts (purpose, status)`,

  /* ---------- Validation rule config ---------- */
  `CREATE TABLE IF NOT EXISTS validation_rules (
    id                TEXT PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    label             TEXT NOT NULL,
    severity          TEXT NOT NULL DEFAULT 'BLOCKING',
    config_json       JSONB NOT NULL DEFAULT '{}',
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    version           INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  )`,

  /* ---------- Email templates ---------- */
  `CREATE TABLE IF NOT EXISTS email_templates (
    id                TEXT PRIMARY KEY,
    code              TEXT NOT NULL UNIQUE,
    subject           TEXT NOT NULL,
    body_text         TEXT NOT NULL,
    body_html         TEXT,
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    version           INTEGER NOT NULL DEFAULT 1,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  )`,

  /* ---------- First-class APPEAL (separate from CASE) ---------- */
  `CREATE TABLE IF NOT EXISTS case_appeals (
    id                    TEXT PRIMARY KEY,
    case_id               TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    service_id            TEXT REFERENCES services(id),
    /* DRAFT | AWAITING_ADMIN_APPROVAL | APPROVED | REJECTED | HELD */
    status                TEXT NOT NULL DEFAULT 'DRAFT',
    version               INTEGER NOT NULL DEFAULT 1,
    body                  TEXT,
    paragraphs            JSONB NOT NULL DEFAULT '[]',
    issues_json           JSONB NOT NULL DEFAULT '[]',
    facts_snapshot        JSONB NOT NULL DEFAULT '{}',
    knowledge_snapshot    JSONB NOT NULL DEFAULT '[]',
    module_ids            JSONB NOT NULL DEFAULT '[]',
    validation_json       JSONB,
    checklist_json        JSONB,
    warnings              JSONB NOT NULL DEFAULT '[]',
    prompt_version        TEXT,
    generation_version    TEXT,
    provider_id           TEXT,
    model                 TEXT,
    source_draft_id       TEXT,
    approved_by           TEXT,
    approved_at           TEXT,
    approved_body         TEXT,
    approved_paragraphs   JSONB,
    approved_version      INTEGER,
    hold_reason           TEXT,
    reject_reason         TEXT,
    admin_notes           TEXT,
    created_at            TEXT NOT NULL,
    updated_at            TEXT NOT NULL,
    superseded_at         TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS case_appeals_case_idx ON case_appeals (case_id)`,
  `CREATE INDEX IF NOT EXISTS case_appeals_status_idx ON case_appeals (status)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS case_appeals_current_idx
     ON case_appeals (case_id)
     WHERE superseded_at IS NULL`,

  /* ---------- Email outbox ---------- */
  `CREATE TABLE IF NOT EXISTS email_outbox (
    id                TEXT PRIMARY KEY,
    email_type        TEXT NOT NULL,
    case_id           TEXT REFERENCES appeal_cases(id) ON DELETE SET NULL,
    appeal_id         TEXT REFERENCES case_appeals(id) ON DELETE SET NULL,
    recipient         TEXT NOT NULL,
    subject           TEXT NOT NULL,
    body_text         TEXT NOT NULL,
    body_html         TEXT,
    template_code     TEXT,
    queued_at         TEXT NOT NULL,
    sent_at           TEXT,
    /* QUEUED | SENT | FAILED */
    status            TEXT NOT NULL DEFAULT 'QUEUED',
    failure_reason    TEXT,
    attempts          INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox (status)`,
  `CREATE INDEX IF NOT EXISTS email_outbox_case_idx ON email_outbox (case_id)`,

  /* Case status: awaiting admin approval (additive enum value, TEXT column) */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS awaiting_admin_approval BOOLEAN NOT NULL DEFAULT FALSE`,
];
