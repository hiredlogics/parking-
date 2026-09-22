import type { RouteFamily } from "@/types/caseState";

/**
 * Allegation classification.
 *
 * The PCN states what the operator says went wrong. That is the single
 * most informative fact on the notice, and until now it was extracted,
 * stored, and then ignored — routes could only open from hidden
 * scenario tags, so "Failure to make payment" did not make PAYMENT a
 * candidate until the customer ticked a box saying so.
 *
 * This reads the allegation text and reports which routes it puts in
 * play. It is deliberately conservative: the allegation opens a route
 * for INVESTIGATION, it never establishes a fact or a defect.
 */

export interface AllegationClassification {
  /** Normalised category, for reporting and tests. */
  category: AllegationCategory;
  /** Routes the allegation itself puts in play. */
  routes: RouteFamily[];
  /** The matched phrase, for audit. */
  matched: string | null;
}

export type AllegationCategory =
  | "NO_PAYMENT"
  | "OVERSTAY"
  | "NO_PERMIT"
  | "UNAUTHORISED"
  | "OUTSIDE_HOURS"
  | "WRONG_BAY"
  | "ANPR_DURATION"
  | "UNKNOWN";

/**
 * Ordered patterns. First match wins, so more specific phrasings are
 * listed before general ones.
 */
const PATTERNS: Array<{
  category: AllegationCategory;
  re: RegExp;
  routes: RouteFamily[];
}> = [
  {
    /*
     * Matches "failure to make a valid payment", "parking without
     * payment", "no payment received", "non-payment", "unpaid".
     * The bounded word gap absorbs articles and qualifiers such as
     * "a valid" that sit between the trigger and "payment".
     */
    category: "NO_PAYMENT",
    re: /\bunpaid\b|\bfailure\s+to\s+pay\b|\bnon[-\s]?payment\b|\b(?:failure\s+to\s+make|did\s+not\s+pay|no|without|insufficient)\s+(?:\w+\s+){0,3}?pay(?:ment|ing)?\b/i,
    // Keying sits with payment: a mistyped VRM presents as non-payment.
    routes: ["PAYMENT", "KEYING"],
  },
  {
    category: "NO_PERMIT",
    re: /\b(?:no|without|invalid|failure\s+to\s+display)\s*(?:valid\s+)?permit\b|\bpermit\s+not\s+(?:displayed|valid|shown)\b/i,
    // Permit/auth investigation — not residential tenancy (that needs customer circumstances).
    routes: ["PERMIT", "AUTHORIZATION"],
  },
  {
    category: "OVERSTAY",
    re: /\bover\s?stay(?:ing|ed)?\b|\bexceed(?:ed|ing)\s+(?:the\s+)?(?:maximum|permitted|paid)\b|\blonger\s+than\s+permitted\b/i,
    // An overstay is a duration allegation: grace and the actual
    // parking period are both in play, as is the ANPR sequence.
    routes: ["GRACE", "ANPR", "CONSIDERATION"],
  },
  {
    category: "OUTSIDE_HOURS",
    re: /\b(?:outside|after|before)\s+(?:permitted\s+)?(?:hours|opening|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b|\brestricted\s+hours\b/i,
    routes: ["AUTHORIZATION", "SIGNAGE"],
  },
  {
    category: "UNAUTHORISED",
    re: /\bunauthorised\b|\bunauthorized\b|\bno\s+(?:right|authority)\s+to\s+park\b|\bnot\s+authorised\b/i,
    routes: ["AUTHORIZATION", "PERMIT"],
  },
  {
    category: "WRONG_BAY",
    re: /\b(?:wrong|incorrect|not\s+in\s+a?\s*(?:marked|designated))\s+(?:bay|space)\b|\boutside\s+(?:a\s+)?(?:marked\s+)?bay\b|\bdisabled\s+bay\b/i,
    routes: ["AUTHORIZATION", "EQUALITY", "SIGNAGE"],
  },
  {
    category: "ANPR_DURATION",
    re: /\banpr\b|\bcamera\b|\bentry\s+and\s+exit\b|\bduration\s+of\s+stay\b/i,
    routes: ["ANPR"],
  },
];

export function classifyAllegation(
  allegedBreach: string | null | undefined,
): AllegationClassification {
  const text = (allegedBreach ?? "").trim();
  if (text.length === 0) {
    return { category: "UNKNOWN", routes: [], matched: null };
  }

  for (const { category, re, routes } of PATTERNS) {
    const m = re.exec(text);
    if (m) return { category, routes: [...routes], matched: m[0] };
  }
  return { category: "UNKNOWN", routes: [], matched: null };
}

/**
 * Facts the allegation makes material.
 *
 * These are facts worth RESOLVING because the operator's own case turns
 * on them — not facts the allegation proves.
 */
export function factsImpliedByAllegation(
  category: AllegationCategory,
): string[] {
  switch (category) {
    case "NO_PAYMENT":
      return ["payment_made", "payment_method", "vrm_entered"];
    case "OVERSTAY":
      return ["permitted_period", "departure_delay", "continuous_presence"];
    case "NO_PERMIT":
      return ["permission_held"];
    case "UNAUTHORISED":
      return ["permission_held"];
    case "OUTSIDE_HOURS":
      return ["permission_held", "signage_issue_basis"];
    case "WRONG_BAY":
      return ["permission_held", "additional_time_needed"];
    case "ANPR_DURATION":
      return ["continuous_presence", "visit_count"];
    default:
      return [];
  }
}
