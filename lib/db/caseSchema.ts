/**
 * P0-a — server-side case state (additive).
 *
 * Extends the Phase 1 `appeal_cases` / `case_documents_meta` tables so
 * PostgreSQL becomes the authoritative source of truth for a customer's
 * appeal. Nothing is dropped or renamed, so existing rows and the V1
 * order flow keep working unchanged.
 *
 * ALTER ... ADD COLUMN IF NOT EXISTS is idempotent, so this runs safely
 * on every boot alongside ensureSchema().
 */
export const CASE_V2_STATEMENTS: string[] = [
  /* ---------- appeal_cases: service type + pipeline state ---------- */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'PRIVATE_PARKING_INITIAL_APPEAL'`,
  /* Raw extraction exactly as the provider returned it (auditable). */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS extraction_json JSONB`,
  /* Customer-confirmed PCN. Only this may feed the rules/AI pipeline. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS confirmed_json JSONB`,
  /* Fact-keyed adaptive answers (the V2 shape). */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS adaptive_answers JSONB NOT NULL DEFAULT '{}'`,
  /* Questions already put to the customer, so none is ever repeated. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS asked_question_ids JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS candidate_routes JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS primary_route TEXT`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS secondary_routes JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS missing_facts JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS code_version_id TEXT`,
  /* INCOMPLETE until the readiness check passes (P0-b owns the check). */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS sufficiency_status TEXT NOT NULL DEFAULT 'INCOMPLETE'`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS readiness_checked_at TEXT`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS questioning_complete BOOLEAN NOT NULL DEFAULT FALSE`,
  /* Set when the case is routed out of the automated flow. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS out_of_scope_reason TEXT`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS out_of_scope_detail TEXT`,

  /* ---------- Durable document understanding (triage spine) ---------- */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS document_type TEXT`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS sender_name TEXT`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS parking_operator_name TEXT`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS service_decision TEXT`,
  /* Durable Case Intelligence — pre-question technical analysis snapshot. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS case_intelligence_json JSONB`,
  /* case_stage already exists; triage writes detected stage; confirm must not overwrite. */

  /* ---------- case_documents_meta: evidence classification ---------- */
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS evidence_type TEXT`,
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS description TEXT`,
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS sha256 TEXT`,
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'memory'`,
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS deleted_at TEXT`,
  /* Ties a GENERATED file to the draft version that passed validation. */
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS source_draft_id TEXT`,
  /*
   * What reading this document established (services/evidence/).
   *
   * Stored on the document rather than merged into adaptive_answers,
   * because a fact a document evidences is not a customer answer and
   * must stay distinguishable from one — it is what makes the
   * "document" provenance VAL-FACT relies on structurally true rather
   * than a label applied after the fact.
   */
  `ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS derived_facts_json JSONB`,
  `CREATE INDEX IF NOT EXISTS case_documents_meta_type_idx ON case_documents_meta (case_id, document_type)`,
  `CREATE INDEX IF NOT EXISTS case_documents_meta_draft_idx ON case_documents_meta (source_draft_id)`,

  /* ---------- orders: bind an order to a case ---------- */
  `ALTER TABLE orders ADD COLUMN IF NOT EXISTS appeal_case_id TEXT`,
  `CREATE INDEX IF NOT EXISTS orders_appeal_case_idx ON orders (appeal_case_id)`,

  `CREATE INDEX IF NOT EXISTS appeal_cases_status_idx ON appeal_cases (status)`,
];
