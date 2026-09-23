import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type { Question } from "@/lib/questions/types";
import type {
  QuestionOrigin,
  QuestionProvenance,
} from "@/lib/questions/generated";
import type { ReasonCode, RequirementScope } from "@/lib/facts/requirements";

/**
 * Persisted question journey.
 *
 * The pending row is authoritative: an answer is only accepted for the
 * question the server actually asked, so the browser cannot introduce a
 * fact that was never put to the customer.
 */

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export interface CaseQuestionRow {
  id: string;
  caseId: string;
  seq: number;
  targetFact: string;
  reasonCode: ReasonCode;
  route: RequirementScope;
  question: Question;
  label: string;
  origin: QuestionOrigin;
  providerId: string | null;
  model: string | null;
  promptVersion: string | null;
  rejections: string[];
  validationPassed: boolean;
  answer: unknown;
  askedAt: string;
  answeredAt: string | null;
}

function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function toRow(r: Row): CaseQuestionRow {
  return {
    id: r.id as string,
    caseId: r.case_id as string,
    seq: Number(r.seq ?? 0),
    targetFact: r.target_fact as string,
    reasonCode: r.reason_code as ReasonCode,
    route: r.route as RequirementScope,
    question: json<Question>(r.question_json, {} as Question),
    label: r.label as string,
    origin: r.origin as QuestionOrigin,
    providerId: (r.provider_id as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    promptVersion: (r.prompt_version as string | null) ?? null,
    rejections: json<string[]>(r.rejections, []),
    validationPassed: r.validation_passed !== false,
    answer: json<unknown>(r.answer_json, null),
    askedAt: r.asked_at as string,
    answeredAt: (r.answered_at as string | null) ?? null,
  };
}

/** The question awaiting an answer, if any. */
export async function findPendingQuestion(
  caseId: string,
): Promise<CaseQuestionRow | null> {
  const rows = await q(
    `SELECT * FROM case_questions
      WHERE case_id = $1 AND answered_at IS NULL
      ORDER BY seq DESC LIMIT 1`,
    [caseId],
  );
  return rows[0] ? toRow(rows[0]) : null;
}

export async function listCaseQuestions(
  caseId: string,
): Promise<CaseQuestionRow[]> {
  const rows = await q(
    `SELECT * FROM case_questions WHERE case_id = $1 ORDER BY seq`,
    [caseId],
  );
  return rows.map(toRow);
}

/** Facts already put to the customer, answered or not. */
export async function askedFactsForCase(caseId: string): Promise<string[]> {
  const rows = await q(
    `SELECT target_fact FROM case_questions WHERE case_id = $1`,
    [caseId],
  );
  return rows.map((r) => r.target_fact as string);
}

/**
 * Record a question as asked.
 *
 * Conflicts on (case_id, target_fact) are swallowed — that unique index
 * is the loop guard, and hitting it means the fact was already asked.
 */
export async function recordAskedQuestion(input: {
  caseId: string;
  targetFact: string;
  reasonCode: ReasonCode;
  route: RequirementScope;
  question: Question;
  provenance: QuestionProvenance;
}): Promise<CaseQuestionRow | null> {
  const rows = await q(
    `SELECT COALESCE(MAX(seq), 0) AS max_seq FROM case_questions WHERE case_id = $1`,
    [input.caseId],
  );
  const seq = Number(rows[0]?.max_seq ?? 0) + 1;
  const id = `q_${input.caseId.slice(-8)}_${seq}_${Math.random().toString(36).slice(2, 8)}`;

  const inserted = await q(
    `INSERT INTO case_questions
       (id, case_id, seq, target_fact, reason_code, route, question_json,
        label, origin, provider_id, model, prompt_version, rejections,
        validation_passed, asked_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,TRUE,$14)
     ON CONFLICT DO NOTHING
     RETURNING *`,
    [
      id,
      input.caseId,
      seq,
      input.targetFact,
      input.reasonCode,
      input.route,
      JSON.stringify(input.question),
      input.question.label,
      input.provenance.origin,
      input.provenance.providerId,
      input.provenance.model,
      input.provenance.promptVersion,
      JSON.stringify(input.provenance.rejections),
      new Date().toISOString(),
    ],
  );
  return inserted[0] ? toRow(inserted[0]) : null;
}

export async function recordAnswer(
  questionId: string,
  answer: unknown,
): Promise<void> {
  await q(
    `UPDATE case_questions
        SET answer_json = $2, answered_at = $3
      WHERE id = $1 AND answered_at IS NULL`,
    [questionId, JSON.stringify(answer ?? null), new Date().toISOString()],
  );
}

/**
 * Discard the pending question without answering it.
 *
 * Used when re-analysis shows the fact is no longer material — a case
 * must never be held up by a question that stopped mattering.
 */
export async function discardPendingQuestion(caseId: string): Promise<void> {
  await q(
    `DELETE FROM case_questions WHERE case_id = $1 AND answered_at IS NULL`,
    [caseId],
  );
}
