import type { ConfirmedPcn, ExtractionResult, EvidenceItem } from "@/types";
import type {
  AppealCaseStatus,
  CaseLifecycleStatus,
  CaseOutcomeSource,
  CaseOutcomeStatus,
  CasePaymentStatus,
  DriverStatus,
  NoticeRoute,
  OperatorAta,
  RouteFamily,
} from "@/types/caseState";
import type { AnswerMap } from "@/lib/facts/types";

/**
 * Services offered.
 *
 * A second-stage appeal will be a new value here rather than a flag on
 * the existing case, so it gets its own workflow and payment gate from
 * `lib/workflow/config.ts` without special-casing.
 */
export type ServiceType =
  | "PRIVATE_PARKING_INITIAL_APPEAL";

export type SufficiencyStatus = "INCOMPLETE" | "SUFFICIENT";

/** A persisted uploaded document or evidence item. */
export interface CaseDocument {
  id: string;
  caseId: string;
  documentType: "PCN" | "EVIDENCE" | "GENERATED" | "INSTRUCTIONS";
  evidenceType: string | null;
  storageKey: string;
  storageProvider: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Content hash recorded at upload, for integrity checks. */
  sha256: string | null;
  /**
   * For a GENERATED document: the validated draft it was rendered
   * from. Makes "this PDF is the appeal we approved" provable.
   */
  sourceDraftId: string | null;
  description: string | null;
  uploadedAt: string;
  uploadedBy: string;
  /**
   * What reading this document established (services/evidence/), or null
   * when it has not been read. Held against the document, not merged
   * into the answer map, so a fact a document evidences never becomes
   * indistinguishable from one the customer asserted.
   */
  derivedFacts: DocumentDerivedFacts | null;
}

export interface DocumentDerivedFacts {
  providerId: string;
  readAt: string;
  documentSummary: string;
  /** The document is not what its upload category claimed. */
  typeMismatch: boolean;
  /** Candidate facts, before admission. Admission happens at read time. */
  candidates: Array<{
    factKey: string;
    value: unknown;
    basis: string;
    confidence: number;
  }>;
}

/**
 * Full server-side case row. PostgreSQL is authoritative; the browser
 * store is a cache of this.
 */
export interface AppealCase {
  id: string;
  publicId: string;
  customerId: string;
  serviceType: ServiceType;
  status: AppealCaseStatus;

  // Denormalised notice fields for listing/searching.
  operatorName: string | null;
  pcnNumber: string | null;
  vrm: string | null;
  parkingLocation: string | null;
  parkingEventDate: string | null;
  noticeIssueDate: string | null;
  noticeReceivedDate: string | null;
  noticeRoute: NoticeRoute;
  operatorAta: OperatorAta;
  driverStatus: DriverStatus;
  pofaRoute: string | null;

  extraction: ExtractionResult | null;
  confirmed: ConfirmedPcn | null;
  adaptiveAnswers: AnswerMap;

  /** Durable document understanding — set at extract, not overwritten on confirm. */
  documentType: string | null;
  senderName: string | null;
  parkingOperatorName: string | null;
  /** Detected stage from triage (stored in appeal_cases.case_stage). */
  caseStage: string | null;
  serviceDecision: string | null;
  /** Pre-question technical understanding snapshot. */
  caseIntelligence: import("@/lib/cases/caseIntelligence").CaseIntelligence | null;

  candidateRoutes: RouteFamily[];
  primaryRoute: RouteFamily | null;
  secondaryRoutes: RouteFamily[];
  missingFacts: string[];
  codeVersionId: string | null;

  questioningComplete: boolean;
  sufficiencyStatus: SufficiencyStatus;
  readinessCheckedAt: string | null;
  outOfScopeReason: string | null;
  outOfScopeDetail: string | null;

  paymentStatus: CasePaymentStatus;
  appealLocked: boolean;
  orderId: string | null;

  /**
   * Coarse lifecycle position, derived from `status` — never stored.
   * `lifecycleStatus = "COMPLETED"` with `outcomeStatus = "PENDING"` is
   * valid and normal: the appeal is done, the operator has not replied.
   */
  lifecycleStatus: CaseLifecycleStatus;

  /* ---------- Outcome (independent of workflow) ---------- */
  outcomeStatus: CaseOutcomeStatus;
  outcomeRecordedAt: string | null;
  outcomeSource: CaseOutcomeSource | null;
  outcomeDetail: string | null;

  /** When the initial appeal was completed and sent. */
  submittedAt: string | null;
  /** When it becomes reasonable to ask whether an outcome arrived. */
  followUpDueAt: string | null;

  /* ---------- Multi-stage linkage ---------- */
  /** 1 = initial operator appeal. A future second stage would be 2. */
  stageNumber: number;
  /**
   * The case this one continues. Lets a second-stage appeal reuse the
   * original notice, facts, answers, evidence and appeal instead of
   * duplicating the customer's information.
   */
  parentCaseId: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Customer-safe case state.
 *
 * KB §16 rule 7: module IDs, retrieval scores, internal reasoning and
 * validator information must never reach the customer. This shape
 * deliberately omits all of it — route families are translated to
 * friendly labels by the UI layer, and `missingFacts` is reduced to a
 * count.
 */
export interface CustomerCaseState {
  id: string;
  publicId: string;
  serviceType: ServiceType;
  status: AppealCaseStatus;
  extraction: ExtractionResult | null;
  confirmed: ConfirmedPcn | null;
  adaptiveAnswers: AnswerMap;
  evidence: EvidenceItem[];
  questioningComplete: boolean;
  sufficiencyStatus: SufficiencyStatus;
  /** Count only — never the internal fact keys. */
  outstandingCount: number;
  /** Customer-friendly ground labels. No route identifiers. */
  groundLabels: string[];
  outOfScope: { detail: string } | null;
  paymentStatus: CasePaymentStatus;
  appealLocked: boolean;
  /** Derived from status — safe to show, drives the portal's next step. */
  lifecycleStatus: CaseLifecycleStatus;
  /** Operator decision, or PENDING while we wait. */
  outcomeStatus: CaseOutcomeStatus;
  outcomeRecordedAt: string | null;
  submittedAt: string | null;
  /** Whether it is time to ask the customer if they have heard back. */
  followUpDue: boolean;
  createdAt: string;
  updatedAt: string;
}
