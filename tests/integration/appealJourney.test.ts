/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfirmedPcn } from "@/types";
import type { AppealCase, CaseDocument } from "@/lib/cases/types";
import type { SessionData } from "@/lib/auth/session";
import type { GenerationResult } from "@/lib/generation/engine";
import { lifecycleStatusFor } from "@/types/caseState";

/**
 * AI-6 — full appeal journey acceptance.
 *
 * Drives the real service layer from a paid case through analysis,
 * validated draft, PDF generation, storage, document metadata, and out
 * into the four portal screens — asserting every record resolves back
 * to the SAME customer and case.
 *
 * The acceptance gate is the final PDF appearing in My Documents and
 * being retrievable. Postgres and the model are mocked; everything
 * between them is the real code path.
 */

const CUSTOMER_A = "cust_A";
const CUSTOMER_B = "cust_B";
const CASE_ID = "case_e2e_1";

const SESSION_A: SessionData = { userId: CUSTOMER_A, kind: "CUSTOMER" };
const SESSION_B: SessionData = { userId: CUSTOMER_B, kind: "CUSTOMER" };
const ANON: SessionData = {};

const CONFIRMED: ConfirmedPcn = {
  operator_name: "CitySquare Parking Management",
  pcn_number: "CSP-120726-73104",
  vrm: "KT19RPL",
  parking_location: "Harbour Point, Bristol",
  parking_event_date: "2026-07-12",
  notice_issue_date: "2026-07-18",
  notice_received_date: "2026-07-22",
  notice_route: "POSTAL",
  alleged_breach: "Failure to make a valid payment",
  confirmedAt: "2026-07-23T00:00:00.000Z",
} as ConfirmedPcn;

/* ------------------------------ Fake DB ------------------------------ */

let cases: Record<string, AppealCase> = {};
let documents: CaseDocument[] = [];
let drafts: Array<Record<string, unknown> & {
  id: string; caseId: string; status: string; body: string | null;
  paragraphs: Array<{ id: string; text: string }>;
  version: number; supersededAt: string | null;
}> = [];
let events: Array<{ caseId: string; eventType: string }> = [];
let docSeq = 0;

function makeCase(over: Partial<AppealCase> = {}): AppealCase {
  const status = over.status ?? "PAID";
  return {
    id: CASE_ID, publicId: "CASE-2026-000001", customerId: CUSTOMER_A,
    serviceType: "PRIVATE_PARKING_INITIAL_APPEAL", status,
    operatorName: CONFIRMED.operator_name ?? null,
    pcnNumber: CONFIRMED.pcn_number ?? null, vrm: CONFIRMED.vrm ?? null,
    parkingLocation: CONFIRMED.parking_location ?? null,
    parkingEventDate: CONFIRMED.parking_event_date ?? null,
    noticeIssueDate: CONFIRMED.notice_issue_date ?? null,
    noticeReceivedDate: CONFIRMED.notice_received_date ?? null,
    noticeRoute: "POSTAL", operatorAta: "UNKNOWN",
    driverStatus: "UNIDENTIFIED", pofaRoute: null,
    extraction: null, confirmed: CONFIRMED,
    adaptiveAnswers: {}, askedQuestionIds: [],
    candidateRoutes: ["PAYMENT"], primaryRoute: "PAYMENT", secondaryRoutes: [],
    missingFacts: [], codeVersionId: "CODE-SINGLE-V1",
    questioningComplete: true, sufficiencyStatus: "SUFFICIENT",
    readinessCheckedAt: null, outOfScopeReason: null, outOfScopeDetail: null,
    // PAID is what entitles generation.
    paymentStatus: "PAID", appealLocked: false, orderId: null,
    lifecycleStatus: lifecycleStatusFor(status),
    outcomeStatus: "PENDING", outcomeRecordedAt: null,
    outcomeSource: null, outcomeDetail: null,
    submittedAt: null, followUpDueAt: null,
    stageNumber: 1, parentCaseId: null,
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...over,
  };
}

vi.mock("@/lib/db/pool", () => ({ hasDb: () => true, getSql: () => null }));
vi.mock("@/lib/db/schema", () => ({ ensureSchema: async () => {} }));

