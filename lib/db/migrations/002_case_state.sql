/**
 * P0-a — server-side case state (additive, idempotent).
 * Mirrors lib/db/caseSchema.ts for deployments that run file migrations.
 */

ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'PRIVATE_PARKING_INITIAL_APPEAL';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS extraction_json JSONB;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS confirmed_json JSONB;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS adaptive_answers JSONB NOT NULL DEFAULT '{}';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS asked_question_ids JSONB NOT NULL DEFAULT '[]';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS candidate_routes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS primary_route TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS secondary_routes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS missing_facts JSONB NOT NULL DEFAULT '[]';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS code_version_id TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS sufficiency_status TEXT NOT NULL DEFAULT 'INCOMPLETE';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS readiness_checked_at TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS questioning_complete BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS out_of_scope_reason TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS out_of_scope_detail TEXT;

ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS evidence_type TEXT;
ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS sha256 TEXT;
ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS storage_provider TEXT NOT NULL DEFAULT 'memory';
ALTER TABLE case_documents_meta ADD COLUMN IF NOT EXISTS deleted_at TEXT;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS appeal_case_id TEXT;

CREATE INDEX IF NOT EXISTS orders_appeal_case_idx ON orders (appeal_case_id);
CREATE INDEX IF NOT EXISTS appeal_cases_status_idx ON appeal_cases (status);
