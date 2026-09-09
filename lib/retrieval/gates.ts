import { FACT, factNum, factStr } from "@/lib/questions/facts";
import type { KnownFacts } from "@/lib/questions/types";
import type { PofaAnalysis } from "@/lib/analysis/types";

/**
 * Fact-level applicability gates.
 *
 * Route-family filtering alone is too coarse. AI Legal Knowledge Base V2
 * gives every module a `use_when` / `do_not_use_when` contract, and KB
 * §20 requires structured filtering to decide eligibility BEFORE any
 * ranking. Without this, a successful-payment case would retrieve the
 * machine-failure and digital-failure modules, and a case with no
 * evidence would retrieve wording that asserts evidence is enclosed.
 *
 * Two layers:
 *   MODULE_GATES — encodes each module's `use_when` as a predicate.
 *   BLOCK_GATES  — guards individual approved paragraphs that assert a
 *                  specific fact (VAL-EVIDENCE / VAL-FACT at retrieval
 *                  time rather than leaving it to the validator).
 *
 * A module or block with no gate is governed by its route family alone.
 */

export interface GateInput {
  facts: KnownFacts;
  pofa: PofaAnalysis;
  evidence: Set<string>;
}

type Gate = (g: GateInput) => boolean;

const tag = (t: string) => (g: GateInput) => g.facts.tags.has(t);
const method = (...ms: string[]) => (g: GateInput) => {
  const m = factStr(g.facts, FACT.PAYMENT_METHOD);
  return m !== null && ms.includes(m);
};
const paymentFailed: Gate = (g) => g.facts.tags.has("payment_attempted_failed");
const signageBasis = (...keys: string[]): Gate => (g) => {
  const raw = g.facts.values[FACT.SIGNAGE_ISSUE_BASIS];
  const basis = Array.isArray(raw) ? (raw as string[]) : [];
  return keys.some((k) => basis.includes(k));
};
const agreementUploaded: Gate = (g) =>
  factStr(g.facts, FACT.AGREEMENT_UPLOADED) === "YES";
const pofaDefectEstablished: Gate = (g) =>
  g.pofa.timingStatus === "FAILED" || g.pofa.confirmedContentDefects.length > 0;

