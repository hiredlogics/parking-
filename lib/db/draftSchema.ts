/**
 * P0-d — persisted appeal drafts (additive).
 *
 * The validated draft is stored so that:
 *
 *   - the PDF and DOCX are rendered from the SAME text that passed
 *     validation, rather than being re-derived at download time;
 *   - a repeat download or a page refresh cannot produce different
 *     wording, or spend another AI call;
 *   - every release is auditable — the validation run and release
 *     checklist that permitted it are stored alongside the body.
 *
 * Drafts are append-only. A regeneration supersedes the previous row
 * rather than overwriting it.
 */
export const DRAFT_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS case_appeal_drafts (
    id                 TEXT PRIMARY KEY,
    case_id            TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    version            INTEGER NOT NULL DEFAULT 1,
    /* READY | MANUAL_REVIEW | FAILED */
    status             TEXT NOT NULL,
    /* Released letter body. Null unless status = READY. */
    body               TEXT,
    paragraphs         JSONB NOT NULL DEFAULT '[]',

    /* Provenance — which knowledge and which model produced this. */
    module_ids         JSONB NOT NULL DEFAULT '[]',
    primary_route      TEXT,
    secondary_routes   JSONB NOT NULL DEFAULT '[]',
    code_version_id    TEXT,
    pofa_route         TEXT,
    provider_id        TEXT,
    prompt_version     TEXT,
    model              TEXT,
    bespoke            BOOLEAN NOT NULL DEFAULT FALSE,

    /* Why this draft was allowed out (or was not). */
    validation         JSONB,
    checklist          JSONB,
    warnings           JSONB NOT NULL DEFAULT '[]',
    attempts           INTEGER NOT NULL DEFAULT 1,
    block_reason       TEXT,
    block_detail       TEXT,

    generation_version TEXT,
    created_at         TEXT NOT NULL,
    /* Set when a later draft replaces this one. */
    superseded_at      TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS case_appeal_drafts_case_idx ON case_appeal_drafts (case_id)`,
  /* At most one live draft per case. */
  `CREATE UNIQUE INDEX IF NOT EXISTS case_appeal_drafts_current_idx
     ON case_appeal_drafts (case_id)
     WHERE superseded_at IS NULL`,
];
