import type { RouteFamily } from "@/types/caseState";
import type { KbModule } from "@/lib/kb/types";
import type { KnownFacts } from "@/lib/facts/types";
import { ASSERTABLE_PROVENANCE } from "@/lib/facts/types";
import { BASE_RANK } from "@/lib/analysis/routes";
import {
  JUDGE_OVERRIDABLE_CODES,
  type RetrievalTraceEntry,
} from "@/lib/retrieval/engine";
import {
  JUDGE_VERSION,
  MAX_SELECTED_MODULES,
  type JudgeDecision,
  type JudgeDrop,
  type JudgeGround,
  type JudgeVerdict,
} from "./types";

/**
 * Enforcement. Pure, deterministic, and the reason the judge is safe to
 * ship.
 *
 * A model verdict is a PROPOSAL. Nothing in it is trusted on its own
 * account. This module decides what is actually argued, and it is the
 * only thing that does:
 *
 *   1. `applies: false` grounds are dropped.
 *   2. A module the judge names that retrieval never considered is
 *      dropped — a hallucinated module id cannot enter by being
 *      confidently asserted.
 *   3. A module retrieval rejected for a HARD reason stays rejected.
 *      Status, effective dates, source binding, prohibited claims and
 *      essential evidence are legal governance or the fabrication
 *      guard; no confidence score reopens them.
 *   4. Every grounding fact key must exist with assertable provenance.
 *      This is what makes "the judge cannot ground a claim in a fact
 *      nobody established" enforceable rather than merely instructed.
 *   5. Ordering is deterministic: confidence, then BASE_RANK, then
 *      module id. Ties never depend on the order a model happened to
 *      emit, so the PDF's route labels are reproducible.
 *   6. The ceiling applies last, and every drop is recorded.
 *
 * Note the asymmetry in step 4, which is the point of the whole design:
 * a ground may be dropped for being ungrounded, but it can never be
 * ADMITTED by the judge asserting a fact. Grounding keys are references
 * into a fact set the judge did not write.
 */

export interface SelectInput {
  verdict: JudgeVerdict;
  facts: KnownFacts;
  /** Modules retrieval ruled eligible. */
  eligible: KbModule[];
  /** Every module retrieval saw, eligible or not. */
  allModules: KbModule[];
  trace: RetrievalTraceEntry[];
}

/** A grounding key counts only if it is established AND assertable. */
function groundingFailure(
  key: string,
  facts: KnownFacts,
): string | null {
  if (!facts.known.has(key)) {
    // Tags are facts for this purpose: a circumstance tag is how several
    // grounds are established, and it carries the provenance of whatever
    // set it.
    if (facts.tags.has(key) || facts.evidence.has(key)) return null;
    return `fact "${key}" is not established on this case`;
  }
  const p = facts.provenance[key];
  if (!p) return `fact "${key}" has no recorded provenance`;
  if (!ASSERTABLE_PROVENANCE.has(p)) {
    return `fact "${key}" is ${p}, which may not ground a claim`;
  }
  return null;
}

