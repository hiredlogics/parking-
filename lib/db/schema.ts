import { getSql } from "./pool";
import { KB_STATEMENTS } from "./kbSchema";
import { CASE_V2_STATEMENTS } from "./caseSchema";
import { PAYMENT_STATEMENTS } from "./paymentSchema";
import { DRAFT_STATEMENTS } from "./draftSchema";
import { RATE_LIMIT_STATEMENTS } from "./rateLimitSchema";
import { QUESTION_STATEMENTS } from "./questionSchema";
import { OUTCOME_STATEMENTS } from "./outcomeSchema";
import { USAGE_STATEMENTS } from "./usageSchema";
import { ADMIN_CONFIG_STATEMENTS } from "./adminConfigSchema";
import { PASSWORD_RESET_STATEMENTS } from "./passwordResetSchema";

/**
 * Idempotent DDL. Runs on demand from ensureSchema(); safe to call from
 * every request path — the underlying CREATE TABLE IF NOT EXISTS
 * statements are essentially free once tables exist.
 *
 * All timestamps are stored as text (ISO 8601). All ids are strings.
 * JSONB is used for a few nested value-object columns (key dates,
 * fee summary etc.) so the schema stays flat.
 */

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS admins (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'ADMIN',
    avatar_initials TEXT NOT NULL DEFAULT '?',
    created_at    TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::text
  )`,
  `CREATE TABLE IF NOT EXISTS clients (
    id                TEXT PRIMARY KEY,
    name              TEXT NOT NULL,
    email             TEXT NOT NULL,
    phone             TEXT,
    address           TEXT,
    status            TEXT NOT NULL DEFAULT 'ACTIVE',
    joined_at         TEXT NOT NULL,
    last_activity_at  TEXT NOT NULL,
    password_hash     TEXT
  )`,
  `ALTER TABLE clients ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `CREATE UNIQUE INDEX IF NOT EXISTS clients_email_lower ON clients (LOWER(email))`,
  `CREATE TABLE IF NOT EXISTS cases (
    id             TEXT PRIMARY KEY,
    client_id      TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    reference      TEXT NOT NULL,
    type           TEXT NOT NULL,
    status         TEXT NOT NULL,
    priority       TEXT NOT NULL,
    assigned_to    TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL,
    summary        TEXT,
    extras         JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS appeals (
    id                  TEXT PRIMARY KEY,
    client_id           TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    service             TEXT NOT NULL,
    pcn_reference       TEXT NOT NULL,
    vrm                 TEXT NOT NULL,
    operator            TEXT NOT NULL,
    created_at          TEXT NOT NULL,
    appeal_status       TEXT NOT NULL,
    document_status     TEXT NOT NULL,
    evidence_count      INTEGER NOT NULL DEFAULT 0,
    generated_document_name TEXT,
    amount              NUMERIC
  )`,
  `CREATE TABLE IF NOT EXISTS documents (
    id           TEXT PRIMARY KEY,
    case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    category     TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    mime_type    TEXT NOT NULL,
    uploaded_at  TEXT NOT NULL,
    uploaded_by  TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS tasks (
    id           TEXT PRIMARY KEY,
    case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    due_at       TEXT NOT NULL,
    priority     TEXT NOT NULL,
    assigned_to  TEXT,
    status       TEXT NOT NULL DEFAULT 'OPEN',
    created_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id           TEXT PRIMARY KEY,
    case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
    author_id    TEXT NOT NULL,
    content      TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS communications (
    id          TEXT PRIMARY KEY,
    case_id     TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    subject     TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    "from"      TEXT,
    "to"        TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS activity (
    id           TEXT PRIMARY KEY,
    case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
    client_id    TEXT REFERENCES clients(id) ON DELETE CASCADE,
    appeal_id    TEXT REFERENCES appeals(id) ON DELETE CASCADE,
    type         TEXT NOT NULL,
    description  TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    actor_id     TEXT,
    meta         JSONB
  )`,
  `CREATE TABLE IF NOT EXISTS payments (
    id           TEXT PRIMARY KEY,
    client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    case_id      TEXT REFERENCES cases(id) ON DELETE CASCADE,
    appeal_id    TEXT REFERENCES appeals(id) ON DELETE CASCADE,
    service      TEXT NOT NULL,
    amount       NUMERIC NOT NULL,
    status       TEXT NOT NULL,
    reference    TEXT NOT NULL UNIQUE,
    created_at   TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS system_meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id                TEXT PRIMARY KEY,
    client_id         TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    customer_email    TEXT NOT NULL,
    customer_name     TEXT NOT NULL,
    pcn_number        TEXT,
    vrm               TEXT,
    operator          TEXT,
    amount            NUMERIC NOT NULL,
    currency          TEXT NOT NULL DEFAULT 'GBP',
    payment_status    TEXT NOT NULL DEFAULT 'PENDING',
    document_status   TEXT NOT NULL DEFAULT 'LOCKED',
    email_status      TEXT NOT NULL DEFAULT 'PENDING',
    appeal_status     TEXT NOT NULL DEFAULT 'GENERATED',
    provider          TEXT NOT NULL DEFAULT 'demo',
    payment_reference TEXT,
    /* Persisted questionnaire snapshot so the server can regenerate the
       clean PDF after payment without ever having exposed it. */
    input_snapshot    JSONB NOT NULL,
    ground_count      INTEGER NOT NULL DEFAULT 0,
    evidence_count    INTEGER NOT NULL DEFAULT 0,
    appeal_id         TEXT,
    case_id           TEXT,
    created_at        TEXT NOT NULL,
    paid_at           TEXT,
    emailed_at        TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS orders_client_idx ON orders (client_id)`,
  /* CRM-side overrides for the pack's rules (Part 6) and paragraph
     library (Part 8). The pack's own text/predicates in rules/ and
     paragraphs/ remain the source of truth for anything NOT overridden
     here — these tables only carry what an admin has actually changed,
     so a fresh deploy with no edits behaves identically to before. */
  `CREATE TABLE IF NOT EXISTS appeal_rules (
    id           TEXT PRIMARY KEY,
    route        TEXT,
    paragraph_ids JSONB NOT NULL DEFAULT '[]',
    description  TEXT NOT NULL,
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at   TEXT,
    updated_by   TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS appeal_paragraphs (
    id          TEXT PRIMARY KEY,
    title       TEXT NOT NULL,
    trigger_desc TEXT NOT NULL,
    category    TEXT NOT NULL,
    priority    INTEGER NOT NULL,
    text        TEXT NOT NULL,
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at  TEXT,
    updated_by  TEXT
  )`,
  /* Phase 1 — durable private-parking case foundation (additive). */
  `CREATE TABLE IF NOT EXISTS appeal_cases (
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
  )`,
  `CREATE INDEX IF NOT EXISTS appeal_cases_customer_idx ON appeal_cases (customer_id)`,
  `CREATE INDEX IF NOT EXISTS appeal_cases_public_id_idx ON appeal_cases (public_id)`,
  `CREATE TABLE IF NOT EXISTS case_facts (
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
  )`,
  `CREATE INDEX IF NOT EXISTS case_facts_case_idx ON case_facts (case_id)`,
  `CREATE TABLE IF NOT EXISTS case_answers (
    id           TEXT PRIMARY KEY,
    case_id      TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    question_id  TEXT NOT NULL,
    answer_json  JSONB NOT NULL,
    created_at   TEXT NOT NULL,
    UNIQUE (case_id, question_id)
  )`,
  `CREATE TABLE IF NOT EXISTS case_documents_meta (
    id            TEXT PRIMARY KEY,
    case_id       TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL,
    storage_key   TEXT NOT NULL,
    file_name     TEXT NOT NULL,
    mime_type     TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    uploaded_at   TEXT NOT NULL,
    uploaded_by   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS case_documents_meta_case_idx ON case_documents_meta (case_id)`,
  `CREATE TABLE IF NOT EXISTS case_events (
    id           TEXT PRIMARY KEY,
    case_id      TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    event_type   TEXT NOT NULL,
    payload      JSONB,
    actor_id     TEXT,
    created_at   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events (case_id)`,
  `CREATE TABLE IF NOT EXISTS generation_jobs (
    id           TEXT PRIMARY KEY,
    case_id      TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'QUEUED',
    error        TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS generation_jobs_case_idx ON generation_jobs (case_id)`,
  /* Phase 4 — controlled knowledge base + legal source register. */
  ...KB_STATEMENTS,
  /* P0-a — server-side case state. Must run after the base tables. */
  ...CASE_V2_STATEMENTS,
  /* P0-c — case payment state. Depends on appeal_cases. */
  ...PAYMENT_STATEMENTS,
  /* P0-d — persisted appeal drafts. Depends on appeal_cases. */
  ...DRAFT_STATEMENTS,
  /* Rate limiting. Standalone. */
  ...RATE_LIMIT_STATEMENTS,
  /* AI-dynamic question journey. Depends on appeal_cases. */
  ...QUESTION_STATEMENTS,
  /* Case outcome + multi-stage linkage. Extends appeal_cases. */
  ...OUTCOME_STATEMENTS,
  /* AI usage and cost. Depends on appeal_cases. */
  ...USAGE_STATEMENTS,
  /* Admin-driven config + first-class case_appeals + email outbox. */
  ...ADMIN_CONFIG_STATEMENTS,
  ...PASSWORD_RESET_STATEMENTS,
];

