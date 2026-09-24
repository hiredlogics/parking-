/**
 * The pre-drafting ground gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * Drafting used to run whenever retrieval returned anything at all, and
 * retrieval always returns something: KB-POFA-01 opens on nothing more
 * than "registered keeper, driver not named", and both of those come
 * from `fact_defaults` rather than from the case. So a notice the system
 * had understood nothing about still produced a letter — the PoFA
 * boilerplate and the intro and closing blocks, with no argument in it.
 *
 * That is the generic-letter defect. It was not a drafting fault: the
 * model wrote the best letter available from a payload that contained no
 * case-specific ground. The fix belongs here, before the call.
 *
 * WHAT COUNTS AS ENOUGH
 * ---------------------
 * A substantive ground is an active issue other than POFA and
 * TRIAGE_SCOPE. Those two are procedural scaffolding: POFA asks whether
 * the keeper can be pursued at all and TRIAGE_SCOPE whether the case is
 * in scope, and neither says anything about what happened in the car
 * park. A letter built from them alone is the boilerplate we are trying
 * to stop shipping.
 *
 * THE ONE CARVE-OUT, AND WHY
 * --------------------------
 * An ESTABLISHED PoFA defect counts as substantive even with no other
 * issue and no allegation.
 *
 * This matters for a real case. The Smart Parking notice in
 * tests/integration/realNoticeTrace.test.ts states no contravention at
 * all, so the allegation classifies as UNKNOWN and no conduct issue can
 * open — and yet it was served seventeen days after the parking event,
 * which is a proven, dispositive, keeper-liability failure computed from
 * the notice's own dates. Refusing to draft that case would throw away
 * the strongest of the three grounds we have seen, and the payload for
 * it is not generic: the serialiser emits a TIMING FAILURE ESTABLISHED
 * block with the paragraph, the deemed-service date and the deadline
 * (services/ai/drafting/contextSerialiser.ts:111).
 *
 * "Established" is doing real work. `UNRESOLVED` does not qualify — that
 * is the value PoFA takes when the dates are missing, which is exactly
 * the failed-extraction case this gate exists to catch.
 *
 * A SUBSTANTIVE ISSUE IS NOT THE SAME AS A SUPPORTED ONE
 * ------------------------------------------------------
 * An issue can be active and still contribute nothing the letter may
 * say. The Wise Parking notice alleges "No Permit Displayed", which
 * opens AUTHORISATION and PERMIT — and then every KB-AUTH module is
 * rejected by retrieval, two on FACT_GATE and one as PROHIBITED,
 * because the permit was never actually established. Counting the open
 * issue as a ground let that case release a letter whose only retained
 * knowledge was KB-POFA-01: a keeper-liability template that never
 * mentions the permit. Generic, by any reading, and to the customer
 * indistinguishable from the defect this gate was built for.
 *
 * So the gate asks a second question: did retrieval retain any
 * knowledge that is not itself procedural? That is read from each
 * retained module's own `routeFamily`, which is the same vocabulary the
 * route assessment uses.
 *
 * It is deliberately NOT computed by intersecting the retained modules
 * with each issue's configured `moduleIds`. That was tried and was
 * wrong: the admin issue configuration points CONSIDERATION at
 * "KB-CONSID-01" while the knowledge base ships "KB-CON-01" and
 * "KB-CON-02", so the intersection was empty for a case that had two
 * perfectly good consideration modules retained, and the gate refused
 * it. Two independently maintained identifier lists is not a sound
 * thing to gate a customer's appeal on. (The mismatch itself is worth
 * fixing, but it is an admin-configuration defect, not this gate's.)
 *
 * Where `retainedModules` is not supplied the check is skipped rather
 * than guessed at, so a caller without a retrieval result behaves as
 * before.
 */
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { KnownFacts } from "@/lib/facts/types";
import { FACT } from "@/lib/facts/facts";
import {
  classifyAllegation,
  type AllegationCategory,
} from "@/lib/reasoning/allegation";
import { ASSERTABLE_PROVENANCE } from "@/lib/facts/types";

/**
 * Issues that carry no account of the parking event.
 *
 * Code rather than configuration, deliberately. An admin widening this
 * set would silently re-enable the generic letter, and the whole point
 * of the gate is that it cannot be edited away by accident.
 */
export const PROCEDURAL_ISSUES: ReadonlySet<string> = new Set([
  "POFA",
  "TRIAGE_SCOPE",
]);

/**
 * Route families that carry no account of the parking event.
 *
 * POFA is keeper liability and GOVERNANCE is Code/source housekeeping;
 * a letter whose retained knowledge is drawn only from these argues
 * nothing about what happened.
 */
const PROCEDURAL_ROUTES: ReadonlySet<string> = new Set([
  "POFA",
  "GOVERNANCE",
]);

export type GroundRefusal = "NO_SUBSTANTIVE_GROUND";

export interface GroundAssessment {
  /** False means: do not call the drafting model. */
  ok: boolean;
  reason: GroundRefusal | null;
  detail: string | null;
  /** What the operator says went wrong, as classified from the notice. */
  allegation: { category: AllegationCategory; matched: string | null };
  activeIssues: string[];
  /** Active issues that actually describe the parking event. */
  substantiveIssues: string[];
  /** A PoFA defect proven from the notice, not merely unresolved. */
  establishedPofaDefect: boolean;
  /**
   * Facts the letter is allowed to assert — notice, answer, document or
   * computed. System defaults and inferences are excluded, because a
   * letter resting on them is resting on assumptions.
   */
  assertableFactCount: number;
  /** Required facts still outstanding, for the log and the reviewer. */
  missingFacts: string[];
  /**
   * Retained modules that speak to the parking event rather than to
   * keeper liability or governance. Empty alongside a non-empty
   * `substantiveIssues` means every ground the case opened was gated
   * out of the payload.
   */
  supportingModules: string[];
}

