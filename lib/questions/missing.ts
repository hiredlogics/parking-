import type { RouteFamily } from "@/types/caseState";
import type { KnownFacts } from "./types";
import {
  openRoutes,
  ROUTE_REQUIREMENTS,
  TRIAGE_REQUIREMENTS,
  type FactRequirement,
} from "./requirements";

/**
 * Missing material facts, derived from the routes in play.
 *
 * The old implementation walked the question bank and called a fact
 * missing if some question would have asked it. That made a hard-coded
 * list the authority on case completeness. Here completeness is decided
 * by the requirement map, so a case needs exactly the facts its own
 * routes require — no more, no fewer.
 */

export interface MissingFact {
  fact: string;
  requirement: FactRequirement;
}

/** Marker recorded once a fact has been put to the customer. */
export const askedFactKey = (fact: string) => `__askedfact:${fact}`;

/** Facts already put to the customer, answered or not. */
export function askedFacts(values: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const key of Object.keys(values)) {
    if (key.startsWith("__askedfact:")) out.add(key.replace("__askedfact:", ""));
  }
  return out;
}

/**
 * A requirement is satisfied when the fact is known, when something
 * else implies it, or when it has already been asked.
 *
 * The "already asked" arm matters: a customer may legitimately answer
 * "I'm not sure", which resolves nothing but must never cause the same
 * fact to be asked again.
 */
export function isRequirementSatisfied(
  req: FactRequirement,
  facts: KnownFacts,
): boolean {
  if (facts.known.has(req.fact)) return true;
  if (req.impliedBy?.(facts)) return true;
  // A critical fact must be genuinely established. Having merely been
  // asked is not enough, or a case can complete with nothing to argue.
  if (req.critical) return false;
  if (facts.values[askedFactKey(req.fact)] === true) return true;
  return false;
}

/** Critical requirements that were asked but came back empty. */
export function unresolvedCriticalFacts(
  facts: KnownFacts,
  routes?: RouteFamily[],
): FactRequirement[] {
  return missingRequirements(facts, routes).filter(
    (r) => r.critical && facts.values[askedFactKey(r.fact)] === true,
  );
}

/** Is this requirement live for the current facts? */
export function isRequirementActive(
  req: FactRequirement,
  facts: KnownFacts,
): boolean {
  if (req.when && !req.when(facts)) return false;
  return !isRequirementSatisfied(req, facts);
}

/**
 * Outstanding requirements, highest value first.
 *
 * Triage and scope always apply. Route requirements apply only to the
 * routes actually in play, which is what makes two different cases ask
 * different questions.
 */
export function missingRequirements(
  facts: KnownFacts,
  routes?: RouteFamily[],
): FactRequirement[] {
  const live = routes ?? openRoutes(facts);
  const candidates: FactRequirement[] = [
    ...TRIAGE_REQUIREMENTS,
    ...live.flatMap((r) => ROUTE_REQUIREMENTS[r] ?? []),
  ];

  const seen = new Set<string>();
  const out: FactRequirement[] = [];
  for (const req of candidates.sort((a, b) => a.priority - b.priority)) {
    if (seen.has(req.fact)) continue;
    if (!isRequirementActive(req, facts)) continue;
    seen.add(req.fact);
    out.push(req);
  }
  return out;
}

/** Just the fact keys, for the analysis layer and for persistence. */
export function missingMaterialFacts(
  facts: KnownFacts,
  routes?: RouteFamily[],
): string[] {
  return missingRequirements(facts, routes).map((r) => r.fact);
}

/** The single highest-value outstanding requirement, if any. */
export function nextRequirement(
  facts: KnownFacts,
  routes?: RouteFamily[],
): FactRequirement | null {
  return missingRequirements(facts, routes)[0] ?? null;
}

/** Nothing material left to ask. */
export function hasSufficientInformation(
  facts: KnownFacts,
  routes?: RouteFamily[],
): boolean {
  return missingRequirements(facts, routes).length === 0;
}
