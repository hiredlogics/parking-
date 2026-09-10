import type { SessionData } from "@/lib/auth/session";
import * as caseRepo from "@/lib/cases/repo";
import { listPaymentsForCustomer } from "@/lib/payments/repo";
import { lifecycleLabel, routeLabels } from "@/lib/cases/labels";
import { isFollowUpDue } from "@/lib/cases/outcome";
import { EVIDENCE_TYPE_LABELS } from "@/types";
import type {
  CaseLifecycleStatus,
  CaseOutcomeStatus,
  CasePaymentStatus,
} from "@/types/caseState";

/**
 * Portal overview — everything the existing customer screens display,
 * built from the real case model.
 *
 * My Cases, My Appeals, My Documents and Invoices previously read the
 * V1 CRM demo store, so they showed seeded data unrelated to the
 * customer's actual appeal. These projections are shaped to what those
 * screens already render, so they connect to real data without the UI
 * changing.
 *
 * Note there is no separate billing or document model: invoices come
 * from `case_payments` (the rows the payment gate itself writes) and
 * documents from `case_documents_meta`. A future CRM reads the same
 * tables rather than a parallel copy.
 */

export interface PortalCaseRow {
  id: string;
  publicId: string;
  serviceType: string;
  caseStatus: CaseLifecycleStatus;
  caseStatusLabel: string;
  outcomeStatus: CaseOutcomeStatus;
  operatorName: string | null;
  pcnNumber: string | null;
  vrm: string | null;
  parkingEventDate: string | null;
  groundLabels: string[];
  submittedAt: string | null;
  followUpDue: boolean;
  stageNumber: number;
  parentCaseId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row per case that has produced, or will produce, an appeal. */
export interface PortalAppealRow {
  id: string;
  caseId: string;
  pcnReference: string | null;
  vrm: string | null;
  operator: string | null;
  service: string;
  appealStatus: string;
  outcomeStatus: CaseOutcomeStatus;
  /** True once the letter exists and can be downloaded. */
  downloadable: boolean;
  createdAt: string;
}

export interface PortalDocumentRow {
  id: string;
  caseId: string;
  casePublicId: string;
  name: string;
  category: string;
  uploadedAt: string;
  /** Server routes that re-check ownership on every request. */
  downloadUrl: string;
  viewUrl: string;
  /** True for the final appeal PDF. */
  isFinalAppeal: boolean;
}

export interface PortalInvoiceRow {
  id: string;
  caseId: string;
  reference: string;
  service: string;
  amount: number;
  currency: string;
  status: CasePaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface PortalOverview {
  cases: PortalCaseRow[];
  appeals: PortalAppealRow[];
  documents: PortalDocumentRow[];
  invoices: PortalInvoiceRow[];
  summary: {
    totalCases: number;
    awaitingPayment: number;
    appealsReady: number;
    awaitingOutcome: number;
    accepted: number;
    rejected: number;
  };
}

export type OverviewFailure = {
  ok: false;
  status: 401 | 403;
  code: string;
  message: string;
};

const SERVICE_LABELS: Record<string, string> = {
  PRIVATE_PARKING_INITIAL_APPEAL: "Private Parking Appeal",
};

function serviceLabel(serviceType: string): string {
  return SERVICE_LABELS[serviceType] ?? serviceType.replace(/_/g, " ");
}

/** Categories the portal shows for a document. */
function documentCategory(
  documentType: string,
  evidenceType: string | null,
): string {
  if (documentType === "PCN") return "Parking notice";
  if (documentType === "GENERATED") return "Final Appeal PDF";
  return (
    (EVIDENCE_TYPE_LABELS as Record<string, string>)[evidenceType ?? ""] ??
    "Supporting evidence"
  );
}

export async function buildPortalOverview(
  session: SessionData,
): Promise<{ ok: true; overview: PortalOverview } | OverviewFailure> {
  if (!session.userId) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHENTICATED",
      message: "Please sign in to continue.",
    };
  }
  if (session.kind === "ADMIN") {
    return {
      ok: false,
      status: 403,
      code: "CUSTOMER_REQUIRED",
      message: "This view is for customers.",
    };
  }

