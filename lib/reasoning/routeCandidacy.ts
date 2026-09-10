import type { RouteFamily } from "@/types/caseState";
import { FACT, factStr } from "@/lib/questions/facts";
import type { KnownFacts } from "@/lib/questions/types";
import { ROUTE_TRIGGERS } from "@/lib/questions/requirements";
import {
  classifyAllegation,
  type AllegationClassification,
} from "./allegation";
import { routesFromEvidence, type DerivedFact } from "./evidenceFacts";

/**
 * Route candidacy.
 *
 * Replaces tag-only route opening. Scenario tags still contribute, but
 * they are no longer the sole mechanism — which was the defect that
 * made the journey feel like a questionnaire: nothing the PCN said or
 * the customer uploaded could open a route on its own.
 *
 * Four independent sources now open a route:
 *
 *   1. the operator's allegation on the notice
 *   2. established or answered case facts
 *   3. uploaded evidence
 *   4. scenario tags (assisting, not required)
 *
 * A route is then EXCLUDED where a confirmed fact contradicts it, so
 * answering "no payment was made" closes the payment line of enquiry
 * instead of continuing through method and receipt questions.
 */

export interface RouteCandidacy {
  candidates: RouteFamily[];
  excluded: Array<{ route: RouteFamily; reason: string }>;
  allegation: AllegationClassification;
  /** Which source opened each route, for audit and explanation. */
  provenance: Record<string, string[]>;
}

const is = (f: KnownFacts, key: string, ...values: string[]) =>
  values.includes(factStr(f, key) ?? "");

/** Truthy for a boolean or a "YES" string answer. */
function yes(f: KnownFacts, key: string): boolean {
  const v = f.values[key];
  return v === true || v === "YES";
}
function no(f: KnownFacts, key: string): boolean {
  const v = f.values[key];
  return v === false || v === "NO";
}

/**
 * Facts that open a route directly, regardless of tags.
 *
 * This is what makes "PCN says overstay, customer reports a breakdown"
 * pivot immediately to BREAKDOWN.
 */
const FACT_ROUTES: Array<{
  route: RouteFamily;
  when: (f: KnownFacts) => boolean;
  why: string;
}> = [
  {
    route: "PAYMENT",
    when: (f) =>
      yes(f, FACT.PAYMENT_MADE) ||
      yes(f, FACT.PAYMENT_ATTEMPTED) ||
      is(f, FACT.PAYMENT_MADE, "ATTEMPTED_FAILED") ||
      f.known.has(FACT.PAYMENT_METHOD),
    why: "a payment was made or attempted",
  },
  {
    route: "KEYING",
    when: (f) => yes(f, FACT.KEYING_ERROR) || f.known.has(FACT.VRM_ENTERED),
    why: "a registration entry issue is in play",
  },
  {
    route: "BREAKDOWN",
    when: (f) =>
      yes(f, FACT.BREAKDOWN_OCCURRED) ||
      yes(f, FACT.BREAKDOWN_PREVENTED_DEPARTURE) ||
      f.known.has(FACT.BREAKDOWN_NATURE) ||
      yes(f, FACT.RECOVERY_ATTENDANCE),
    why: "the vehicle became immobilised",
  },
  {
    route: "RESIDENTIAL",
    when: (f) =>
      f.known.has(FACT.OCCUPIER_STATUS) ||
      yes(f, FACT.AGREEMENT_UPLOADED) ||
      f.known.has(FACT.BAY_REFERENCE) ||
      yes(f, FACT.COMMUNAL_SPACE),
    why: "an occupier's parking right is in play",
  },
  {
    route: "AUTHORIZATION",
    when: (f) =>
      yes(f, FACT.PERMISSION_HELD) ||
      f.known.has(FACT.PERMISSION_SOURCE) ||
      yes(f, FACT.VISITOR_AUTHORISATION) ||
      yes(f, FACT.CUSTOMER_AUTHORISATION),
    why: "permission to park is asserted",
  },
  {
    route: "PERMIT",
    when: (f) => yes(f, FACT.PERMISSION_HELD),
    why: "a permit or entitlement is asserted",
  },
  {
    route: "ANPR",
    when: (f) =>
      no(f, FACT.CONTINUOUS_PRESENCE) ||
      f.known.has(FACT.VISIT_COUNT) ||
      yes(f, FACT.TIMESTAMP_DISCREPANCY) ||
      yes(f, FACT.VEHICLE_LEFT_SITE_EVIDENCE),
    why: "the camera sequence is in dispute",
  },
  {
    route: "GRACE",
    when: (f) =>
      f.known.has(FACT.EXIT_DELAY_REASON) || f.known.has(FACT.DEPARTURE_DELAY),
    why: "a departure delay is in play",
  },
  {
    route: "CONSIDERATION",
    when: (f) =>
      f.known.has(FACT.INITIAL_PERIOD_REASON) ||
      f.known.has(FACT.ARRIVAL_CONTEXT) ||
      no(f, FACT.PARKING_ACCEPTED),
    why: "events before parking was accepted are in play",
  },
  {
    route: "EQUALITY",
    when: (f) => yes(f, FACT.ADDITIONAL_TIME_NEEDED),
    why: "a disability-related need is indicated",
  },
  {
    route: "HOSPITAL",
    when: (f) => f.known.has(FACT.HOSPITAL_ATTENDANCE),
    why: "medical attendance is in play",
  },
  {
    route: "EV_CHARGING",
    when: (f) => yes(f, FACT.CHARGING_SESSION),
    why: "a charging session is in play",
  },
  {
    route: "INFRASTRUCTURE",
    when: (f) => yes(f, FACT.BARRIER_FAILURE),
    why: "an access system failure is in play",
  },
  {
    route: "SIGNAGE",
    when: (f) => f.known.has(FACT.SIGNAGE_ISSUE_BASIS),
    why: "a specific signage defect is identified",
  },
  {
    route: "LOADING",
    when: (f) => is(f, FACT.ACTIVITY_TYPE, "loading", "unloading"),
    why: "the vehicle was loading or unloading",
  },
  {
    route: "DROP_OFF",
    when: (f) => is(f, FACT.ACTIVITY_TYPE, "drop_off", "collection"),
    why: "the vehicle stopped briefly to drop off or collect",
  },
];

