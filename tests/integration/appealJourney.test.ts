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
let events: Array<{ id: string; caseId: string; eventType: string; payload: unknown; createdAt: string }> = [];
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
    readinessCheckedAt: null, outOfScopeReason: null, outOfScopeDetail: null, documentType: null, senderName: null, parkingOperatorName: null, caseStage: null, serviceDecision: null, caseIntelligence: null,
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

vi.mock("@/lib/db/pool", () => ({
  hasDb: () => true,
  getSql: () => ({
    query: async () => ({ rows: [{ email: "a@example.com" }] }),
  }),
}));
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

const savedIntelligence: Array<{ caseId: string; intelligence: unknown }> = [];

vi.mock("@/lib/cases/repo", () => ({
  findCase: async (id: string) => (cases[id] ? readCase(cases[id]) : null),
  // Generation persists Case Intelligence before drafting; record it so a
  // test can assert on it rather than silently dropping the write.
  saveCaseIntelligence: async (caseId: string, intelligence: unknown) => {
    savedIntelligence.push({ caseId, intelligence });
  },
  loadCaseIntelligence: async (caseId: string) =>
    savedIntelligence.filter((r) => r.caseId === caseId).at(-1)?.intelligence ?? null,
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
  addCaseEvent: async (e: { caseId: string; eventType: string; payload?: unknown }) => {
    events.push({
      id: `evt_${events.length + 1}`,
      caseId: e.caseId,
      eventType: e.eventType,
      payload: e.payload ?? null,
      createdAt: "2026-07-24T00:00:00.000Z",
    });
  },
  listCaseEvents: async (caseId: string) => events.filter((e) => e.caseId === caseId),
  setCaseStatus: async (id: string, status: string) => {
    cases[id] = { ...cases[id], status: status as AppealCase["status"] };
  },
  setAwaitingAdminApproval: async () => {},
  markSubmitted: async (id: string) => {
    cases[id] = {
      ...cases[id],
      submittedAt: "2026-07-24T00:00:00.000Z",
      followUpDueAt: "2026-08-23T00:00:00.000Z",
    };
  },
  updateCaseRoutes: async (id: string, routes: Record<string, unknown>) => {
    cases[id] = { ...cases[id], ...routes } as AppealCase;
  },
}));

let caseAppeals: Array<{
  id: string;
  caseId: string;
  status: string;
  body: string | null;
  paragraphs: Array<{ id: string; text: string }>;
  sourceDraftId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedParagraphs: Array<{ id: string; text: string }> | null;
  approvedVersion: number | null;
  knowledgeSnapshot: unknown[];
  moduleIds: string[];
  version: number;
  supersededAt: string | null;
}> = [];

vi.mock("@/lib/appeals/repo", () => ({
  findCurrentAppeal: async (caseId: string) =>
    caseAppeals.find((a) => a.caseId === caseId && !a.supersededAt) ?? null,
  findAppealById: async (id: string) =>
    caseAppeals.find((a) => a.id === id) ?? null,
  saveAwaitingApprovalAppeal: async (input: {
    caseId: string;
    body: string | null;
    paragraphs: Array<{ id: string; text: string }>;
    sourceDraftId?: string | null;
    moduleIds?: string[];
    knowledgeSnapshot?: unknown[];
  }) => {
    for (const a of caseAppeals) {
      if (a.caseId === input.caseId && !a.supersededAt) a.supersededAt = "now";
    }
    const row = {
      id: `cap_${caseAppeals.length + 1}`,
      caseId: input.caseId,
      status: "AWAITING_ADMIN_APPROVAL",
      body: input.body,
      paragraphs: input.paragraphs,
      sourceDraftId: input.sourceDraftId ?? null,
      approvedBy: null,
      approvedAt: null,
      approvedParagraphs: null as Array<{ id: string; text: string }> | null,
      approvedVersion: null as number | null,
      knowledgeSnapshot: input.knowledgeSnapshot ?? [],
      moduleIds: input.moduleIds ?? [],
      version: caseAppeals.filter((a) => a.caseId === input.caseId).length + 1,
      supersededAt: null as string | null,
    };
    caseAppeals.push(row);
    return row;
  },
  markAppealApproved: async (input: {
    appealId: string;
    approvedBy: string;
    body?: string | null;
    paragraphs?: Array<{ id: string; text: string }> | null;
  }) => {
    const a = caseAppeals.find((x) => x.id === input.appealId);
    if (!a) throw new Error("not found");
    a.status = "APPROVED";
    a.approvedBy = input.approvedBy;
    a.approvedAt = "2026-07-24T01:00:00.000Z";
    if (input.body?.trim()) a.body = input.body.trim();
    if (input.paragraphs && input.paragraphs.length > 0) {
      a.paragraphs = input.paragraphs;
    }
    a.approvedParagraphs = a.paragraphs;
    a.approvedVersion = a.version;
    return a;
  },
  markAppealHeld: async () => ({}),
  markAppealRejected: async () => ({}),
}));