/**
 * The real rowToCase recomputes lifecycleStatus on every read, so the
 * fake must too — otherwise a stored object carries a stale derived
 * value and the mock stops representing the system.
 */
function readCase(c: AppealCase): AppealCase {
  return {
    ...c,
    lifecycleStatus: lifecycleStatusFor(c.status, {
      submittedAt: c.submittedAt,
      outcomeStatus: c.outcomeStatus,
    }),
  };
}

vi.mock("@/lib/cases/repo", () => ({
  findCase: async (id: string) => (cases[id] ? readCase(cases[id]) : null),
  findCasesForCustomer: async (customerId: string) =>
    Object.values(cases)
      .filter((c) => c.customerId === customerId)
      .map(readCase),
  listCaseDocuments: async (caseId: string, type?: string) =>
    documents.filter((d) => d.caseId === caseId && (!type || d.documentType === type)),
  findCaseDocument: async (id: string) => documents.find((d) => d.id === id) ?? null,
  listDocumentsForCustomer: async (customerId: string) =>
    documents
      .filter((d) => cases[d.caseId]?.customerId === customerId)
      .map((d) => ({ ...d, casePublicId: cases[d.caseId].publicId, caseIdRef: d.caseId })),
  findGeneratedDocumentForDraft: async (caseId: string, draftId: string) =>
    documents.find(
      (d) => d.caseId === caseId && d.sourceDraftId === draftId &&
        d.documentType === "GENERATED",
    ) ?? null,
  addCaseDocument: async (input: Record<string, unknown>) => {
    docSeq += 1;
    const doc = {
      id: `doc_${docSeq}`,
      uploadedAt: "2026-07-24T00:00:00.000Z",
      evidenceType: null, description: null, sha256: null, sourceDraftId: null,
      ...input,
    } as unknown as CaseDocument;
    documents.push(doc);
    return doc;
  },
  addCaseEvent: async (e: { caseId: string; eventType: string }) => {
    events.push({ caseId: e.caseId, eventType: e.eventType });
  },
  setCaseStatus: async (id: string, status: string) => {
    cases[id] = { ...cases[id], status: status as AppealCase["status"] };
  },
  markSubmitted: async (id: string) => {
    cases[id] = {
      ...cases[id],
      submittedAt: "2026-07-24T00:00:00.000Z",
      followUpDueAt: "2026-08-23T00:00:00.000Z",
    };
  },
}));

vi.mock("@/lib/cases/draftRepo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/cases/draftRepo")>(
    "@/lib/cases/draftRepo",
  );
  return {
    ...actual,
    findCurrentDraft: async (caseId: string) =>
      drafts.filter((d) => d.caseId === caseId && !d.supersededAt).at(-1) ?? null,
    findReleasedDraft: async (caseId: string) => {
      const d = drafts.filter((x) => x.caseId === caseId && !x.supersededAt).at(-1);
      return d && d.status === "READY" && d.body ? d : null;
    },
    listDraftsForCase: async (caseId: string) =>
      drafts.filter((d) => d.caseId === caseId),
    saveDraft: async (caseId: string, result: GenerationResult) => {
      for (const d of drafts) if (!d.supersededAt) d.supersededAt = "now";
      const row = {
        id: `draft_${drafts.length + 1}`,
        caseId, version: drafts.length + 1,
        status: result.status,
        body: result.body,
        paragraphs: result.body ? actual.toParagraphs(result.body) : [],
        moduleIds: result.moduleIds,
        primaryRoute: result.analysis.primaryRoute,
        secondaryRoutes: result.analysis.secondaryRoutes ?? [],
        codeVersionId: result.analysis.codeVersionId ?? null,
        pofaRoute: null,
        providerId: result.provider?.providerId ?? null,
        promptVersion: result.provider?.promptVersion ?? null,
        model: result.provider?.model ?? null,
        bespoke: result.provider?.bespoke ?? false,
        validation: null, checklist: null,
        warnings: result.warnings, attempts: 1,
        blockReason: result.reason, blockDetail: result.detail,
        generationVersion: result.generationVersion,
        createdAt: "2026-07-24T00:00:00.000Z",
        supersededAt: null,
      };
      drafts.push(row);
      return row as never;
    },
  };
});

