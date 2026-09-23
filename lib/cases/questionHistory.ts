import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

/**
 * The question journey, read-only, for cases that have one.
 *
 * This is what remains of `questionRepo.ts` after the question engine
 * was removed, and it is deliberately only a reader.
 *
 * `case_questions` and `case_answers` are NOT dropped: they are the
 * audit trail for appeals that have already been sent, and some of those
 * are live disputes where the record of what the customer was asked, and
 * answered, is evidence. Dropping the tables would destroy it. Nothing
 * writes to them any more — the pipeline derives its facts from the
 * notice and the uploaded evidence — so for any case created from now on
 * this returns an empty list, which is the correct answer.
 *
 * The question shape is typed as opaque JSON rather than reconstructed.
 * The `Question` type died with the engine, and pinning this reader to a
 * type that no longer has a producer would be inventing a contract; the
 * admin view renders the label and the answer, which is what an operator
 * handling a dispute actually needs.
 */

type Row = Record<string, unknown>;

export interface ArchivedQuestion {
  seq: number;
  targetFact: string;
  reasonCode: string;
  route: string;
  label: string;
  /** Where the question came from: the generator, the bank, a fallback. */
  origin: string;
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

function toArchived(r: Row): ArchivedQuestion {
  return {
    seq: Number(r.seq ?? 0),
    targetFact: r.target_fact as string,
    reasonCode: (r.reason_code as string) ?? "",
    route: (r.route as string) ?? "",
    label: (r.label as string) ?? "",
    origin: (r.origin as string) ?? "",
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

/** Every question ever put to this case, oldest first. */
export async function listArchivedQuestions(
  caseId: string,
): Promise<ArchivedQuestion[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(
    `SELECT seq, target_fact, reason_code, route, label, origin, provider_id,
            model, prompt_version, rejections, validation_passed, answer_json,
            asked_at, answered_at
       FROM case_questions WHERE case_id = $1 ORDER BY seq`,
    [caseId],
  )) as unknown as { rows?: Row[] } | Row[];
  const rows = Array.isArray(res) ? res : (res.rows ?? []);
  return rows.map(toArchived);
}