export const MODULE_GATES: Record<string, Gate> = {
  /* ---- PoFA: route-specific, per Source Register §3 ---- */
  "KB-POFA-01": (g) => g.pofa.applicable,
  "KB-POFA-02": (g) => g.pofa.applicable && g.pofa.route === "POSTAL",
  "KB-POFA-03": (g) => g.pofa.applicable && g.pofa.route === "WINDSCREEN",
  // Only where a specific defect is actually established.
  "KB-POFA-04": (g) => g.pofa.confirmedContentDefects.length > 0,
  "KB-POFA-05": pofaDefectEstablished,

  /* ---- Consideration / grace / duration ---- */
  "KB-CON-01": tag("short_stay_consideration"),
  "KB-CON-02": tag("short_stay_consideration"),
  "KB-GRACE-01": tag("grace_or_exit"),
  "KB-GRACE-02": (g) =>
    g.facts.tags.has("barrier_or_access_failure") ||
    (g.facts.tags.has("grace_or_exit") &&
      factStr(g.facts, FACT.EXIT_DELAY_REASON) !== null),
  "KB-TIME-01": (g) =>
    g.facts.tags.has("anpr_disputed") ||
    g.facts.tags.has("multiple_visits_same_day") ||
    g.facts.known.has(FACT.ENTRY_TIME),

  /* ---- Payment: distinguish success from prevented attempt ---- */
  "KB-PAY-01": tag("payment_made"),
  "KB-PAY-02": (g) => paymentFailed(g) && method("machine")(g),
  "KB-PAY-03": (g) => paymentFailed(g) && method("app", "online", "phone")(g),

  /* ---- Keying ---- */
  "KB-KEY-01": tag("vrm_error"),
  // "Another known vehicle registration" — needs a positive indication,
  // which the current question set does not capture, so it stays off
  // rather than being asserted speculatively.
  "KB-KEY-02": () => false,

  /* ---- ANPR / evidence integrity ---- */
  "KB-ANPR-01": (g) =>
    g.facts.tags.has("multiple_visits_same_day") ||
    (factNum(g.facts, FACT.VISIT_COUNT) ?? 0) > 1,
  "KB-ANPR-02": (g) =>
    g.facts.tags.has("multiple_visits_same_day") ||
    g.facts.tags.has("anpr_disputed"),
  "KB-ANPR-03": (g) =>
    g.facts.tags.has("anpr_disputed") &&
    factStr(g.facts, FACT.CONTINUOUS_PRESENCE) !== null,
  "KB-EV-01": (g) => g.evidence.size > 0 && g.facts.tags.has("anpr_disputed"),

  /* ---- Signage: only the specific basis raised ---- */
  "KB-SIGN-01": signageBasis("no_entrance_sign", "obscured_or_damaged"),
  "KB-SIGN-02": signageBasis("term_not_prominent", "charge_not_prominent"),
  "KB-SIGN-03": signageBasis("conflicting_signs"),
  "KB-SIGN-04": signageBasis("obscured_or_damaged"),

  /* ---- Authorisation / permit ---- */
  "KB-AUTH-01": tag("authorised_or_permit"),
  "KB-AUTH-02": (g) => {
    const s = factStr(g.facts, FACT.PERMISSION_SOURCE);
    return g.facts.tags.has("authorised_or_permit") &&
      (s === "resident_permit" || s === "visitor_permit" || s === null);
  },
  "KB-AUTH-03": (g) =>
    factStr(g.facts, FACT.PERMISSION_SOURCE) === "visitor_permit",
  "KB-CUST-01": (g) =>
    factStr(g.facts, FACT.PERMISSION_SOURCE) === "hotel_or_business",

  /* ---- Breakdown ---- */
  "KB-BREAK-01": (g) =>
    g.facts.tags.has("breakdown_immobilised") &&
    factStr(g.facts, FACT.BREAKDOWN_PREVENTED_DEPARTURE) === "YES",
  "KB-BREAK-02": (g) => {
    const nature = factStr(g.facts, FACT.BREAKDOWN_NATURE);
    return (
      g.facts.tags.has("breakdown_immobilised") &&
      (nature === "puncture" || nature === "flat_battery")
    );
  },
  "KB-BREAK-03": (g) => {
    const raw = g.facts.values[FACT.BREAKDOWN_EVIDENCE];
    const ev = Array.isArray(raw) ? (raw as string[]) : [];
    return (
      g.facts.tags.has("breakdown_immobilised") &&
      (ev.includes("recovery_report") || ev.includes("call_logs"))
    );
  },

  /* ---- Residential ---- */
  "KB-RES-01": agreementUploaded,
  "KB-RES-02": (g) =>
    agreementUploaded(g) &&
    factStr(g.facts, FACT.AGREEMENT_PERMIT_CLAUSE) === "NO",
  "KB-RES-03": (g) =>
    agreementUploaded(g) && factStr(g.facts, FACT.BAY_REFERENCE) !== null,
  // Derogation is not boilerplate: needs the grant AND no permit clause.
  "KB-RES-04": (g) =>
    agreementUploaded(g) &&
    factStr(g.facts, FACT.AGREEMENT_PERMIT_CLAUSE) === "NO",
  // Quiet enjoyment is not a universal answer to a PCN.
  "KB-RES-05": () => false,
  "KB-RES-06": (g) =>
    agreementUploaded(g) &&
    factStr(g.facts, FACT.AGREEMENT_PERMIT_CLAUSE) === "YES",
  "KB-RES-07": (g) =>
    agreementUploaded(g) && g.facts.tags.has("landowner_authority_challenge"),

  /* ---- Equality ---- */
  "KB-EQ-01": (g) =>
    g.facts.tags.has("accessibility_additional_time") &&
    factStr(g.facts, FACT.ADDITIONAL_TIME_NEEDED) !== null,
  "KB-EQ-02": (g) =>
    g.facts.tags.has("accessibility_additional_time") &&
    factStr(g.facts, FACT.ADDITIONAL_TIME_NEEDED) !== null,
  "KB-EQ-03": () => false, // hidden-disability framing requires a positive fact

  /* ---- Hospital ---- */
  "KB-HOSP-01": tag("hospital_attendance"),
  "KB-HOSP-02": (g) =>
    factStr(g.facts, FACT.HOSPITAL_ATTENDANCE) === "emergency",
  "KB-HOSP-03": () => false, // PALS route is a practical flag, not drafted

  /* ---- Activity / EV / infrastructure ---- */
  "KB-ACT-01": (g) => factStr(g.facts, FACT.ACTIVITY_TYPE) === "loading",
  "KB-ACT-02": (g) => factStr(g.facts, FACT.ACTIVITY_TYPE) === "dropoff",
  "KB-ACT-03": (g) => factStr(g.facts, FACT.ACTIVITY_TYPE) === "collection",
  "KB-EVCH-01": tag("ev_charging"),
  "KB-INFRA-01": tag("barrier_or_access_failure"),

  /* ---- Landowner ---- */
  "KB-LAND-01": tag("landowner_authority_challenge"),
  "KB-LAND-02": tag("landowner_authority_challenge"),
  // Redaction challenges only arise once authority evidence is supplied.
  "KB-LAND-03": () => false,
};

/**
 * Block-level gates. These guard approved paragraphs that assert a
 * specific fact — most importantly that evidence is enclosed.
 */