vi.mock("@/lib/kb/audit", () => ({ insertAuditEvent: async () => {} }));
vi.mock("@/lib/generation/manualReview", () => ({
  openManualReview: async () => "rev_1",
}));
vi.mock("@/lib/payments/repo", () => ({
  listPaymentsForCustomer: async (customerId: string) =>
    customerId === CUSTOMER_A
      ? [
          {
            id: "pay_1", caseId: CASE_ID, provider: "demo", status: "PAID",
            amount: 29, currency: "GBP", description: "Appeal Builder",
            providerSessionId: null, providerPaymentIntent: null,
            providerCustomerId: null, checkoutUrl: null, failureReason: null,
            createdAt: "2026-07-23T00:00:00.000Z",
            updatedAt: "2026-07-23T00:00:00.000Z",
            paidAt: "2026-07-23T00:00:00.000Z", failedAt: null, refundedAt: null,
            casePublicId: "CASE-2026-000001",
            serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
          },
        ]
      : [],
  findPaymentForCase: async () => null,
}));

/** Deterministic drafting: AI-7 stays off, per instruction. */
const generateSpy = vi.fn();
vi.mock("@/lib/generation/engine", () => ({
  generateValidatedAppeal: (...a: unknown[]) => generateSpy(...a),
  GENERATION_VERSION: "generation-v1",
}));

function readyResult(): GenerationResult {
  return {
    status: "READY",
    body:
      "The registered keeper appeals this charge.\n\n" +
      "A payment was made for the parking event in question.\n\n" +
      "The operator is asked to cancel the charge.",
    analysis: {
      primaryRoute: "PAYMENT", secondaryRoutes: [],
      codeVersionId: "CODE-SINGLE-V1", pofa: { route: "PARA_9" },
    } as unknown as GenerationResult["analysis"],
    attempts: [], reason: null, detail: null,
    moduleIds: ["KB-PAY-01"],
    provider: {
      providerId: "deterministic", promptVersion: "draft-v1",
      model: null, bespoke: false,
    },
    warnings: [], generationVersion: "generation-v1",
  };
}

const { getAppealForCase } = await import("@/lib/generation/caseGeneration");
const { ensureFinalAppealDocument, getCaseDocumentDelivery } = await import(
  "@/lib/cases/finalDocument"
);
const { buildPortalOverview } = await import("@/lib/portal/overview");
const { resetStorageProvider } = await import("@/services/storage");

beforeEach(() => {
  cases = { [CASE_ID]: makeCase() };
  documents = [
    {
      id: "doc_pcn", caseId: CASE_ID, documentType: "PCN",
      evidenceType: null, storageKey: `cases/${CASE_ID}/evidence/k-notice.pdf`,
      storageProvider: "memory", fileName: "notice.pdf",
      mimeType: "application/pdf", sizeBytes: 100, sha256: "a",
      sourceDraftId: null, description: null,
      uploadedAt: "2026-07-23T00:00:00.000Z", uploadedBy: CUSTOMER_A,
    },
  ];
  drafts = [];
  events = [];
  docSeq = 100;
  generateSpy.mockReset();
  generateSpy.mockResolvedValue(readyResult());
  delete process.env.STORAGE_PROVIDER;
  resetStorageProvider();
});

/* ==================== The complete journey ==================== */

