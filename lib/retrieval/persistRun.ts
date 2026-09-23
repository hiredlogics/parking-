import { randomUUID } from "crypto";
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type { JudgeDecision } from "@/lib/judge/types";
import type { RetrievalResult } from "./engine";

/**
 * Write the retrieval + judge decision to `retrieval_runs`.
 *
 * The table has existed since the KB schema was first written and
 * nothing has ever inserted into it, while `RetrievalResult.trace` was
 * computed on every case and then discarded. So the single question you
 * most want to answer about a released letter — "why did it argue
 * these grounds?" — had no stored answer.
 *
 * What is recorded, and why each part:
 *
 *   trace          every module considered, kept or dropped, with the
 *                  code that decided it. Reconstructs the eligible set
 *                  without re-running the gates.
 *   judge          the verdict AS ENFORCED, plus every drop with its
 *                  reason, the pinned model id and the provider id.
 *                  A ceiling drop is as important as a selection: it is
 *                  the record of a ground we chose not to argue.
 *   overrides      modules admitted despite a mechanical refusal. This
 *                  is the list to read when deciding whether the gates
 *                  are too narrow.
 *   comparison     the deterministic result alongside the judge's, so
 *                  drift is measurable from stored data rather than by
 *                  re-running old cases against new code.
 *
 * Fire-and-forget. An audit write must never fail a customer's appeal,
 * so every error is swallowed after being logged — but note that the
 * JUDGE_DECISION_RECORDED checklist item is what stops a case being
 * RELEASED with no record, so a silent failure here is still caught
 * before anything reaches a customer.
 */
export async function persistRetrievalRun(input: {
  caseId: string | null;
  retrieval: RetrievalResult;
  judge: JudgeDecision | null;
  mode: string;
  /** Deterministic module ids, for the shadow-mode comparison. */
  deterministicModuleIds: string[];
}): Promise<string | null> {
  const id = randomUUID();
  const now = new Date().toISOString();

  const judgeModuleIds = input.judge?.moduleIds ?? [];
  const output = {
    mode: input.mode,
    retrievalVersion: input.retrieval.retrievalVersion,
    trace: input.retrieval.trace,
    deterministic: {
      moduleIds: input.deterministicModuleIds,
      primaryRoute: input.retrieval.output.primaryRoute,
      secondaryRoutes: input.retrieval.output.secondaryRoutes,
    },
    judge: input.judge
      ? {
          judgeVersion: input.judge.judgeVersion,
          providerId: input.judge.providerId,
          model: input.judge.model,
          failure: input.judge.failure,
          caseUnderstanding: input.judge.caseUnderstanding,
          moduleIds: input.judge.moduleIds,
          primaryRoute: input.judge.primaryRoute,
          secondaryRoutes: input.judge.secondaryRoutes,
          overrides: input.judge.overrides,
          selected: input.judge.selected,
          drops: input.judge.drops,
        }
      : null,
    comparison: input.judge
      ? {
          agreed: sameSet(input.deterministicModuleIds, judgeModuleIds),
          onlyDeterministic: input.deterministicModuleIds.filter(
            (m) => !judgeModuleIds.includes(m),
          ),
          onlyJudge: judgeModuleIds.filter(
            (m) => !input.deterministicModuleIds.includes(m),
          ),
          routeAgreed:
            input.retrieval.output.primaryRoute === input.judge.primaryRoute,
        }
      : null,
  };

  try {
    await ensureSchema();
    const sql = getSql();
    await sql.query(
      `INSERT INTO retrieval_runs
         (id, case_id, primary_route, output_json, prompt_version, created_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
      [
        id,
        input.caseId,
        input.judge?.primaryRoute ?? input.retrieval.output.primaryRoute,
        JSON.stringify(output),
        input.judge?.judgeVersion ?? input.retrieval.retrievalVersion,
        now,
      ],
    );
    return id;
  } catch (err) {
    console.error(
      "[retrieval] failed to persist run:",
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}
