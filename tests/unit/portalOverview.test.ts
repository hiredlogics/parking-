/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_LIFECYCLE_STATUSES,
  lifecycleStatusFor,
  type AppealCaseStatus,
} from "@/types/caseState";
import type { AppealCase, CaseDocument } from "@/lib/cases/types";
import type { CasePayment } from "@/lib/payments/types";
import type { SessionData } from "@/lib/auth/session";

/**
 * Portal data integration.
 *
 * My Cases, My Appeals, My Documents and Invoices previously rendered
 * the V1 CRM demo store, so a customer saw seeded matters unrelated to
 * their own appeal. These cover the projection that replaced it, and
 * the workflow/outcome separation the screens rely on.
 */

const OWNER: SessionData = { userId: "cust_1", kind: "CUSTOMER" };
const ADMIN: SessionData = { userId: "adm_1", kind: "ADMIN" };

function makeCase(over: Partial<AppealCase> = {}): AppealCase {
  const status = (over.status ?? "UNLOCKED") as AppealCaseStatus;
  const submittedAt =
    over.submittedAt !== undefined ? over.submittedAt : "2026-07-20T00:00:00.000Z";
  const outcomeStatus = over.outcomeStatus ?? "PENDING";
  return {
    id: "case_1",
    publicId: "CASE-2026-000001",
    customerId: "cust_1",
    serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
    status,
    operatorName: "CitySquare Parking Management",
    pcnNumber: "CSP-1", vrm: "KT19RPL",
    parkingLocation: "Harbour Point", parkingEventDate: "2026-07-12",
    noticeIssueDate: null, noticeReceivedDate: null,
    noticeRoute: "POSTAL", operatorAta: "UNKNOWN",
    driverStatus: "UNIDENTIFIED", pofaRoute: null,
    extraction: null,
    confirmed: { pcn_number: "CSP-1" } as AppealCase["confirmed"],
    adaptiveAnswers: {}, askedQuestionIds: [],
    candidateRoutes: ["PAYMENT"], primaryRoute: "PAYMENT", secondaryRoutes: [],
    missingFacts: [], codeVersionId: null,
    questioningComplete: true, sufficiencyStatus: "SUFFICIENT",
    readinessCheckedAt: null, outOfScopeReason: null, outOfScopeDetail: null,
    paymentStatus: "PAID", appealLocked: false, orderId: null,
    outcomeStatus,
    outcomeRecordedAt: null, outcomeSource: null, outcomeDetail: null,
    submittedAt,
    followUpDueAt: "2026-08-19T00:00:00.000Z",
    stageNumber: 1, parentCaseId: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...over,
    // Derived last so an `over` status/outcome is always reflected.
    lifecycleStatus: lifecycleStatusFor(status, { submittedAt, outcomeStatus }),
  };
}

let cases: AppealCase[] = [];
let documents: Array<CaseDocument & { casePublicId: string; caseIdRef: string }> = [];
let payments: Array<CasePayment & { casePublicId: string; serviceType: string }> = [];

vi.mock("@/lib/cases/repo", () => ({
  findCasesForCustomer: async () => cases,
  listDocumentsForCustomer: async () => documents,
  findCase: async (id: string) => cases.find((c) => c.id === id) ?? null,
  listCaseDocuments: async () => [],
  addCaseEvent: async () => {},
}));

vi.mock("@/lib/payments/repo", () => ({
  listPaymentsForCustomer: async () => payments,
}));

const { buildPortalOverview } = await import("@/lib/portal/overview");

function doc(over: Partial<CaseDocument> = {}) {
  return {
    id: "doc_1", caseId: "case_1", documentType: "EVIDENCE",
    evidenceType: "payment_receipt", storageKey: "k", storageProvider: "memory",
    fileName: "receipt.pdf", mimeType: "application/pdf", sizeBytes: 10,
    sha256: "abc", sourceDraftId: null, description: null,
    uploadedAt: "2026-07-15T00:00:00.000Z", uploadedBy: "cust_1",
    ...over,
    casePublicId: "CASE-2026-000001",
    caseIdRef: "case_1",
  } as CaseDocument & { casePublicId: string; caseIdRef: string };
}

