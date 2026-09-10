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

/**
 * What the parking operator decided.
 *
 * Deliberately independent of the workflow status: an appeal can be
 * fully prepared and sent while the operator has not replied, so
 * `status = UNLOCKED` with `outcomeStatus = PENDING` is the normal
 * state for roughly the first 30 days.
 *
 * PENDING     — submitted, no reply yet.
 * NO_RESPONSE — the operator never replied within the expected window.
 * ACCEPTED    — the appeal succeeded and the charge was cancelled.
 * REJECTED    — the appeal was refused. A second stage may follow.
 */
export type CaseOutcomeStatus =
  | "PENDING"
  | "NO_RESPONSE"
  | "ACCEPTED"
  | "REJECTED";

export const ALL_OUTCOME_STATUSES: readonly CaseOutcomeStatus[] = [
  "PENDING",
  "NO_RESPONSE",
  "ACCEPTED",
  "REJECTED",
] as const;

/** How we learned the outcome. */
export type CaseOutcomeSource = "CUSTOMER" | "DOCUMENT" | "ADMIN" | "SYSTEM";

/**
 * Case status — the WORKFLOW axis, and the one the portal shows.
 *
 * DERIVED, never stored. Two status columns that must agree inevitably
 * drift: one gets written, the other does not, and reporting quietly
 * lies. The stored `status` plus the submission and outcome fields are
 * the single source of truth, and this is computed from them.
 *
 * Entirely independent of `CaseOutcomeStatus`. GENERATED, SUBMITTED and
 * COMPLETED can all sit alongside `outcomeStatus = PENDING`, because the
 * work being finished says nothing about whether the operator replied.
 */
export type CaseLifecycleStatus =
  | "IN_PROGRESS"
  | "READY_FOR_PAYMENT"
  | "PAID"
  | "GENERATING"
  | "GENERATED"
  | "SUBMITTED"
  | "COMPLETED"
  | "MANUAL_REVIEW";

export const ALL_LIFECYCLE_STATUSES: readonly CaseLifecycleStatus[] = [
  "IN_PROGRESS",
  "READY_FOR_PAYMENT",
  "PAID",
  "GENERATING",
  "GENERATED",
  "SUBMITTED",
  "COMPLETED",
  "MANUAL_REVIEW",
] as const;

export function lifecycleStatusFor(
  status: AppealCaseStatus,
  opts: {
    submittedAt?: string | null;
    outcomeStatus?: CaseOutcomeStatus;
  } = {},
): CaseLifecycleStatus {
  switch (status) {
    case "MANUAL_REVIEW":
    case "OUT_OF_SCOPE":
    case "FAILED":
      return "MANUAL_REVIEW";

    case "UNLOCKED": {
      // An appeal exists. How far it has travelled depends on whether
      // it was sent, and whether the operator has since replied.
      const outcome = opts.outcomeStatus ?? "PENDING";
      if (outcome !== "PENDING") return "COMPLETED";
      return opts.submittedAt ? "SUBMITTED" : "GENERATED";
    }

    case "GENERATING":
      return "GENERATING";
    case "PAID":
      return "PAID";
    case "AWAITING_PAYMENT":
    case "READY_PREVIEW":
      return "READY_FOR_PAYMENT";

    default:
      return "IN_PROGRESS";
  }
}

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
