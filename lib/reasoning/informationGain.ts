import type { RouteFamily } from "@/types/caseState";
import type { KnownFacts } from "@/lib/facts/types";
import {
  ROUTE_REQUIREMENTS,
  type FactRequirement,
} from "@/lib/facts/requirements";
import { isRequirementActive } from "@/lib/facts/missing";
import { factsImpliedByAllegation, type AllegationCategory } from "./allegation";
import { routeStrength } from "@/lib/analysis/routes";

/** Triage and scope requirements serve no single route. */
function routeStrengthFor(route: FactRequirement["route"]): number {
  if (route === "TRIAGE" || route === "SCOPE") return 0;
  return routeStrength(route);
}

/**
 * Information-gain ranking.
 *
 * Static integer priority is gone as the selector. It could only encode
 * a fixed ordering, which is exactly what made the journey feel like a
 * questionnaire: the same facts were asked in the same order regardless
 * of what the case actually turned on.
 *
 * A fact scores highly when resolving it would change the case:
 *
 *   1. it can establish or eliminate a whole route (route-critical)
 *   2. it could change which route leads (primary-shifting)
 *   3. it is required for a safe legal/applicability check
 *   4. the operator's own allegation turns on it
 *   5. it unblocks other facts gated behind it
 *
 * And scores low when it is optional supporting detail, or when the
 * notice or evidence already answers it.
 *
 * Priority survives only as a stable tie-break, so ordering is
 * deterministic when two facts are genuinely equally useful.
 */

export interface GainScore {
  requirement: FactRequirement;
  score: number;
  /** Human-readable contributions, for audit and debugging. */
  reasons: string[];
}

/** Facts whose answer decides whether a route exists at all. */
const ROUTE_CRITICAL = new Set<string>([
  "payment_made",
  "breakdown_prevented_departure",
  "occupier_status",
  "agreement_uploaded",
  "permission_held",
  "continuous_presence",
  "additional_time_needed",
  "registered_keeper",
  "driver_identified",
  "scenarios",
  "jurisdiction",
  "vehicle_hire_status",
]);

/**
 * Facts required for a legal or applicability check rather than for
 * argument colour. Source Register §3 and §4.
 */
const APPLICABILITY_CRITICAL = new Set<string>([
  "jurisdiction",
  "vehicle_hire_status",
  "registered_keeper",
  "driver_identified",
  "notice_route",
  "parking_event_date",
]);

/** Facts that are useful detail but never decide a route. */
const OPTIONAL_DETAIL = new Set<string>([
  "bay_reference",
  "payment_method",
  "breakdown_nature",
  "time_of_failure",
  "repair_carried_out",
  "visit_count",
  "actual_parking_period",
]);

export interface GainInput {
  facts: KnownFacts;
  candidateRoutes: RouteFamily[];
  missing: FactRequirement[];
  allegationCategory: AllegationCategory;
  /** Facts evidence suggests but which need confirming. */
  needsConfirmation?: string[];
  /** Facts already treated as known from evidence. */
  establishedFromEvidence?: string[];
  /**
   * Why each route is in play, from assessCandidacy.
   *
   * A route the customer's own answer or evidence opened outranks one
   * opened only by the notice's framing: once someone says the vehicle
   * broke down, that beats continuing the operator's overstay theory.
   */
  routeProvenance?: Record<string, string[]>;
}

/** True when something other than the allegation opened this route. */
function customerSupported(
  route: string,
  provenance: Record<string, string[]> | undefined,
): boolean {
  const sources = provenance?.[route];
  if (!sources || sources.length === 0) return false;
  return sources.some((s) => !s.startsWith("notice alleges"));
}