let ensured: Promise<void> | null = null;

/**
 * The most recently added table. Because STATEMENTS run in order, its
 * presence means every earlier statement has already been applied.
 *
 * Update this whenever a new table is appended.
 */
const SENTINEL_TABLE = "case_appeals";

/**
 * A column added after SENTINEL_TABLE was created.
 *
 * The sentinel alone is not enough once later statements only ALTER
 * existing tables: an older database would have `case_questions` and
 * skip the new columns entirely. Checking a late column as well closes
 * that gap.
 */
const SENTINEL_COLUMN = {
  table: "appeal_cases",
  column: "awaiting_admin_approval",
};

/**
 * Additive migrations, applied by version rather than by probe.
 *
 * The sentinel above short-circuits the expensive CREATE TABLE block,
 * which is what we want — but it also meant every column added later
 * was invisible to an existing database. `ensureSchema()` returned
 * before the ALTERs ran, and `scripts/migrate.mts` calls this same
 * function, so there was no way to apply them at all: the document
 * understanding and Case Intelligence columns never reached production.
 *
 * Everything listed here is idempotent (`ADD COLUMN IF NOT EXISTS`,
 * `CREATE ... IF NOT EXISTS`) and runs once per version bump, on new
 * and existing databases alike. Bump SCHEMA_VERSION when you append.
 */