/**
 * Contradictions that close a route.
 *
 * The client's explicit requirement: once payment_made is NO, stop
 * asking about payment method and receipts unless something else makes
 * them material.
 */
const EXCLUSIONS: Array<{
  route: RouteFamily;
  when: (f: KnownFacts) => boolean;
  reason: string;
}> = [
  {
    route: "PAYMENT",
    when: (f) =>
      no(f, FACT.PAYMENT_MADE) &&
      !yes(f, FACT.PAYMENT_ATTEMPTED) &&
      !yes(f, FACT.KEYING_ERROR),
    reason: "No payment was made or attempted.",
  },
  {
    route: "KEYING",
    when: (f) =>
      no(f, FACT.PAYMENT_MADE) &&
      !yes(f, FACT.PAYMENT_ATTEMPTED) &&
      !yes(f, FACT.KEYING_ERROR),
    reason: "A keying error presupposes a payment attempt.",
  },
  {
    route: "BREAKDOWN",
    when: (f) => no(f, FACT.BREAKDOWN_PREVENTED_DEPARTURE),
    reason: "The vehicle could still be moved, so no supervening event arises.",
  },
  {
    route: "RESIDENTIAL",
    when: (f) => is(f, FACT.OCCUPIER_STATUS, "other"),
    reason: "No occupier relationship to the address.",
  },
  {
    route: "EQUALITY",
    when: (f) => no(f, FACT.ADDITIONAL_TIME_NEEDED),
    reason: "No disability-related additional time was needed.",
  },
  {
    route: "PERMIT",
    when: (f) => no(f, FACT.PERMISSION_HELD),
    reason: "No permit or permission was held.",
  },
  {
    route: "AUTHORIZATION",
    when: (f) =>
      no(f, FACT.PERMISSION_HELD) &&
      !yes(f, FACT.VISITOR_AUTHORISATION) &&
      !yes(f, FACT.CUSTOMER_AUTHORISATION),
    reason: "No permission to park is asserted.",
  },
  {
    route: "ANPR",
    when: (f) =>
      yes(f, FACT.CONTINUOUS_PRESENCE) &&
      !yes(f, FACT.TIMESTAMP_DISCREPANCY) &&
      !f.known.has(FACT.VISIT_COUNT),
    reason: "The vehicle was continuously present and times are not disputed.",
  },
];

export function assessCandidacy(input: {
  facts: KnownFacts;
  allegedBreach?: string | null;
  derivedEvidenceFacts?: DerivedFact[];
}): RouteCandidacy {
  const f = input.facts;
  const provenance: Record<string, string[]> = {};
  const add = (route: RouteFamily, source: string) => {
    provenance[route] = [...(provenance[route] ?? []), source];
  };

  // 1. The operator's own allegation.
  const allegation = classifyAllegation(input.allegedBreach);
  for (const r of allegation.routes) {
    add(r, `notice alleges ${allegation.category.toLowerCase().replace(/_/g, " ")}`);
  }

  // 2. Established and answered facts.
  for (const { route, when, why } of FACT_ROUTES) {
    if (when(f)) add(route, why);
  }

  // 3. Uploaded evidence.
  for (const r of routesFromEvidence(input.derivedEvidenceFacts ?? [])) {
    add(r, "supporting evidence was uploaded");
  }

  // 4. Scenario tags — assisting only.
  for (const tag of f.tags) {
    for (const r of ROUTE_TRIGGERS[tag] ?? []) {
      add(r, "the customer's description");
    }
  }

  // PoFA is always in play on an unidentified-driver keeper route.
  if (
    is(f, FACT.REGISTERED_KEEPER, "YES") &&
    is(f, FACT.DRIVER_IDENTIFIED, "NO", "UNSURE")
  ) {
    add("POFA", "registered keeper with the driver not identified");
  }

  // Now remove anything the confirmed facts contradict.
  const excluded: RouteCandidacy["excluded"] = [];
  for (const { route, when, reason } of EXCLUSIONS) {
    if (!provenance[route]) continue;
    if (!when(f)) continue;
    excluded.push({ route, reason });
    delete provenance[route];
  }

  return {
    candidates: (Object.keys(provenance) as RouteFamily[]).sort(),
    excluded,
    allegation,
    provenance,
  };
}