export function scoreInformationGain(input: GainInput): GainScore[] {
  const allegationFacts = new Set(
    factsImpliedByAllegation(input.allegationCategory),
  );
  const needsConfirm = new Set(input.needsConfirmation ?? []);
  const established = new Set(input.establishedFromEvidence ?? []);

  const scored: GainScore[] = input.missing
    // A fact the evidence already establishes is EXCLUDED, not merely
    // scored down. Scoring can be outvoted by other terms, and asking
    // something the customer already proved is the specific failure
    // this layer exists to prevent.
    .filter((req) => !established.has(req.fact))
    .map((req) => {
    const reasons: string[] = [];
    let score = 10; // baseline: it is material, or it would not be here

    if (ROUTE_CRITICAL.has(req.fact)) {
      score += 50;
      reasons.push("can establish or eliminate a route");
    }
    if (APPLICABILITY_CRITICAL.has(req.fact)) {
      score += 40;
      reasons.push("required for a legal applicability check");
    }
    if (allegationFacts.has(req.fact)) {
      score += 25;
      reasons.push("the operator's allegation turns on it");
    }

    /*
     * Weight by the strength of the route the fact serves.
     *
     * Without this, a weak-but-broad route outranks a strong one: an
     * overstay allegation opens ANPR, so a camera question beat the
     * breakdown question even after the customer said the vehicle was
     * immobilised. V2 Part 5 puts breakdown well above ANPR, and Part 7
     * puts residential rights above permit display.
     */
    const strength = routeStrengthFor(req.route);
    if (strength > 0) {
      const weighted = Math.round(strength * 45);
      score += weighted;
      if (weighted >= 30) reasons.push("serves a strong primary route");
    }

    if (customerSupported(req.route, input.routeProvenance)) {
      score += 35;
      reasons.push("serves a route the customer's own account opened");
    }

    // How many other requirements are gated behind this one? Resolving
    // a gate opens further enquiry, so it is worth more.
    const unblocks = countGatedBy(req.fact, input.candidateRoutes, input.facts);
    if (unblocks > 0) {
      score += Math.min(20, unblocks * 8);
      reasons.push(`unblocks ${unblocks} further fact(s)`);
    }

    // A confirmation is cheaper for the customer than an open question,
    // so prefer it slightly when the evidence already points somewhere.
    if (needsConfirm.has(req.fact)) {
      score += 12;
      reasons.push("evidence suggests an answer that needs confirming");
    }

    if (OPTIONAL_DETAIL.has(req.fact)) {
      score -= 25;
      reasons.push("supporting detail rather than decisive");
    }

    // Critical facts must not be starved by scoring.
    if (req.critical) {
      score += 30;
      reasons.push("case cannot proceed without it");
    }

    return { requirement: req, score, reasons };
  });

  return scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Stable tie-break: the old priority, then fact name.
    if (a.requirement.priority !== b.requirement.priority) {
      return a.requirement.priority - b.requirement.priority;
    }
    return a.requirement.fact.localeCompare(b.requirement.fact);
  });
}

/**
 * How many requirements on live routes have a `when` gate that is
 * currently false and mentions this fact.
 *
 * Evaluated by probing: set the fact to a plausible value and see
 * whether previously-inactive requirements wake up. That avoids
 * hand-maintaining a dependency graph which would drift from the gates.
 */
function countGatedBy(
  fact: string,
  routes: RouteFamily[],
  facts: KnownFacts,
): number {
  const candidates = routes.flatMap((r) => ROUTE_REQUIREMENTS[r] ?? []);
  const gated = candidates.filter(
    (r) => r.fact !== fact && r.when && !isRequirementActive(r, facts),
  );
  if (gated.length === 0) return 0;

  let unblocked = 0;
  for (const probeValue of ["YES", true] as const) {
    const probe: KnownFacts = {
      values: { ...facts.values, [fact]: probeValue },
      known: new Set([...facts.known, fact]),
      provenance: { ...facts.provenance, [fact]: "answer" },
      tags: facts.tags,
      evidence: facts.evidence,
    };
    const count = gated.filter((r) => isRequirementActive(r, probe)).length;
    unblocked = Math.max(unblocked, count);
  }
  return unblocked;
}

/** The single highest-gain requirement, or null. */
export function highestGain(input: GainInput): GainScore | null {
  return scoreInformationGain(input)[0] ?? null;
}