  const customerId = session.userId;
  const [cases, documents, payments] = await Promise.all([
    caseRepo.findCasesForCustomer(customerId, 100),
    caseRepo.listDocumentsForCustomer(customerId),
    listPaymentsForCustomer(customerId),
  ]);

  const caseRows: PortalCaseRow[] = cases.map((c) => ({
    id: c.id,
    publicId: c.publicId,
    serviceType: c.serviceType,
    caseStatus: c.lifecycleStatus,
    caseStatusLabel: lifecycleLabel(c.lifecycleStatus),
    outcomeStatus: c.outcomeStatus,
    operatorName: c.operatorName,
    pcnNumber: c.pcnNumber,
    vrm: c.vrm,
    parkingEventDate: c.parkingEventDate,
    groundLabels: routeLabels(c.candidateRoutes),
    submittedAt: c.submittedAt,
    followUpDue: isFollowUpDue(c),
    stageNumber: c.stageNumber,
    parentCaseId: c.parentCaseId,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));

  /*
   * An appeal is a view of a case, not a second record. Cases that have
   * not reached questioning yet are excluded so the list is not padded
   * with abandoned uploads.
   */
  const appealRows: PortalAppealRow[] = cases
    .filter((c) => c.confirmed !== null)
    .map((c) => ({
      id: `appeal_${c.id}`,
      caseId: c.id,
      pcnReference: c.pcnNumber,
      vrm: c.vrm,
      operator: c.operatorName,
      service: serviceLabel(c.serviceType),
      appealStatus: lifecycleLabel(c.lifecycleStatus),
      outcomeStatus: c.outcomeStatus,
      downloadable:
        c.lifecycleStatus === "GENERATED" ||
        c.lifecycleStatus === "SUBMITTED" ||
        c.lifecycleStatus === "COMPLETED",
      createdAt: c.createdAt,
    }));

  const documentRows: PortalDocumentRow[] = documents.map((d) => ({
    id: d.id,
    caseId: d.caseIdRef,
    casePublicId: d.casePublicId,
    name: d.fileName,
    category: documentCategory(d.documentType, d.evidenceType),
    uploadedAt: d.uploadedAt,
    // Evidence has an ownership-checked download route; the PCN and
    // generated files are reached from the case itself.
    // One ownership-checked route serves every document type. The
    // storage key never reaches the browser.
    downloadUrl: `/api/cases/${d.caseIdRef}/documents/${d.id}?disposition=attachment`,
    viewUrl: `/api/cases/${d.caseIdRef}/documents/${d.id}?disposition=inline`,
    isFinalAppeal: d.documentType === "GENERATED",
  }));

  const invoiceRows: PortalInvoiceRow[] = payments.map((p) => ({
    id: p.id,
    caseId: p.caseId,
    // The case reference is what a customer recognises.
    reference: p.casePublicId,
    service: p.description ?? serviceLabel(p.serviceType),
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
  }));

  return {
    ok: true,
    overview: {
      cases: caseRows,
      appeals: appealRows,
      documents: documentRows,
      invoices: invoiceRows,
      summary: {
        totalCases: caseRows.length,
        awaitingPayment: caseRows.filter(
          (c) => c.caseStatus === "READY_FOR_PAYMENT",
        ).length,
        appealsReady: appealRows.filter((a) => a.downloadable).length,
        awaitingOutcome: caseRows.filter(
          (c) => c.submittedAt !== null && c.outcomeStatus === "PENDING",
        ).length,
        accepted: caseRows.filter((c) => c.outcomeStatus === "ACCEPTED").length,
        rejected: caseRows.filter((c) => c.outcomeStatus === "REJECTED").length,
      },
    },
  };
}