describe("Complete appeal journey — paid case to portal", () => {
  it("generates, validates, persists the draft and produces the PDF", async () => {
    const appeal = await getAppealForCase(CASE_ID, SESSION_A);
    expect(appeal.ok).toBe(true);
    if (!appeal.ok) return;
    expect(appeal.appeal.status).toBe("READY");
    expect(appeal.appeal.paragraphs.length).toBeGreaterThan(0);

    // Validated draft persisted.
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("READY");

    // Final PDF document row created against the SAME case.
    const generated = documents.filter((d) => d.documentType === "GENERATED");
    expect(generated).toHaveLength(1);
    expect(generated[0].caseId).toBe(CASE_ID);
    expect(generated[0].mimeType).toBe("application/pdf");
    expect(generated[0].sizeBytes).toBeGreaterThan(0);
    expect(generated[0].sha256).toBeTruthy();
    // Tied to the exact validated draft.
    expect(generated[0].sourceDraftId).toBe(drafts[0].id);
    expect(events.map((e) => e.eventType)).toContain("PDF_GENERATED");
  });

  it("produces a real PDF from the persisted validated text", async () => {
    await getAppealForCase(CASE_ID, SESSION_A);
    const doc = documents.find((d) => d.documentType === "GENERATED")!;
    const delivery = await getCaseDocumentDelivery(CASE_ID, SESSION_A, doc.id);
    expect(delivery.ok).toBe(true);
    if (!delivery.ok || delivery.delivery.kind !== "stream") return;
    const head = String.fromCharCode(
      ...delivery.delivery.object.bytes.slice(0, 5),
    );
    expect(head).toBe("%PDF-");
  });

  it("NEVER re-renders or re-drafts on a repeat request", async () => {
    await getAppealForCase(CASE_ID, SESSION_A);
    const firstId = documents.find((d) => d.documentType === "GENERATED")!.id;

    await getAppealForCase(CASE_ID, SESSION_A);
    const again = await ensureFinalAppealDocument(CASE_ID, SESSION_A);

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.final.created).toBe(false);
    expect(again.final.document.id).toBe(firstId);
    // One drafting call, one stored document, for the life of the draft.
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(1);
  });

  it("marks the case submitted, starting the outcome clock", async () => {
    await getAppealForCase(CASE_ID, SESSION_A);
    expect(cases[CASE_ID].submittedAt).toBeTruthy();
    expect(cases[CASE_ID].status).toBe("UNLOCKED");
  });
});

/* ========================= Portal screens ========================= */

describe("Portal shows the completed case", () => {
  beforeEach(async () => {
    await getAppealForCase(CASE_ID, SESSION_A);
  });

  it("My Cases shows the case", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.cases).toHaveLength(1);
    expect(res.overview.cases[0].id).toBe(CASE_ID);
  });

  it("My Appeals shows the appeal for that case", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.appeals).toHaveLength(1);
    expect(res.overview.appeals[0].caseId).toBe(CASE_ID);
    expect(res.overview.appeals[0].downloadable).toBe(true);
  });

  it("My Documents shows the final appeal PDF", async () => {
    // The acceptance gate.
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    const final = res.overview.documents.find((d) => d.isFinalAppeal);
    expect(final).toBeDefined();
    expect(final!.category).toBe("Final Appeal PDF");
    expect(final!.casePublicId).toBe("CASE-2026-000001");
  });

  it("gives the final PDF working View and Download links", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    const final = res.overview.documents.find((d) => d.isFinalAppeal)!;
    expect(final.viewUrl).toContain("disposition=inline");
    expect(final.downloadUrl).toContain("disposition=attachment");

    for (const url of [final.viewUrl, final.downloadUrl]) {
      const docId = url.split("/documents/")[1].split("?")[0];
      const delivery = await getCaseDocumentDelivery(CASE_ID, SESSION_A, docId);
      expect(delivery.ok, url).toBe(true);
    }
  });

  it("never exposes a raw storage key to the browser", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    const payload = JSON.stringify(res.overview);
    expect(payload).not.toContain("storageKey");
    expect(payload).not.toContain("cases/case_e2e_1/evidence/");
  });

  it("Invoices shows the payment for the same case", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.invoices).toHaveLength(1);
    expect(res.overview.invoices[0].caseId).toBe(CASE_ID);
    expect(res.overview.invoices[0].status).toBe("PAID");
  });

  it("resolves every record to the SAME customer and case", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    const o = res.overview;
    expect(o.cases[0].id).toBe(CASE_ID);
    expect(o.appeals[0].caseId).toBe(CASE_ID);
    for (const d of o.documents) expect(d.caseId).toBe(CASE_ID);
    expect(o.invoices[0].caseId).toBe(CASE_ID);
    expect(cases[CASE_ID].customerId).toBe(CUSTOMER_A);
  });
});

/* ============================ Security ============================ */

