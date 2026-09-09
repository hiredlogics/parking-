import { FACT, factStr } from "@/lib/questions/facts";
import type { KnownFacts } from "@/lib/questions/types";
import type { PofaAnalysis } from "./types";

/**
 * Prohibited claims.
 *
 * MASTER Developer Pack V2 Part 9 (mandatory AI drafting instructions),
 * KB §17 (validator rules) and Legal Authority & Source Register V1
 * §6/§12/§13.
 *
 * These strings are passed to the drafting layer as hard exclusions and
 * to the validator as blocking checks. Anything always-prohibited is
 * listed unconditionally; the rest are added when the facts of the case
 * make the claim unsupportable.
 */

/** Never permitted, in any case. */
export const ALWAYS_PROHIBITED: string[] = [
  "OBSOLETE_PENALTY_ARGUMENT",
  "GENUINE_PRE_ESTIMATE_OF_LOSS",
  "UNIVERSAL_10_MINUTE_CANCELLATION",
  "ANPR_PRESENCE_EQUALS_PARKING_TIME",
  "MERGE_CONSIDERATION_AND_GRACE",
  "IDENTIFY_OR_IMPLY_DRIVER",
  "INVENT_FACTS_OR_EVIDENCE",
  "INVENT_LEASE_TERMS",
  "GENERIC_ANPR_CALIBRATION_ALLEGATION",
  "AUTOMATIC_CANCELLATION_FROM_PERMIT",
  "AUTOMATIC_CANCELLATION_FROM_BREAKDOWN",
  "AUTOMATIC_CANCELLATION_FROM_RESIDENT_STATUS",
  "AUTOMATIC_CANCELLATION_FROM_DISABILITY",
  "AUTOMATIC_FRUSTRATION_FROM_BREAKDOWN",
  "EVERY_CHARGE_AUTOMATICALLY_VALID",
  "CHARGE_MUST_EQUAL_OPERATOR_LOSS",
  "WITHDRAWN_SOURCE_AS_CURRENT_LAW",
  "GOVERNMENT_PROPOSAL_AS_CURRENT_LAW",
  "OPEN_INVESTIGATION_AS_FINDING",
  "POPLA_IAS_OR_COURT_LANGUAGE",
  "EXPOSE_MODULE_IDS_OR_REASONING",
];

export interface ProhibitedInput {
  facts: KnownFacts;
  pofa: PofaAnalysis;
  /** Evidence types actually available on the case. */
  evidence: Set<string>;
}

/**
 * Compute the full prohibited-claim list for a case.
 */
export function computeProhibitedClaims(input: ProhibitedInput): string[] {
  const out = new Set<string>(ALWAYS_PROHIBITED);
  const f = input.facts;

  // ---- PoFA (KB-POFA-04, VAL-POFA) ----
  if (input.pofa.timingStatus !== "FAILED") {
    out.add("ALLEGE_POFA_TIMING_FAILURE");
  }
  if (input.pofa.confirmedContentDefects.length === 0) {
    out.add("ALLEGE_POFA_CONTENT_DEFECT");
  }
  if (!input.pofa.applicable) {
    out.add("RELY_ON_SCHEDULE_4_KEEPER_LIABILITY");
  }
  // Even where keeper liability fails, the charge itself is not void.
  out.add("ASSERT_CHARGE_VOID_FROM_KEEPER_LIABILITY_FAILURE");

  // ---- Evidence integrity (VAL-EVIDENCE) ----
  if (input.evidence.size === 0) {
    out.add("CLAIM_EVIDENCE_ENCLOSED");
  }
  if (factStr(f, FACT.PAYMENT_EVIDENCE) !== "YES") {
    out.add("CLAIM_PAYMENT_EVIDENCE_ENCLOSED");
  }

  // ---- Residential (KB-RES-01/02, VAL-RES) ----
  const agreementUploaded = factStr(f, FACT.AGREEMENT_UPLOADED) === "YES";
  if (!agreementUploaded) {
    out.add("ASSERT_RESIDENTIAL_PRIMACY");
    out.add("QUOTE_LEASE_TERMS");
    out.add("ASSERT_UNFETTERED_RIGHT");
    out.add("ASSERT_DEROGATION_FROM_GRANT");
  }
  // "unfettered" needs the document to actually support it.
  if (agreementUploaded && factStr(f, FACT.AGREEMENT_PERMIT_CLAUSE) === "YES") {
    // A permit/regulations clause exists — primacy is weaker and the
    // clause must be confronted, not ignored (KB-RES-06).
    out.add("ASSERT_UNFETTERED_RIGHT");
    out.add("IGNORE_PERMIT_OR_REGULATIONS_CLAUSE");
  }
  if (!f.tags.has("resident_parking_rights")) {
    out.add("ASSERT_QUIET_ENJOYMENT");
  }

  // ---- Breakdown (KB-BREAK-01/02, VAL-BREAK) ----
  const brokeDown = f.tags.has("breakdown_immobilised");
  const prevented = factStr(f, FACT.BREAKDOWN_PREVENTED_DEPARTURE) === "YES";
  if (!brokeDown || !prevented) {
    out.add("ASSERT_FRUSTRATION_OR_IMPOSSIBILITY");
  }
  const breakdownEvidence = Array.isArray(f.values[FACT.BREAKDOWN_EVIDENCE])
    ? (f.values[FACT.BREAKDOWN_EVIDENCE] as string[])
    : [];
  const hasRealBreakdownEvidence =
    breakdownEvidence.filter((e) => e !== "none").length > 0;
  if (brokeDown && !hasRealBreakdownEvidence) {
    out.add("REFER_TO_BREAKDOWN_EVIDENCE");
  }

  // ---- Equality (KB-EQ-01, VAL-EQ) ----
  if (!f.tags.has("accessibility_additional_time")) {
    out.add("RAISE_EQUALITY_ACT_GROUND");
  }
  out.add("EQUATE_BLUE_BADGE_WITH_STATUTORY_TEST");
  out.add("PROMISE_CANCELLATION");

  // ---- ANPR (KB-ANPR-03, VAL-ANPR) ----
  if (!f.tags.has("anpr_disputed")) {
    out.add("ALLEGE_TIMESTAMP_DISCREPANCY");
  }
  if (!f.tags.has("multiple_visits_same_day")) {
    out.add("ALLEGE_INCORRECT_ANPR_PAIRING");
  }

  // ---- Signage (KB-SIGN-01) ----
  if (!f.tags.has("signage_issue")) {
    out.add("CHALLENGE_SIGNAGE_ADEQUACY");
  }
  out.add("CLAIM_SIGN_INADEQUATE_FROM_NON_READING_ALONE");

  // ---- Payment (KB-PAY-01) ----
  if (!f.tags.has("payment_made")) {
    out.add("ASSERT_PAYMENT_WAS_MADE");
  }

  // ---- Permit / authorisation ----
  if (!f.tags.has("authorised_or_permit")) {
    out.add("ASSERT_VALID_PERMIT_HELD");
  }

  // ---- Case law (KB-GOV-06) ----
  out.add("QUOTE_CASE_LAW");
  out.add("NAME_PERSUASIVE_AUTHORITY");

  // ---- Landowner proportionality (KB-LAND-01) ----
  out.add("ASSERT_NO_LANDOWNER_AUTHORITY_EXISTS");

  return [...out].sort();
}