export async function assessGroundSufficiency(input: {
  facts: KnownFacts;
  analysis: IssueAnalysis;
  serviceCode?: string;
  evidenceTypes?: string[];
  /**
   * Modules retrieval actually retained, with their route families.
   * Omit to skip the support check — see "A SUBSTANTIVE ISSUE IS NOT
   * THE SAME AS A SUPPORTED ONE".
   */
  retainedModules?: ReadonlyArray<{ moduleId: string; routeFamily: string }>;
  /** Case Intelligence ground codes when available — preferred over issue engine. */
  groundCodes?: string[];
}): Promise<GroundAssessment> {
  /*
   * Prefer CI / analysis routes. Do not re-run allegation-driven
   * evaluateIssues as ground authority.
   */
  const fromAnalysis = [
    ...(input.analysis.primaryRoute ? [input.analysis.primaryRoute] : []),
    ...(input.analysis.secondaryRoutes ?? []),
  ];
  const activeIssues =
    input.groundCodes && input.groundCodes.length > 0
      ? [...input.groundCodes]
      : fromAnalysis;

  if (activeIssues.length === 0) {
    const allegation = classifyAllegation(
      typeof input.facts.values[FACT.ALLEGED_BREACH] === "string"
        ? (input.facts.values[FACT.ALLEGED_BREACH] as string)
        : null,
    );
    return {
      ok: false,
      reason: "NO_SUBSTANTIVE_GROUND",
      detail:
        "Case Intelligence has not identified a supported appeal ground.",
      allegation,
      activeIssues: [],
      substantiveIssues: [],
      establishedPofaDefect: false,
      assertableFactCount: 0,
      missingFacts: input.analysis.missingFacts ?? [],
      supportingModules: [],
    };
  }

  const substantiveIssues = activeIssues.filter(
    (code) => !PROCEDURAL_ISSUES.has(code) && code !== "POFA" && code !== "POFA_TIMING",
  );

  /*
   * Knowledge retrieval kept that actually speaks to the parking event,
   * read from each module's own route family.
   */
  const supportingModules = (input.retainedModules ?? [])
    .filter((m) => !PROCEDURAL_ROUTES.has(m.routeFamily))
    .map((m) => m.moduleId);
  const supportChecked = input.retainedModules !== undefined;
  const hasSubstantiveSupport = supportChecked
    ? supportingModules.length > 0
    : substantiveIssues.length > 0;

  const pofa = input.analysis.pofa;
  const establishedPofaDefect =
    pofa.timingStatus === "FAILED" ||
    (pofa.confirmedContentDefects?.length ?? 0) > 0;

  const allegation = classifyAllegation(
    typeof input.facts.values[FACT.ALLEGED_BREACH] === "string"
      ? (input.facts.values[FACT.ALLEGED_BREACH] as string)
      : null,
  );

  const assertableFactCount = [...input.facts.known].filter(
    (k) =>
      !k.startsWith("__") &&
      ASSERTABLE_PROVENANCE.has(input.facts.provenance[k]),
  ).length;

  const missingFacts = input.analysis.missingFacts ?? [];

  if (!hasSubstantiveSupport && !establishedPofaDefect) {
    return {
      ok: false,
      reason: "NO_SUBSTANTIVE_GROUND",
      detail: describeRefusal(
        allegation.category,
        activeIssues,
        substantiveIssues,
        missingFacts,
      ),
      allegation,
      activeIssues,
      substantiveIssues,
      establishedPofaDefect,
      assertableFactCount,
      missingFacts,
      supportingModules,
    };
  }

  return {
    ok: true,
    reason: null,
    detail: null,
    allegation,
    activeIssues,
    substantiveIssues,
    establishedPofaDefect,
    assertableFactCount,
    missingFacts,
    supportingModules,
  };
}

/**
 * Why this case stopped, in terms a reviewer can act on.
 *
 * An unknown allegation and a known-but-unarguable one need different
 * work — the first is usually a notice that could not be read, the
 * second a gap in the knowledge base — so the message distinguishes
 * them rather than reporting "no ground" for both.
 */
function describeRefusal(
  category: AllegationCategory,
  activeIssues: string[],
  substantiveIssues: string[] = [],
  missingFacts: string[] = [],
): string {
  const scaffolding = activeIssues.join(", ") || "none";
  /*
   * The case opened a real ground and then lost it to a fact gate. That
   * is a different conversation from "no ground" — the customer usually
   * only has to confirm one more thing — so it says which.
   */
  if (substantiveIssues.length > 0) {
    const outstanding = missingFacts.join(", ") || "none recorded";
    return (
      `The case opened ${substantiveIssues.join(", ")}, but no knowledge ` +
      "module for those grounds survived retrieval, so the letter would " +
      "have argued keeper liability alone. Outstanding facts: " +
      `${outstanding}.`
    );
  }
  if (category === "UNKNOWN") {
    return (
      "The notice's alleged contravention could not be identified, so no " +
      "ground beyond keeper liability is in play and no PoFA defect is " +
      `established. Active issues: ${scaffolding}. This usually means the ` +
      "notice was not read correctly — check the alleged breach was captured."
    );
  }
  return (
    `The alleged contravention was identified as ${category}, but it opened ` +
    `no substantive issue and no PoFA defect is established. Active issues: ` +
    `${scaffolding}.`
  );
}
