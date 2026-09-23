import type { RouteFamily } from "@/types/caseState";
import { FACT } from "./facts";
import type { AnswerValue } from "./types";

/**
 * Evidence-derived facts and scenario tags.
 *
 * MASTER V2 Part 4: infer from the notice and evidence first, ask only
 * what remains. This table has existed since adaptive questioning was
 * built, but it was only ever consumed by the question layer to decide
 * what NOT to ask — `deriveKnownFacts` never saw it, so the facts were
 * computed and then thrown away before the module gates ran. A customer
 * who uploaded a payment receipt still reached retrieval with
 * `payment_made` unset, and the payment modules were filtered out.
 *
 * The critical distinction, and the reason this is not simply
 * "evidence ⇒ fact":
 *
 *   ESTABLISHED        the evidence type alone is sufficient. The fact
 *                      is treated as known.
 *   NEEDS_CONFIRMATION the evidence suggests the fact but a wrong
 *                      assumption would be material, so it is reported
 *                      as outstanding rather than assumed.
 *
 * Nothing here reads file CONTENT — it reasons from the evidence type
 * the customer chose and explicitly labelled on upload. Reading the
 * document itself justifies more, and is services/evidence/.
 *
 * ---------------------------------------------------------------------
 * WHY THE TAG LIST BELOW IS SO SHORT
 * ---------------------------------------------------------------------
 * A scenario tag does double duty in this system. It opens module gates
 * (lib/retrieval/gates.ts), AND it lifts prohibitions
 * (lib/analysis/prohibited.ts) — `authorised_or_permit` is the only
 * thing standing between a case and ASSERT_VALID_PERMIT_HELD. So a tag
 * derived from a weak signal does not merely widen the candidate set:
 * it removes the guard that was keeping an unsupported claim out of the
 * letter.
 *
 * A tag is therefore only derived where the evidence independently
 * establishes the tag's own proposition:
 *
 *   payment_receipt      → payment_made           A receipt for the event
 *                                                 is direct proof a payment
 *                                                 happened, which is exactly
 *                                                 KB-PAY-01's use_when.
 *   signage_photo        → signage_issue          The photographs are the
 *                                                 substantiation; no module
 *                                                 opens without a specific
 *                                                 signage_issue_basis anyway.
 *   breakdown_evidence   → breakdown_immobilised  Recovery documentation was
 *                                                 supplied. Inert on its own:
 *                                                 KB-BREAK-01 and the
 *                                                 frustration prohibition both
 *                                                 still require
 *                                                 breakdown_prevented_departure.
 *
 * Deliberately NOT derived, with reasons, because each asserts something
 * the upload does not establish:
 *
 *   permit → authorised_or_permit   The document's validity for THIS date
 *                                   and site is unknown, and the tag would
 *                                   lift ASSERT_VALID_PERMIT_HELD and open
 *                                   KB-AUTH-02 ("a valid permit existed").
 *                                   Needs the document read.
 *   anpr_evidence → anpr_disputed   Uploading camera evidence does not make
 *                                   the operator's sequence inconsistent,
 *                                   which is KB-ANPR-02's use_when, and the
 *                                   tag would lift
 *                                   ALLEGE_TIMESTAMP_DISCREPANCY.
 *   authorisation_evidence →        An authorisation document does not
 *   resident_parking_rights         establish residence, and the tag lifts
 *                                   ASSERT_QUIET_ENJOYMENT.
 *
 * Those are the cases the document-understanding layer exists to answer.
 */

export type DerivationConfidence = "ESTABLISHED" | "NEEDS_CONFIRMATION";

export interface DerivedFact {
  fact: string;
  value: AnswerValue;
  confidence: DerivationConfidence;
  /** Evidence type it came from, for audit and for the AI context. */
  fromEvidence: string;
  /** Why this follows, in one line. */
  basis: string;
  /** Routes this derivation puts in play. */
  opensRoutes: RouteFamily[];
}

type Rule = {
  evidenceType: string;
  derive: DerivedFact[];
};

/**
 * Evidence type → facts.
 *
 * Kept narrow on purpose. A derivation that is wrong is worse than an
 * unresolved fact, because it silently removes the customer's chance to
 * correct it.
 *
 * Built lazily: lib/facts/facts.ts consumes this module, so reading FACT
 * at module-initialisation time would hit the import cycle before the
 * constant is bound.
 */
let RULES_CACHE: Rule[] | null = null;