describe("Document security", () => {
  let finalDocId = "";

  beforeEach(async () => {
    await getAppealForCase(CASE_ID, SESSION_A);
    finalDocId = documents.find((d) => d.documentType === "GENERATED")!.id;
  });

  it("Customer A can retrieve their own PDF", async () => {
    const res = await getCaseDocumentDelivery(CASE_ID, SESSION_A, finalDocId);
    expect(res.ok).toBe(true);
  });

  it("Customer B cannot retrieve Customer A's PDF", async () => {
    const res = await getCaseDocumentDelivery(CASE_ID, SESSION_B, finalDocId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("a signed-out visitor is refused", async () => {
    const res = await getCaseDocumentDelivery(CASE_ID, ANON, finalDocId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("Customer B sees none of Customer A's data in the portal", async () => {
    const res = await buildPortalOverview(SESSION_B);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.cases).toHaveLength(0);
    expect(res.overview.documents).toHaveLength(0);
    expect(res.overview.invoices).toHaveLength(0);
  });

  it("an UNPAID case cannot retrieve the protected final appeal", async () => {
    // The stored PDF exists, but entitlement is re-checked on delivery.
    cases[CASE_ID] = { ...cases[CASE_ID], paymentStatus: "UNPAID" };
    const res = await getCaseDocumentDelivery(CASE_ID, SESSION_A, finalDocId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(402);
  });

  it("an unpaid case cannot even reach generation", async () => {
    cases = { [CASE_ID]: makeCase({ paymentStatus: "UNPAID", status: "AWAITING_PAYMENT" }) };
    drafts = []; documents = [];
    generateSpy.mockClear();
    const res = await getAppealForCase(CASE_ID, SESSION_A);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(402);
    // No AI call, no draft, no PDF.
    expect(generateSpy).not.toHaveBeenCalled();
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(0);
  });
});

/* ==================== Validation failure ==================== */

describe("Validation failure cannot release a PDF", () => {
  it("produces no document when validation blocks release", async () => {
    generateSpy.mockResolvedValue({
      ...readyResult(),
      status: "MANUAL_REVIEW",
      body: null,
      reason: "VALIDATION_FAILED",
      detail: "Blocking validators: VAL-DRIVER.",
    });

    const appeal = await getAppealForCase(CASE_ID, SESSION_A);
    expect(appeal.ok).toBe(true);
    if (!appeal.ok) return;
    expect(appeal.appeal.status).toBe("MANUAL_REVIEW");
    expect(appeal.appeal.paragraphs).toEqual([]);

    // No PDF, and the case is not marked submitted.
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(0);
    expect(cases[CASE_ID].submittedAt).toBeNull();

    const final = await ensureFinalAppealDocument(CASE_ID, SESSION_A);
    expect(final.ok).toBe(false);
    if (!final.ok) expect(final.code).toBe("APPEAL_NOT_RELEASED");
  });

  it("does not show a blocked appeal as downloadable", async () => {
    generateSpy.mockResolvedValue({
      ...readyResult(), status: "MANUAL_REVIEW", body: null,
      reason: "VALIDATION_FAILED", detail: "Blocked.",
    });
    await getAppealForCase(CASE_ID, SESSION_A);
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.documents.some((d) => d.isFinalAppeal)).toBe(false);
  });
});

/* ============== PDF failure must not lose the draft ============== */

describe("PDF failure is separable from drafting", () => {
  it("keeps the validated draft and retries the PDF without re-drafting", async () => {
    const pdf = await import("@/services/documents/pdf");
    const spy = vi
      .spyOn(pdf, "renderAppealPdf")
      .mockRejectedValueOnce(new Error("renderer exploded"));

    // First attempt: PDF fails.
    const failed = await ensureFinalAppealDocument(CASE_ID, SESSION_A);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe("PDF_RENDER_FAILED");
    // The validated draft survives.
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("READY");
    expect(events.map((e) => e.eventType)).toContain("PDF_GENERATION_FAILED");

    // Retry succeeds without another drafting call.
    spy.mockRestore();
    const retried = await ensureFinalAppealDocument(CASE_ID, SESSION_A);
    expect(retried.ok).toBe(true);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(drafts).toHaveLength(1);
  });
});