vi.mock("@/lib/kb/audit", () => ({
  insertAuditEvent: async () => {},
}));
vi.mock("@/lib/generation/manualReview", () => ({
  openManualReview: async () => {},
}));

vi.mock("@/lib/config/seedAdminConfig", () => ({
  ensureAdminConfigSeeded: async () => {},
}));
vi.mock("@/lib/engine/issueEngine", () => ({
  evaluateIssues: async () => ({
    activeIssues: [{ code: "PAYMENT_KEYING", label: "Payment", moduleIds: ["KB-PAY-01"] }],
    missingFacts: [],
    nextFact: null,
    applicableModuleIds: ["KB-PAY-01"],
    sufficient: true,
    origin: "admin_config",
    serviceCode: "PRIVATE_PARKING_INITIAL_APPEAL",
  }),
  isAdminIssueEngineEnabled: () => true,
}));
vi.mock("@/lib/config/adminRepo", () => ({
  getServiceByCode: async () => ({ id: "svc_1", code: "PRIVATE_PARKING_INITIAL_APPEAL" }),
}));
vi.mock("@/lib/analysis/engine", () => ({
  factsForCase: () => ({ values: {}, tags: [] }),
}));
vi.mock("@/lib/email/outbox", () => ({
  queueAppealReadyEmail: async () => "eml_1",
  processOutboxItem: async () => true,
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

async function generateAutoReleased() {
  const appeal = await getAppealForCase(CASE_ID, SESSION_A);
  expect(appeal.ok).toBe(true);
  if (!appeal.ok) throw new Error("generation failed");
  expect(appeal.appeal.status).toBe("READY");
  expect(documents.filter((d) => d.documentType === "GENERATED").length).toBeGreaterThan(0);
  expect(documents.filter((d) => d.documentType === "INSTRUCTIONS").length).toBeGreaterThan(0);
  return { customerView: appeal };
}

beforeEach(() => {
  cases = { [CASE_ID]: makeCase() };
  documents = [
    {
      id: "doc_pcn", caseId: CASE_ID, documentType: "PCN",
      evidenceType: null, storageKey: `cases/${CASE_ID}/evidence/k-notice.pdf`,
      storageProvider: "memory", fileName: "notice.pdf",
      mimeType: "application/pdf", sizeBytes: 100, sha256: "a",
      sourceDraftId: null, description: null, derivedFacts: null,
      uploadedAt: "2026-07-23T00:00:00.000Z", uploadedBy: CUSTOMER_A,
    },
  ];
  drafts = [];
  events = [];
  caseAppeals = [];
  docSeq = 100;
  generateSpy.mockReset();
  generateSpy.mockResolvedValue(readyResult());
  process.env.APP_ENV = "test";
  process.env.STORAGE_PROVIDER = "memory";
  resetStorageProvider();
});

/* ==================== The complete journey ==================== */

describe("Complete appeal journey — paid case → auto-release → portal", () => {
  it("auto-releases Final Appeal + Instructions with no admin click", async () => {
    const appeal = await getAppealForCase(CASE_ID, SESSION_A);
    expect(appeal.ok).toBe(true);
    if (!appeal.ok) return;
    expect(appeal.appeal.status).toBe("READY");
    expect(appeal.appeal.paragraphs.length).toBeGreaterThan(0);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("READY");
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(1);
    expect(documents.filter((d) => d.documentType === "INSTRUCTIONS")).toHaveLength(1);
    expect(cases[CASE_ID].status).toBe("UNLOCKED");
    expect(cases[CASE_ID].submittedAt).toBeTruthy();
    expect(events.map((e) => e.eventType)).toContain("APPEAL_READY");
  });

  it("persists immutable PDF and instructions on auto-release", async () => {
    await generateAutoReleased();

    const generated = documents.filter((d) => d.documentType === "GENERATED");
    expect(generated).toHaveLength(1);
    expect(generated[0].caseId).toBe(CASE_ID);
    expect(generated[0].mimeType).toBe("application/pdf");
    expect(generated[0].sizeBytes).toBeGreaterThan(0);
    expect(generated[0].sha256).toBeTruthy();
    expect(generated[0].sourceDraftId).toBe(drafts[0].id);

    const instructions = documents.filter((d) => d.documentType === "INSTRUCTIONS");
    expect(instructions).toHaveLength(1);
    expect(cases[CASE_ID].status).toBe("UNLOCKED");
    expect(cases[CASE_ID].submittedAt).toBeTruthy();

    const after = await getAppealForCase(CASE_ID, SESSION_A);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(after.appeal.status).toBe("READY");
    expect(after.appeal.paragraphs.length).toBeGreaterThan(0);
  });

  it("produces a real PDF from the released text", async () => {
    await generateAutoReleased();
    const doc = documents.find((d) => d.documentType === "GENERATED")!;
    const delivery = await getCaseDocumentDelivery(CASE_ID, SESSION_A, doc.id);
    expect(delivery.ok).toBe(true);
    if (!delivery.ok || delivery.delivery.kind !== "stream") return;
    const head = String.fromCharCode(
      ...delivery.delivery.object.bytes.slice(0, 5),
    );
    expect(head).toBe("%PDF-");
  });

  it("NEVER re-drafts on repeat customer requests after release", async () => {
    await generateAutoReleased();
    const firstId = documents.find((d) => d.documentType === "GENERATED")!.id;
    const firstHash = documents.find((d) => d.documentType === "GENERATED")!.sha256;

    await getAppealForCase(CASE_ID, SESSION_A);
    const again = await ensureFinalAppealDocument(CASE_ID, SESSION_A);

    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.final.created).toBe(false);
    expect(again.final.document.id).toBe(firstId);
    expect(again.final.document.sha256).toBe(firstHash);
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(1);
  });
});

/* ========================= Portal screens ========================= */

describe("Portal shows the completed case after auto-release", () => {
  beforeEach(async () => {
    await generateAutoReleased();
  });

  it("My Cases shows the case", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.cases).toHaveLength(1);
    expect(res.overview.cases[0].id).toBe(CASE_ID);
  });

  it("My Appeals shows the appeal as downloadable", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    expect(res.overview.appeals).toHaveLength(1);
    expect(res.overview.appeals[0].caseId).toBe(CASE_ID);
    expect(res.overview.appeals[0].downloadable).toBe(true);
  });

  it("My Documents shows the final appeal and instructions", async () => {
    const res = await buildPortalOverview(SESSION_A);
    if (!res.ok) throw new Error("expected ok");
    const final = res.overview.documents.find((d) => d.isFinalAppeal);
    expect(final).toBeDefined();
    expect(final!.category).toBe("Final Appeal PDF");
    expect(final!.casePublicId).toBe("CASE-2026-000001");
    const instructions = res.overview.documents.find(
      (d) => d.category === "Appeal Instructions",
    );
    expect(instructions).toBeDefined();
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
    await generateAutoReleased();
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
    cases[CASE_ID] = { ...cases[CASE_ID], paymentStatus: "UNPAID" };
    const res = await getCaseDocumentDelivery(CASE_ID, SESSION_A, finalDocId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(402);
  });

  it("an unpaid case cannot even reach generation", async () => {
    cases = { [CASE_ID]: makeCase({ paymentStatus: "UNPAID", status: "AWAITING_PAYMENT" }) };
    drafts = []; documents = []; caseAppeals = [];
    generateSpy.mockClear();
    const res = await getAppealForCase(CASE_ID, SESSION_A);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(402);
    expect(generateSpy).not.toHaveBeenCalled();
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(0);
  });
});

