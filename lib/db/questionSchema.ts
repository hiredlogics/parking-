/**
 * AI-dynamic questions (additive).
 *
 * Every question put to a customer is recorded with the fact it
 * targeted, the route it served, why it was asked and what produced it.
 * That is what makes a dynamically generated journey auditable: the
 * wording varies per case, but the reason for each question is always
 * traceable to the controlled requirement map.
 *
 * Chain-of-thought is never stored. Only the structured decision.
 */
export const QUESTION_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS case_questions (
    id                TEXT PRIMARY KEY,
    case_id           TEXT NOT NULL REFERENCES appeal_cases(id) ON DELETE CASCADE,
    /* Order within the journey, 1-based. */
    seq               INTEGER NOT NULL,

    /* What the question is for — all from the controlled map. */
    target_fact       TEXT NOT NULL,
    reason_code       TEXT NOT NULL,
    route             TEXT NOT NULL,

    /* The question as served. */
    question_json     JSONB NOT NULL,
    label             TEXT NOT NULL,

    /* AI | AI_REGENERATED | BANK_FALLBACK */
    origin            TEXT NOT NULL,
    provider_id       TEXT,
    model             TEXT,
    prompt_version    TEXT,
    /* Validation failures that forced a retry or fallback. */
    rejections        JSONB NOT NULL DEFAULT '[]',
    validation_passed BOOLEAN NOT NULL DEFAULT TRUE,

    answer_json       JSONB,
    asked_at          TEXT NOT NULL,
    answered_at       TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS case_questions_case_idx ON case_questions (case_id)`,
  /* A fact is asked at most once per case — the loop guard. */
  `CREATE UNIQUE INDEX IF NOT EXISTS case_questions_fact_idx
     ON case_questions (case_id, target_fact)`,
  /* At most one unanswered question per case. */
  `CREATE UNIQUE INDEX IF NOT EXISTS case_questions_pending_idx
     ON case_questions (case_id)
     WHERE answered_at IS NULL`,
];
