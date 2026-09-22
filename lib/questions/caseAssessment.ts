import type { KnownFacts } from "@/lib/questions/types";
import { FACT, factStr } from "@/lib/questions/facts";
import type { FactRequirement } from "@/lib/questions/requirements";

/**
 * AI case assessment — filters the engine's missing-fact list to what
 * is genuinely needed given the notice + customer circumstances.
 *
 * The AI may ONLY remove or re-order facts from the sanctioned list.
 * It may never invent new fact keys.
 */

/** Facts that are circumstance-led: skip unless the customer selected a matching situation. */
const CIRCUMSTANCE_FACT_PREFIXES: Array<{
  scenarios: string[];
  facts: string[];
}> = [
  {
    scenarios: ["authorised_or_permit", "resident_parking_rights"],
    facts: [
      "permission_held",
      "permission_source",
      "visitor_authorisation",
      "customer_authorisation",
      "occupier_status",
      "agreement_uploaded",
      "agreement_permit_clause",
      "bay_allocated",
      "bay_reference",
      "parking_right_evidence",
    ],
  },
  {
    scenarios: ["breakdown_immobilised"],
    facts: [
      "breakdown_nature",
      "breakdown_prevented_departure",
      "recovery_attendance",
      "breakdown_evidence",
    ],
  },
  {
    scenarios: ["grace_or_exit"],
    facts: ["exit_delay_reason", "departure_delay", "initial_period_reason"],
  },
  {
    scenarios: ["signage_issue"],
    facts: ["signage_issue_basis"],
  },
  {
    scenarios: ["payment_made", "vrm_error"],
    facts: [
      "payment_made",
      "payment_method",
      "vrm_entered",
      "keying_error",
      "payment_evidence",
    ],
  },
];

function scenarioSet(facts: KnownFacts): Set<string> {
  const out = new Set<string>();
  const raw = facts.values[FACT.SCENARIOS];
  if (Array.isArray(raw)) {
    for (const s of raw) if (typeof s === "string") out.add(s.toLowerCase());
  }
  return out;
}

/**
 * Deterministic assessment filter used when AI assessment is unavailable
 * or as a hard safety net after AI returns.
 *
 * After the customer has named circumstances, drop permission/residential
 * (and similar) facts that are not justified by those circumstances.
 */
/**
 * After circumstances are named, only drop permission/residential/etc.
 * questionnaires that those answers do not justify. Do NOT require a
 * matching situation tag to keep payment/grace/signage facts when the
 * notice allegation already opened that route — circumstances refine
 * questionnaire noise; they do not erase allegation-led investigation.
 */
export function filterMissingFactsByCircumstances(
  missing: FactRequirement[],
  facts: KnownFacts,
): FactRequirement[] {
  const scenarios = scenarioSet(facts);
  if (scenarios.size === 0) return missing;

  /** Only these groups are suppressed when the customer did not select them. */
  const suppressUnlessSelected = CIRCUMSTANCE_FACT_PREFIXES.filter((g) =>
    g.scenarios.some((s) =>
      ["authorised_or_permit", "resident_parking_rights", "breakdown_immobilised"].includes(
        s,
      ),
    ),
  );

  const alwaysKeep = new Set([
    "scenarios",
    "jurisdiction",
    "registered_keeper",
    "driver_identified",
    "vehicle_hire_status",
    "notice_route",
    "situation_other",
  ]);

  return missing.filter((req) => {
    if (alwaysKeep.has(req.fact)) return true;

    for (const group of suppressUnlessSelected) {
      if (!group.facts.includes(req.fact)) continue;
      return group.scenarios.some((s) => scenarios.has(s));
    }
    return true;
  });
}

export function assessmentContextSummary(facts: KnownFacts): string {
  const scenarios = factStr(facts, FACT.SCENARIOS);
  return [
    `operator: ${factStr(facts, FACT.OPERATOR_NAME) || "(unknown)"}`,
    `alleged_breach: ${factStr(facts, FACT.ALLEGED_BREACH) || "(unknown)"}`,
    `location: ${factStr(facts, FACT.PARKING_LOCATION) || "(unknown)"}`,
    `amount: ${facts.values[FACT.CHARGE_AMOUNT] ?? "(unknown)"}`,
    `customer_circumstances: ${scenarios || "(not yet answered)"}`,
  ].join("\n");
}
