/**
 * Knowledge Base / Legal Source Register DDL (additive).
 *
 * Kept in its own module so `lib/db/schema.ts` stays readable. These
 * statements are appended to the idempotent ensureSchema() run, so a
 * deploy with no KB edits behaves exactly as before.
 *
 * Spec: MASTER Developer Pack V2 Part 8; AI Legal KB V2 §1, §17, §19;
 * Legal Authority & Source Register V1 §4, §16.
 */
export const KB_STATEMENTS: string[] = [
  /* ---------- Legal source register (Source Register §16) ---------- */
  `CREATE TABLE IF NOT EXISTS legal_sources (
    source_id         TEXT PRIMARY KEY,
    title             TEXT NOT NULL,
    jurisdiction      TEXT NOT NULL DEFAULT 'ENGLAND_WALES',
    authority_level   TEXT NOT NULL,
    status            TEXT NOT NULL,
    effective_from    TEXT,
    effective_to      TEXT,
    source_reference  TEXT,
    source_url        TEXT,
    last_reviewed_at  TEXT,
    /* KB-GOV-06 — quotation disabled unless an admin verifies+enables. */
    quotation_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    notes             TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS legal_sources_status_idx ON legal_sources (status)`,

  /* ---------- Industry Code versions (Source Register §4) ---------- */
  `CREATE TABLE IF NOT EXISTS code_versions (
    id                TEXT PRIMARY KEY,
    code_name         TEXT NOT NULL,
    version           TEXT NOT NULL,
    effective_from    TEXT,
    effective_to      TEXT,
    transition_status TEXT NOT NULL DEFAULT 'CURRENT',
    ata_applicability TEXT NOT NULL DEFAULT 'ALL',
    published_at      TEXT,
    source_url        TEXT,
    notes             TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS code_versions_effective_idx ON code_versions (effective_from)`,

  /* ---------- Controlled knowledge modules (V2 Part 8) ---------- */
  `CREATE TABLE IF NOT EXISTS kb_modules (
    module_id        TEXT PRIMARY KEY,
    topic            TEXT NOT NULL,
    route_family     TEXT NOT NULL,
    use_when         JSONB NOT NULL DEFAULT '[]',
    do_not_use_when  JSONB NOT NULL DEFAULT '[]',
    legal_basis      TEXT,
    core_proposition TEXT NOT NULL,
    ai_must_check    JSONB NOT NULL DEFAULT '[]',
    evidence_needed  JSONB NOT NULL DEFAULT '[]',
    drafting_notes   TEXT,
    version          INTEGER NOT NULL DEFAULT 1,
    effective_from   TEXT,
    effective_to     TEXT,
    status           TEXT NOT NULL DEFAULT 'ACTIVE',
    last_legal_review TEXT,
    change_notes     TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS kb_modules_route_idx ON kb_modules (route_family)`,
  `CREATE INDEX IF NOT EXISTS kb_modules_status_idx ON kb_modules (status)`,

  /* ---------- Module ↔ source join (KB-GOV-02) ---------- */
  `CREATE TABLE IF NOT EXISTS kb_module_sources (
    module_id  TEXT NOT NULL REFERENCES kb_modules(module_id) ON DELETE CASCADE,
    source_id  TEXT NOT NULL REFERENCES legal_sources(source_id) ON DELETE CASCADE,
    PRIMARY KEY (module_id, source_id)
  )`,

  /* ---------- Appendix A drafting blocks ---------- */
  `CREATE TABLE IF NOT EXISTS drafting_blocks (
    block_id        TEXT PRIMARY KEY,
    title           TEXT NOT NULL,
    route_family    TEXT NOT NULL,
    text            TEXT NOT NULL,
    variables       JSONB NOT NULL DEFAULT '[]',
    status          TEXT NOT NULL DEFAULT 'ACTIVE',
    version         INTEGER NOT NULL DEFAULT 1,
    in_v2_appendix  BOOLEAN NOT NULL DEFAULT TRUE,
    usage_notes     TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS drafting_blocks_status_idx ON drafting_blocks (status)`,

  /* ---------- Module ↔ permitted blocks ---------- */
  `CREATE TABLE IF NOT EXISTS kb_module_blocks (
    module_id  TEXT NOT NULL REFERENCES kb_modules(module_id) ON DELETE CASCADE,
    block_id   TEXT NOT NULL REFERENCES drafting_blocks(block_id) ON DELETE CASCADE,
    PRIMARY KEY (module_id, block_id)
  )`,

  /* ---------- Retrieval + draft + validation audit trail ---------- */
  `CREATE TABLE IF NOT EXISTS retrieval_runs (
    id             TEXT PRIMARY KEY,
    case_id        TEXT,
    primary_route  TEXT,
    output_json    JSONB NOT NULL,
    prompt_version TEXT,
    created_at     TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS appeal_drafts (
    id             TEXT PRIMARY KEY,
    case_id        TEXT,
    draft_text     TEXT NOT NULL,
    module_ids     JSONB NOT NULL DEFAULT '[]',
    prompt_version TEXT,
    model          TEXT,
    superseded     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at     TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS appeal_drafts_case_idx ON appeal_drafts (case_id)`,
  `CREATE TABLE IF NOT EXISTS validation_runs (
    id                TEXT PRIMARY KEY,
    case_id           TEXT,
    draft_id          TEXT,
    status            TEXT NOT NULL,
    issues            JSONB NOT NULL DEFAULT '[]',
    validator_version TEXT,
    created_at        TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS validation_runs_case_idx ON validation_runs (case_id)`,

  /* ---------- Manual review + audit (V2 Part 2 step 11) ---------- */
  `CREATE TABLE IF NOT EXISTS manual_reviews (
    id          TEXT PRIMARY KEY,
    case_id     TEXT,
    reason      TEXT NOT NULL,
    detail      TEXT,
    status      TEXT NOT NULL DEFAULT 'OPEN',
    created_at  TEXT NOT NULL,
    resolved_at TEXT,
    resolved_by TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS manual_reviews_status_idx ON manual_reviews (status)`,
  `CREATE TABLE IF NOT EXISTS audit_events (
    id          TEXT PRIMARY KEY,
    case_id     TEXT,
    event_type  TEXT NOT NULL,
    payload     JSONB,
    actor_id    TEXT,
    created_at  TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS audit_events_case_idx ON audit_events (case_id)`,

  /* ---------- Prompt versioning (V2 §38 of brief / Part 13 ph.10) ---------- */
  `CREATE TABLE IF NOT EXISTS prompt_versions (
    id          TEXT PRIMARY KEY,
    operation   TEXT NOT NULL,
    version     TEXT NOT NULL,
    body        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE (operation, version)
  )`,
];
