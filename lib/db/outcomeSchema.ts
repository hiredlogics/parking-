/**
 * Case outcome and lifecycle (additive).
 *
 * Separates three things that were previously conflated or absent:
 *
 *   status        (existing) — where the case is in the WORKFLOW
 *   outcome_status  (new)    — what the OPERATOR decided
 *   submitted_at    (new)    — when the initial appeal was completed
 *
 * These are independent by design. A case can be workflow-complete
 * while the outcome is still unknown, which is the normal state for the
 * ~30 days after an appeal is submitted:
 *
 *   status = UNLOCKED  (workflow done)
 *   outcome_status = PENDING  (operator has not replied)
 *
 * `parent_case_id` and `stage_number` exist so a future second-stage
 * appeal can reference the original case rather than copying the
 * customer's notice, facts, answers and evidence. Nothing implements
 * that workflow yet.
 *
 * NOTE: the pre-existing `case_stage` column is deliberately untouched.
 * It belongs to the extraction contract and the V1 rules variables, and
 * is fixed to INITIAL_OPERATOR_APPEAL there.
 */
export const OUTCOME_STATEMENTS: string[] = [
  /* ---------- What the operator decided ---------- */
  /* PENDING | NO_RESPONSE | ACCEPTED | REJECTED */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_status TEXT NOT NULL DEFAULT 'PENDING'`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_recorded_at TEXT`,
  /* Who told us — CUSTOMER now, DOCUMENT once rejection upload exists. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_source TEXT`,
  /* Free-text note, e.g. a summarised rejection reason. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS outcome_detail TEXT`,

  /* ---------- Initial appeal completion ---------- */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS submitted_at TEXT`,
  /* When it becomes reasonable to ask "have you heard back?". */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS follow_up_due_at TEXT`,

  /* ---------- Multi-stage linkage ---------- */
  /* 1 = initial operator appeal, 2 = second stage (POPLA/IAS), etc. */
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS stage_number INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE appeal_cases ADD COLUMN IF NOT EXISTS parent_case_id TEXT`,

  /* Reporting indexes: outcome by operator / route / stage. */
  `CREATE INDEX IF NOT EXISTS appeal_cases_outcome_idx ON appeal_cases (outcome_status)`,
  `CREATE INDEX IF NOT EXISTS appeal_cases_parent_idx ON appeal_cases (parent_case_id)`,
  `CREATE INDEX IF NOT EXISTS appeal_cases_follow_up_idx ON appeal_cases (follow_up_due_at)`,
  `CREATE INDEX IF NOT EXISTS appeal_cases_submitted_idx ON appeal_cases (submitted_at)`,
];
