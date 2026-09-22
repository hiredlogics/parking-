/**
 * Document triage — first-class case assessment before the appeal journey.
 *
 * Runs after (or with) extraction. Decides document type, case stage,
 * sender vs parking operator, and whether the Private Parking initial
 * appeal service is appropriate. Unsuitable documents must stop the
 * journey before adaptive questioning or payment.
 */

export type DocumentKind =
  | "INITIAL_OPERATOR_PCN"
  | "NOTICE_TO_KEEPER"
  | "WINDSCREEN_NOTICE"
  | "DEBT_RECOVERY"
  | "LETTER_OF_CLAIM"
  | "COURT_CLAIM"
  | "CCJ_OR_ENFORCEMENT"
  | "COUNCIL_OR_STATUTORY"
  | "OTHER"
  | "UNKNOWN";

export type DetectedCaseStage =
  | "INITIAL_OPERATOR_APPEAL"
  | "DEBT_RECOVERY"
  | "PRE_ACTION_LETTER_OF_CLAIM"
  | "COURT_PROCEEDINGS"
  | "ENFORCEMENT"
  | "UNKNOWN";

export type TriageServiceDecision =
  | "PRIVATE_PARKING_INITIAL_APPEAL_OK"
  /** Standard private parking appeal service is not suitable. */
  | "NOT_SUPPORTED"
  /** @deprecated Prefer NOT_SUPPORTED — still recognised by gates. */
  | "WRONG_STAGE_REDIRECT"
  | "MANUAL_REVIEW";

export interface DocumentTriageResult {
  documentKind: DocumentKind;
  caseStage: DetectedCaseStage;
  /** Who sent / headed the uploaded letter. */
  senderName: string | null;
  /**
   * Underlying parking operator when distinguishable from the sender
   * (e.g. DRP collecting for a site operator). Null if unknown or same.
   */
  parkingOperatorName: string | null;
  serviceDecision: TriageServiceDecision;
  /** Machine reason — aligned with ScopeDecision.reason where possible. */
  reasonCode: string;
  /** Customer-safe explanation. */
  detail: string;
  confidence: number;
  /** Short audit signals — not shown to customers. */
  signals: string[];
  providerId: string;
  model: string | null;
  assessedAt: string;
}

export function triageBlocksAppealJourney(
  triage: DocumentTriageResult | null | undefined,
): boolean {
  if (!triage) return false;
  return (
    triage.serviceDecision === "NOT_SUPPORTED" ||
    triage.serviceDecision === "WRONG_STAGE_REDIRECT"
  );
}