/* ==================== Validation failure ==================== */

describe("Validation failure routes to manual review without releasing", () => {
  it("produces no document when validation blocks", async () => {
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
    expect(appeal.appeal.status).toBe("UNDER_REVIEW");
    expect(appeal.appeal.paragraphs).toEqual([]);

    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(0);
    expect(cases[CASE_ID].submittedAt).toBeNull();
    expect(cases[CASE_ID].status).toBe("MANUAL_REVIEW");

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
    expect(res.overview.appeals[0]?.downloadable).toBe(false);
  });
});

/* ============== Exception path keeps PDF gated ============== */

describe("PDF is not creatable while in manual review", () => {
  it("ensureFinalAppealDocument refuses while awaiting exception review", async () => {
    generateSpy.mockResolvedValue({
      ...readyResult(),
      status: "MANUAL_REVIEW",
      body: null,
      reason: "VALIDATION_FAILED",
      detail: "Blocked.",
    });
    await getAppealForCase(CASE_ID, SESSION_A);
    expect(drafts).toHaveLength(1);
    const failed = await ensureFinalAppealDocument(CASE_ID, SESSION_A);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe("APPEAL_NOT_RELEASED");
    expect(documents.filter((d) => d.documentType === "GENERATED")).toHaveLength(0);
  });
});