const SCHEMA_VERSION = 2;

const ADDITIVE_STATEMENTS: string[] = [
  ...CASE_V2_STATEMENTS,
  ...PASSWORD_RESET_STATEMENTS,
];

const SCHEMA_META_DDL = `CREATE TABLE IF NOT EXISTS schema_meta (
    id         INTEGER PRIMARY KEY,
    version    INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`;

function rowsOf(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const r = (result as { rows?: Array<Record<string, unknown>> }).rows;
  return r ?? [];
}

/**
 * Create the schema, once.
 *
 * Every statement is idempotent, but over Neon's HTTP driver each is a
 * separate round trip — so replaying ~90 of them cost 20+ seconds and
 * landed on whichever request arrived first. In development that was
 * every request, because a module reload clears the in-process cache.
 *
 * A single sentinel lookup now short-circuits the common case, so the
 * full DDL only runs against a genuinely new database.
 */
export async function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    const sql = getSql();

    await sql.query(SCHEMA_META_DDL);

    const probe = await sql.query(
      `SELECT to_regclass($1) IS NOT NULL
              AND EXISTS (
                SELECT 1 FROM information_schema.columns
                 WHERE table_name = $2 AND column_name = $3
              ) AS base_present,
              COALESCE(
                (SELECT version FROM schema_meta WHERE id = 1), 0
              ) AS version`,
      [`public.${SENTINEL_TABLE}`, SENTINEL_COLUMN.table, SENTINEL_COLUMN.column],
    );
    const row = rowsOf(probe)[0] ?? {};
    const basePresent = row.base_present === true;
    const applied = Number(row.version ?? 0);

    if (!basePresent) {
      // Genuinely new database: the full DDL, in order.
      for (const stmt of STATEMENTS) {
        await sql.query(stmt);
      }
    } else if (applied < SCHEMA_VERSION) {
      /*
       * Existing database on an older schema. Additive statements only —
       * this is the path that was missing, and the reason production was
       * running without the Case Intelligence columns.
       */
      for (const stmt of ADDITIVE_STATEMENTS) {
        await sql.query(stmt);
      }
    } else {
      return;
    }

    await sql.query(
      `INSERT INTO schema_meta (id, version, updated_at)
            VALUES (1, $1, $2)
       ON CONFLICT (id) DO UPDATE
              SET version = EXCLUDED.version,
                  updated_at = EXCLUDED.updated_at`,
      [SCHEMA_VERSION, new Date().toISOString()],
    );
  })();
  try {
    await ensured;
  } catch (err) {
    ensured = null; // allow retry on next call
    throw err;
  }
}
