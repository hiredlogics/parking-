/**
 * Durable Case State — server source of truth for private parking
 * INITIAL_OPERATOR_APPEAL cases.
 *
 * Phase 1 introduces the types and DB tables. The live UI still uses
 * Zustand until the adaptive question API (Phase 4) dual-writes here.
 *
 * Scope lock: PRIVATE PARKING INITIAL OPERATOR APPEALS ONLY.
 */

import type { CaseStage, NoticeRoute } from "./pcn";

export type { CaseStage, NoticeRoute };

export type OperatorAta = "BPA" | "IPC" | "UNKNOWN";
export type DriverStatus = "UNIDENTIFIED" | "IDENTIFIED" | "UNKNOWN";

export type AppealCaseStatus =
  | "DRAFT"
  | "EXTRACTING"
  | "AWAITING_CONFIRMATION"
  | "QUESTIONING"
  | "ANALYSING"
  | "GENERATING"
  | "READY_PREVIEW"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "UNLOCKED"
  | "MANUAL_REVIEW"
  | "OUT_OF_SCOPE"
  | "FAILED";

/**
 * Payment state for a case.
 *
 * NOT_REQUIRED      — the service workflow has no payment gate.
 * UNPAID            — gate applies, nothing started.
 * CHECKOUT_CREATED  — a provider checkout session exists.
 * PENDING           — provider is processing (e.g. async settlement).
 * PAID              — provider-verified. The ONLY entitling state.
 * FAILED / REFUNDED — terminal non-entitling states.
 */
export type CasePaymentStatus =
  | "NOT_REQUIRED"
  | "UNPAID"
  | "CHECKOUT_CREATED"
  | "PENDING"
  | "PAID"
  | "REFUNDED"
  | "FAILED";

export type FactSource =
  | "document"
  | "customer"
  | "system"
  | "admin";

export type GenerationJobStatus =
  | "QUEUED"
  | "ANALYSING"
  | "RETRIEVING"
  | "DRAFTING"
  | "VALIDATING"
  | "GENERATING_PDF"
  | "READY"
  | "MANUAL_REVIEW"
  | "FAILED";

/**
 * Provenanced fact — never overwrite extraction silently with customer
 * corrections; store both and mark confirmation.
 */
export interface FactProvenance<T = unknown> {
  field: string;
  value: T | null;
  source: FactSource;
  documentId?: string;
  confidence?: number;
  customerConfirmed: boolean;
  updatedAt: string;
}

export type RouteFamily =
  | "POFA"
  | "PAYMENT"
  | "KEYING"
  | "CONSIDERATION"
  | "GRACE"
  | "ANPR"
  | "AUTHORIZATION"
  | "PERMIT"
  | "BREAKDOWN"
  | "RESIDENTIAL"
  | "SIGNAGE"
  | "EQUALITY"
  | "HOSPITAL"
  | "LOADING"
  | "DROP_OFF"
  | "EV_CHARGING"
  | "INFRASTRUCTURE"
  | "LANDOWNER";

export interface EvidenceInventoryItem {
  id: string;
  type: string;
  storageKey?: string;
  fileName?: string;
  description?: string;
}

/**
 * In-memory / API representation of Case State.
 * Persisted across `appeal_cases` + related tables.
 */
export interface CaseState {
  caseId: string;
  publicId: string;

  documentFacts: Record<string, FactProvenance>;
  confirmedFacts: Record<string, FactProvenance>;
  customerAnswers: Record<string, unknown>;
  evidenceInventory: EvidenceInventoryItem[];

  driverStatus: DriverStatus;
  noticeRoute: NoticeRoute;
  pofaRoute?: string;
  operatorAta?: OperatorAta;

  potentialRoutes: RouteFamily[];
  confirmedRoutes: RouteFamily[];

  missingFacts: string[];
  prohibitedClaims: string[];

  questioningComplete: boolean;
  appealLocked: boolean;
  paymentStatus: CasePaymentStatus;
  status: AppealCaseStatus;
  caseStage: CaseStage;
}

export interface AppealCaseRow {
  id: string;
  publicId: string;
  customerId: string;
  status: AppealCaseStatus;
  operatorName: string | null;
  pcnNumber: string | null;
  vrm: string | null;
  parkingLocation: string | null;
  parkingEventDate: string | null;
  noticeIssueDate: string | null;
  noticeReceivedDate: string | null;
  noticeRoute: NoticeRoute;
  operatorAta: OperatorAta;
  caseStage: CaseStage;
  driverStatus: DriverStatus;
  pofaRoute: string | null;
  paymentStatus: CasePaymentStatus;
  appealLocked: boolean;
  orderId: string | null;
  createdAt: string;
  updatedAt: string;
}