export const BLOCK_GATES: Record<string, Gate> = {
  // "Evidence confirming payment is supplied with this appeal."
  "PP-PAY-002": (g) =>
    factStr(g.facts, FACT.PAYMENT_EVIDENCE) === "YES" && g.evidence.size > 0,
  // "The registered keeper has not received a Notice to Keeper..."
  "PP-POFA-002": tag("no_ntk_received"),
  // Postal timing failure.
  "PP-POFA-003": (g) =>
    g.pofa.route === "POSTAL" && g.pofa.timingStatus === "FAILED",
  // Timing failure following a Notice to Driver.
  "PP-POFA-004": (g) =>
    g.pofa.route === "WINDSCREEN" && g.pofa.timingStatus === "FAILED",
  // Content defects — never from OCR uncertainty (KB-POFA-04).
  "PP-POFA-005A": (g) => g.pofa.confirmedContentDefects.includes("VEHICLE_LAND_PERIOD"),
  "PP-POFA-005B": (g) => g.pofa.confirmedContentDefects.includes("WARNING"),
  "PP-POFA-005C": (g) => g.pofa.confirmedContentDefects.includes("CREDITOR"),
  "PP-POFA-005D": (g) => g.pofa.confirmedContentDefects.includes("AMOUNT"),
  "PP-POFA-005E": (g) => g.pofa.confirmedContentDefects.includes("INVITATION"),
  // "Driver not established + PoFA failure" — needs an actual failure.
  "PP-POFA-006": pofaDefectEstablished,
  "PP-POFA-007": pofaDefectEstablished,
  // Machine vs digital failure must match the method actually used.
  "PP-PAY-003": (g) => paymentFailed(g) && method("machine")(g),
  "PP-PAY-004": (g) => paymentFailed(g) && method("app", "online", "phone")(g),
  "PP-PAY-005": paymentFailed,
  // "The verified additional period falls within the grace period" —
  // only where the grace facts were actually given.
  "PP-GRACE-005": (g) =>
    g.facts.tags.has("grace_or_exit") &&
    factStr(g.facts, FACT.EXIT_DELAY_REASON) !== null,
  "PP-GRACE-003": (g) =>
    g.facts.tags.has("barrier_or_access_failure") ||
    g.facts.tags.has("grace_or_exit"),
  // "Independent evidence demonstrates the vehicle was not present..."
  "PP-ANPR-004": (g) => g.evidence.size > 0,
  // Multiple-visit wording needs multiple visits.
  "PP-ANPR-003": (g) =>
    g.facts.tags.has("multiple_visits_same_day") ||
    (factNum(g.facts, FACT.VISIT_COUNT) ?? 0) > 1,
  "PP-ANPR-011": (g) =>
    g.facts.tags.has("multiple_visits_same_day") ||
    (factNum(g.facts, FACT.VISIT_COUNT) ?? 0) > 1,
  // Specific discrepancy wording needs a stated discrepancy.
  "PP-ANPR-007": (g) => factStr(g.facts, FACT.CONTINUOUS_PRESENCE) !== null,
  "PP-ANPR-008": (g) => factStr(g.facts, FACT.CONTINUOUS_PRESENCE) !== null,
  // Residential wording needs the instrument.
  "AI-RES-001": agreementUploaded,
  "AI-RES-002": (g) =>
    agreementUploaded(g) &&
    factStr(g.facts, FACT.AGREEMENT_PERMIT_CLAUSE) === "NO",
  "AI-RES-003": (g) =>
    agreementUploaded(g) && factStr(g.facts, FACT.BAY_REFERENCE) !== null,
  "AI-RES-004": (g) =>
    agreementUploaded(g) &&
    factStr(g.facts, FACT.AGREEMENT_PERMIT_CLAUSE) === "NO",
  // Breakdown wording that refers to enclosed evidence.
  "AI-BREAK-001": (g) => {
    const raw = g.facts.values[FACT.BREAKDOWN_EVIDENCE];
    const ev = Array.isArray(raw) ? (raw as string[]).filter((e) => e !== "none") : [];
    return ev.length > 0 || g.evidence.size > 0;
  },
  // Permit display/admin issue wording.
  "PP-AUTH-004": tag("authorised_or_permit"),
  "PP-AUTH-006": (g) =>
    factStr(g.facts, FACT.PERMISSION_SOURCE) === "visitor_permit",
  "PP-AUTH-008": (g) =>
    factStr(g.facts, FACT.PERMISSION_SOURCE) === "hotel_or_business",
};

export function moduleAllowed(moduleId: string, g: GateInput): boolean {
  const gate = MODULE_GATES[moduleId];
  return gate ? gate(g) : true;
}

export function blockAllowed(blockId: string, g: GateInput): boolean {
  const gate = BLOCK_GATES[blockId];
  return gate ? gate(g) : true;
}