beforeEach(() => {
  cases = [makeCase()];
  documents = [doc()];
  payments = [
    {
      id: "pay_1", caseId: "case_1", provider: "demo", status: "PAID",
      amount: 29, currency: "GBP", description: "Appeal Builder",
      providerSessionId: null, providerPaymentIntent: null,
      providerCustomerId: null, checkoutUrl: null, failureReason: null,
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
      paidAt: "2026-07-19T00:00:00.000Z", failedAt: null, refundedAt: null,
      casePublicId: "CASE-2026-000001",
      serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
    },
  ];
});

/* ================== Case status vocabulary ================== */

describe("Case status vocabulary", () => {
  it("supports every status the client specified", () => {
    expect([...ALL_LIFECYCLE_STATUSES].sort()).toEqual(
      [
        "COMPLETED", "GENERATED", "GENERATING", "IN_PROGRESS",
        "MANUAL_REVIEW", "PAID", "READY_FOR_PAYMENT", "SUBMITTED",
      ].sort(),
    );
  });

  it("reports GENERATED before the appeal is sent", () => {
    expect(lifecycleStatusFor("UNLOCKED", { submittedAt: null })).toBe("GENERATED");
  });

  it("reports SUBMITTED once sent, with the outcome still unknown", () => {
    expect(
      lifecycleStatusFor("UNLOCKED", {
        submittedAt: "2026-07-20T00:00:00.000Z",
        outcomeStatus: "PENDING",
      }),
    ).toBe("SUBMITTED");
  });

  it("reports COMPLETED once an outcome is known", () => {
    for (const o of ["ACCEPTED", "REJECTED", "NO_RESPONSE"] as const) {
      expect(
        lifecycleStatusFor("UNLOCKED", {
          submittedAt: "2026-07-20T00:00:00.000Z",
          outcomeStatus: o,
        }),
      ).toBe("COMPLETED");
    }
  });

  it("allows GENERATED and SUBMITTED alongside a PENDING outcome", () => {
    // The client's explicit requirement: work finished, operator silent.
    const generated = makeCase({ submittedAt: null, outcomeStatus: "PENDING" });
    const submitted = makeCase({ outcomeStatus: "PENDING" });
    expect(generated.lifecycleStatus).toBe("GENERATED");
    expect(submitted.lifecycleStatus).toBe("SUBMITTED");
    expect(generated.outcomeStatus).toBe("PENDING");
    expect(submitted.outcomeStatus).toBe("PENDING");
  });

  it("maps the payment gate and generation states", () => {
    expect(lifecycleStatusFor("AWAITING_PAYMENT")).toBe("READY_FOR_PAYMENT");
    expect(lifecycleStatusFor("READY_PREVIEW")).toBe("READY_FOR_PAYMENT");
    expect(lifecycleStatusFor("PAID")).toBe("PAID");
    expect(lifecycleStatusFor("GENERATING")).toBe("GENERATING");
  });

  it("maps every review state to MANUAL_REVIEW", () => {
    for (const s of ["MANUAL_REVIEW", "OUT_OF_SCOPE", "FAILED"] as AppealCaseStatus[]) {
      expect(lifecycleStatusFor(s), s).toBe("MANUAL_REVIEW");
    }
  });
});

/* ==================== Portal projection ==================== */

