import type { ConfirmedPcn, ExtractionResult, EvidenceItem } from "@/types";
import type {
  AppealCaseStatus,
  CasePaymentStatus,
  DriverStatus,
  NoticeRoute,
  OperatorAta,
  RouteFamily,
} from "@/types/caseState";
import type { AnswerMap } from "@/lib/questions/types";

export type ServiceType =
  | "PRIVATE_PARKING_INITIAL_APPEAL";

export type SufficiencyStatus = "INCOMPLETE" | "SUFFICIENT";

/** A persisted uploaded document or evidence item. */
export interface CaseDocument {
  id: string;
  caseId: string;
  documentType: "PCN" | "EVIDENCE" | "GENERATED";
  evidenceType: string | null;
  storageKey: string;
  storageProvider: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Content hash recorded at upload, for integrity checks. */
  sha256: string | null;
  description: string | null;
  uploadedAt: string;
  uploadedBy: string;
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
  askedQuestionIds: string[];

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
  askedQuestionIds: string[];
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
  createdAt: string;
  updatedAt: string;
}
