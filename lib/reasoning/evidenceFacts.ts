import type { RouteFamily } from "@/types/caseState";
import { FACT } from "@/lib/questions/facts";
import type { AnswerValue } from "@/lib/questions/types";

/**
 * Evidence-derived facts.
 *
 * MASTER V2 Part 2: "AI determines what material facts are still
 * missing" — and Part 4: infer from the notice and evidence first, ask
 * only what remains. Previously uploaded evidence had no effect on
 * questioning at all, so a customer who uploaded a payment receipt was
 * still asked whether they had paid.
 *
 * The critical distinction, and the reason this is not simply
 * "evidence ⇒ fact":
 *
 *   ESTABLISHED        the evidence type alone is sufficient. The fact
 *                      is treated as known and is never asked.
 *   NEEDS_CONFIRMATION the evidence suggests the fact but a wrong
 *                      assumption would be material. A short
 *                      confirmation question is asked instead of an
 *                      open one.
 *
 * Nothing here reads file CONTENT. It reasons from the evidence type
 * the customer chose, which they explicitly labelled on upload. Content
 * extraction would justify more ESTABLISHED conclusions and is a
 * separate piece of work.
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
 * Kept narrow on purpose. A derivation that is wrong is worse than a
 * question, because it silently removes the customer's chance to
 * correct it.
 */
const RULES: Rule[] = [
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

/**
 * Breakdown evidence is described by the customer's own multi-choice
 * answer rather than an upload category, so it is handled from answers
 * in `deriveFromAnswers`.
 */
export function deriveFactsFromEvidence(
  evidenceTypes: string[],
): DerivedFact[] {
  const present = new Set(evidenceTypes);
  const out: DerivedFact[] = [];
  for (const rule of RULES) {
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

/** Facts to confirm rather than ask openly. */
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