function rules(): Rule[] {
  if (RULES_CACHE) return RULES_CACHE;
  RULES_CACHE = [
    {
      evidenceType: "payment_receipt",
      derive: [
        {
          fact: FACT.PAYMENT_MADE,
          value: "YES",
          // A receipt for this event is direct proof a payment happened.
          confidence: "ESTABLISHED",
          fromEvidence: "payment_receipt",
          basis: "A payment receipt was uploaded for this parking event.",
          opensRoutes: ["PAYMENT"],
        },
        {
          fact: FACT.PAYMENT_EVIDENCE,
          value: "YES",
          confidence: "ESTABLISHED",
          fromEvidence: "payment_receipt",
          basis: "The keeper can produce a record of the payment.",
          opensRoutes: ["PAYMENT"],
        },
        {
          fact: FACT.PAYMENT_METHOD,
          value: null,
          // A receipt proves payment but not how it was made.
          confidence: "NEEDS_CONFIRMATION",
          fromEvidence: "payment_receipt",
          basis: "The method is not determinable from the receipt type alone.",
          opensRoutes: ["PAYMENT"],
        },
      ],
    },
    {
      evidenceType: "app_screenshot",
      derive: [
        {
          fact: FACT.PAYMENT_MADE,
          value: "YES",
          confidence: "NEEDS_CONFIRMATION",
          fromEvidence: "app_screenshot",
          basis:
            "An app screenshot may show a completed payment or only an attempt.",
          opensRoutes: ["PAYMENT"],
        },
        {
          fact: FACT.PAYMENT_METHOD,
          value: "app",
          confidence: "ESTABLISHED",
          fromEvidence: "app_screenshot",
          basis: "The evidence is from a parking app.",
          opensRoutes: ["PAYMENT"],
        },
        {
          fact: FACT.PAYMENT_EVIDENCE,
          value: "YES",
          confidence: "ESTABLISHED",
          fromEvidence: "app_screenshot",
          basis: "The keeper can produce an app record.",
          opensRoutes: ["PAYMENT"],
        },
      ],
    },
    {
      evidenceType: "permit",
      derive: [
        {
          fact: FACT.PERMISSION_HELD,
          value: "YES",
          confidence: "NEEDS_CONFIRMATION",
          fromEvidence: "permit",
          basis:
            "A permit was uploaded, but its validity for the event date and site needs confirming.",
          opensRoutes: ["PERMIT", "AUTHORIZATION"],
        },
        {
          fact: FACT.AUTHORISATION_EVIDENCE,
          value: "YES",
          confidence: "ESTABLISHED",
          fromEvidence: "permit",
          basis: "Permit documentation is available.",
          opensRoutes: ["PERMIT", "AUTHORIZATION"],
        },
      ],
    },
    {
      evidenceType: "authorisation_evidence",
      derive: [
        {
          fact: FACT.AGREEMENT_UPLOADED,
          value: "YES",
          confidence: "ESTABLISHED",
          fromEvidence: "authorisation_evidence",
          basis: "An agreement or authorisation document was uploaded.",
          opensRoutes: ["RESIDENTIAL", "AUTHORIZATION"],
        },
        {
          fact: FACT.PARKING_RIGHT_EVIDENCE,
          value: "YES",
          confidence: "ESTABLISHED",
          fromEvidence: "authorisation_evidence",
          basis: "Documentation of the underlying parking right is available.",
          opensRoutes: ["RESIDENTIAL"],
        },
        {
          fact: FACT.AGREEMENT_PERMIT_CLAUSE,
          value: null,
          // Source Register §7: rights come from the instrument's actual
          // wording, never from resident status. The clause must be read.
          confidence: "NEEDS_CONFIRMATION",
          fromEvidence: "authorisation_evidence",
          basis:
            "The agreement's permit/regulations wording must be confirmed rather than assumed.",
          opensRoutes: ["RESIDENTIAL"],
        },
      ],
    },
    {
      evidenceType: "signage_photo",
      derive: [
        {
          fact: FACT.SIGNAGE_ISSUE_BASIS,
          value: null,
          confidence: "NEEDS_CONFIRMATION",
          fromEvidence: "signage_photo",
          basis:
            "Signage photographs were uploaded, so a specific defect can be identified.",
          opensRoutes: ["SIGNAGE"],
        },
      ],
    },
    {
      evidenceType: "anpr_evidence",
      derive: [
        {
          fact: FACT.CONTINUOUS_PRESENCE,
          value: null,
          confidence: "NEEDS_CONFIRMATION",
          fromEvidence: "anpr_evidence",
          basis: "Camera evidence was uploaded and can be examined.",
          opensRoutes: ["ANPR"],
        },
      ],
    },
    {
      evidenceType: "location_evidence",
      derive: [
        {
          fact: FACT.VEHICLE_LEFT_SITE_EVIDENCE,
          value: "YES",
          confidence: "ESTABLISHED",
          fromEvidence: "location_evidence",
          basis: "Independent evidence of the vehicle's location is available.",
          opensRoutes: ["ANPR"],
        },
      ],
    },
  ];
  return RULES_CACHE;
}

/**
 * Scenario tags the uploaded evidence independently establishes.
 *
 * See the header for why this is three entries and not nine.
 */
const TAG_RULES: Record<string, string> = {
  payment_receipt: "payment_made",
  signage_photo: "signage_issue",
  breakdown_evidence: "breakdown_immobilised",
};

export function tagsFromEvidence(evidenceTypes: string[]): string[] {
  const out = new Set<string>();
  for (const t of evidenceTypes) {
    const tag = TAG_RULES[t];
    if (tag) out.add(tag);
  }
  return [...out].sort();
}

export function deriveFactsFromEvidence(
  evidenceTypes: string[],
): DerivedFact[] {
  const present = new Set(evidenceTypes);
  const out: DerivedFact[] = [];
  for (const rule of rules()) {
    if (!present.has(rule.evidenceType)) continue;
    out.push(...rule.derive);
  }
  return out;
}

/** Facts treated as known — never asked again. */
export function establishedFacts(
  derived: DerivedFact[],
): Record<string, AnswerValue> {
  const out: Record<string, AnswerValue> = {};
  for (const d of derived) {
    if (d.confidence !== "ESTABLISHED") continue;
    if (d.value === null) continue;
    out[d.fact] = d.value;
  }
  return out;
}

/** Facts to confirm rather than assume. */
export function factsNeedingConfirmation(derived: DerivedFact[]): string[] {
  const established = new Set(Object.keys(establishedFacts(derived)));
  return [
    ...new Set(
      derived
        .filter((d) => d.confidence === "NEEDS_CONFIRMATION")
        .map((d) => d.fact)
        .filter((f) => !established.has(f)),
    ),
  ];
}

/** Routes the uploaded evidence puts in play. */
export function routesFromEvidence(derived: DerivedFact[]): RouteFamily[] {
  const out = new Set<RouteFamily>();
  for (const d of derived) for (const r of d.opensRoutes) out.add(r);
  return [...out].sort();
}
