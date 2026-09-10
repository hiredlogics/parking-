/**
 * Case outcome and lifecycle (additive, idempotent).
 * Mirrors lib/db/outcomeSchema.ts.
 */

ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_status TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_recorded_at TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_source TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_detail TEXT;

ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS submitted_at TEXT;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS follow_up_due_at TEXT;

ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS stage_number INTEGER NOT NULL DEFAULT 1;
ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS parent_case_id TEXT;

CREATE INDEX IF NOT EXISTS appeal_cases_outcome_idx ON appeal_cases (outcome_status);
CREATE INDEX IF NOT EXISTS appeal_cases_parent_idx ON appeal_cases (parent_case_id);
CREATE INDEX IF NOT EXISTS appeal_cases_follow_up_idx ON appeal_cases (follow_up_due_at);
CREATE INDEX IF NOT EXISTS appeal_cases_submitted_idx ON appeal_cases (submitted_at);