describe("Portal overview", () => {
  it("requires a customer session", async () => {
    expect((await buildPortalOverview({})).ok).toBe(false);
    const admin = await buildPortalOverview(ADMIN);
    expect(admin.ok).toBe(false);
    if (!admin.ok) expect(admin.status).toBe(403);
  });

  it("returns the customer's real cases", async () => {
    const res = await buildPortalOverview(OWNER);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.overview.cases).toHaveLength(1);
    expect(res.overview.cases[0].publicId).toBe("CASE-2026-000001");
    expect(res.overview.cases[0].caseStatusLabel).toBe("Appeal sent");
  });

  it("derives appeals from cases rather than a second record", async () => {
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.appeals).toHaveLength(1);
    expect(res.overview.appeals[0].caseId).toBe("case_1");
    expect(res.overview.appeals[0].downloadable).toBe(true);
  });

  it("excludes cases that never reached confirmation from My Appeals", async () => {
    cases = [makeCase({ confirmed: null, status: "AWAITING_CONFIRMATION" })];
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    // An abandoned upload is a case, not an appeal.
    expect(res.overview.cases).toHaveLength(1);
    expect(res.overview.appeals).toHaveLength(0);
  });

  it("gives every document ownership-checked view and download links", async () => {
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    const d = res.overview.documents[0];
    // One route serves all document types; the storage key is never
    // exposed to the browser.
    expect(d.downloadUrl).toBe(
      "/api/cases/case_1/documents/doc_1?disposition=attachment",
    );
    expect(d.viewUrl).toBe(
      "/api/cases/case_1/documents/doc_1?disposition=inline",
    );
    expect(JSON.stringify(d)).not.toContain("storageKey");
  });

  it("labels the parking notice and keeps it retrievable", async () => {
    documents = [doc({ id: "doc_2", documentType: "PCN", evidenceType: null })];
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.documents[0].category).toBe("Parking notice");
    expect(res.overview.documents[0].isFinalAppeal).toBe(false);
  });

  it("labels the final appeal PDF so My Documents can highlight it", async () => {
    documents = [
      doc({
        id: "doc_3",
        documentType: "GENERATED",
        evidenceType: null,
        fileName: "Parking-Appeal-CSP1.pdf",
        mimeType: "application/pdf",
        sourceDraftId: "draft_1",
      }),
    ];
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    const d = res.overview.documents[0];
    expect(d.category).toBe("Final Appeal PDF");
    expect(d.isFinalAppeal).toBe(true);
    expect(d.downloadUrl).toContain("disposition=attachment");
    expect(d.viewUrl).toContain("disposition=inline");
  });

  it("builds invoices from the payment gate's own records", async () => {
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    const inv = res.overview.invoices[0];
    expect(inv.amount).toBe(29);
    expect(inv.status).toBe("PAID");
    // The customer recognises the case reference, not an internal id.
    expect(inv.reference).toBe("CASE-2026-000001");
  });

  it("summarises counts the dashboard needs", async () => {
    cases = [
      makeCase({ id: "a", outcomeStatus: "ACCEPTED" }),
      makeCase({ id: "b", outcomeStatus: "REJECTED" }),
      makeCase({ id: "c", outcomeStatus: "PENDING" }),
      makeCase({ id: "d", status: "AWAITING_PAYMENT", submittedAt: null }),
    ];
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    const s = res.overview.summary;
    expect(s.totalCases).toBe(4);
    expect(s.accepted).toBe(1);
    expect(s.rejected).toBe(1);
    expect(s.awaitingOutcome).toBe(1);
    expect(s.awaitingPayment).toBe(1);
  });

  it("never leaks internal route identifiers to the customer", async () => {
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    for (const label of res.overview.cases[0].groundLabels) {
      expect(label).not.toMatch(/^(PAYMENT|POFA|BREAKDOWN|SIGNAGE)$/);
    }
  });

  it("carries second-stage linkage through to the portal shape", async () => {
    cases = [makeCase({ stageNumber: 2, parentCaseId: "case_0" })];
    const res = await buildPortalOverview(OWNER);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.cases[0].stageNumber).toBe(2);
    expect(res.overview.cases[0].parentCaseId).toBe("case_0");
  });
});