export function enforceJudgeVerdict(input: SelectInput): JudgeDecision {
  const { verdict, facts } = input;
  const drops: JudgeDrop[] = [];
  const overrides: string[] = [];

  const eligibleIds = new Set(input.eligible.map((m) => m.moduleId));
  const moduleById = new Map(input.allModules.map((m) => [m.moduleId, m]));
  const codeById = new Map(input.trace.map((t) => [t.moduleId, t.code]));
  const overridable = new Set<string>(JUDGE_OVERRIDABLE_CODES);

  const admitted: JudgeGround[] = [];

  for (const g of verdict.grounds) {
    if (!g.applies) {
      drops.push({
        moduleId: g.moduleId,
        reason: "NOT_APPLICABLE",
        detail: "Judge assessed the ground as not applying.",
      });
      continue;
    }

    if (!moduleById.has(g.moduleId)) {
      drops.push({
        moduleId: g.moduleId,
        reason: "UNKNOWN_MODULE",
        detail:
          "No such knowledge module. A module id that is not in the catalog cannot be argued.",
      });
      continue;
    }

    if (!eligibleIds.has(g.moduleId)) {
      const code = codeById.get(g.moduleId);
      if (!code || !overridable.has(code)) {
        drops.push({
          moduleId: g.moduleId,
          reason: "HARD_REJECTION",
          detail: `Retrieval refused this module (${code ?? "UNTRACED"}) for a reason a judge may not overturn.`,
        });
        continue;
      }
      overrides.push(g.moduleId);
    }

    const failures = g.groundingFactKeys
      .map((k) => groundingFailure(k, facts))
      .filter((f): f is string => f !== null);
    if (failures.length > 0) {
      drops.push({
        moduleId: g.moduleId,
        reason: "UNGROUNDED",
        detail: failures.join("; "),
      });
      continue;
    }

    admitted.push(g);
  }

  /*
   * A ground with no grounding keys at all is not rejected here — some
   * modules rest on the notice route alone, which the analysis layer
   * establishes rather than the judge. It is ranked last within its
   * confidence band by the BASE_RANK tie-break, which is the right
   * amount of scepticism: usable, never leading on nothing.
   */
  admitted.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const ra = rankOf(moduleById.get(a.moduleId));
    const rb = rankOf(moduleById.get(b.moduleId));
    return ra - rb || a.moduleId.localeCompare(b.moduleId);
  });

  const selected = admitted.slice(0, MAX_SELECTED_MODULES);
  for (const g of admitted.slice(MAX_SELECTED_MODULES)) {
    drops.push({
      moduleId: g.moduleId,
      reason: "CEILING",
      detail: `Beyond the ${MAX_SELECTED_MODULES}-ground ceiling (KB-GOV-07: a weak secondary ground must not dilute a strong primary ground).`,
    });
  }

  /*
   * Routes derive FROM the selection, in selection order.
   *
   * `selected` is already sorted by confidence and then BASE_RANK, so
   * the primary route is the highest-confidence ground's family with
   * ties broken deterministically — the PDF's labels never depend on the
   * order the model happened to emit grounds in.
   *
   * These are NOT re-sorted by BASE_RANK afterwards. Doing that would
   * throw the judge's confidence away and put the strongest-by-rank
   * route first even where the judge was confident about a different
   * one, which would defeat the point of having a judge at all.
   */
  const routes: RouteFamily[] = [];
  for (const g of selected) {
    const m = moduleById.get(g.moduleId);
    if (!m) continue;
    const rf = m.routeFamily;
    if (rf === "GOVERNANCE") continue;
    if (!routes.includes(rf)) routes.push(rf);
  }

  const failure =
    selected.length === 0
      ? admitted.length === 0 && drops.some((d) => d.reason === "CEILING")
        ? "JUDGE_CEILING_REJECTED_ALL"
        : "JUDGE_SELECTED_NONE"
      : null;

  return {
    selected,
    moduleIds: selected.map((g) => g.moduleId),
    primaryRoute: routes[0] ?? null,
    secondaryRoutes: routes.slice(1),
    drops,
    overrides,
    caseUnderstanding: verdict.caseUnderstanding,
    providerId: verdict.providerId,
    model: verdict.model,
    failure,
    judgeVersion: JUDGE_VERSION,
  };
}

function rankOf(m: KbModule | undefined): number {
  if (!m || m.routeFamily === "GOVERNANCE") return 999;
  return BASE_RANK[m.routeFamily] ?? 999;
}

/**
 * Build a decision for a failure that happened before any verdict
 * existed — transport error, unparseable output. Recorded the same way a
 * real decision is, so "the judge did not run" is never silent.
 */
export function judgeFailureDecision(input: {
  failure: JudgeDecision["failure"];
  providerId: string;
  model?: string | null;
  detail: string;
}): JudgeDecision {
  return {
    selected: [],
    moduleIds: [],
    primaryRoute: null,
    secondaryRoutes: [],
    drops: [],
    overrides: [],
    caseUnderstanding: input.detail,
    providerId: input.providerId,
    model: input.model ?? null,
    failure: input.failure,
    judgeVersion: JUDGE_VERSION,
  };
}
