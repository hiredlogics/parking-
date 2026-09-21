/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppealDraftRow } from "@/lib/cases/draftRepo";
import type { GenerationResult } from "@/lib/generation/engine";
import type { AppealCase } from "@/lib/cases/types";
import type { SessionData } from "@/lib/auth/session";

/**
 * P0-d — entitlement-gated generation and stored drafts.
 *
 * The database is mocked so these tests exercise the gate, the
 * generate-once contract and the customer-safe projection rather than
 * Postgres.
 */

const OWNER: SessionData = {
  userId: "cust_1",
  email: "a@b.com",
  kind: "CUSTOMER",
};
const ADMIN: SessionData = { userId: "adm_1", email: "x@y.com", kind: "ADMIN" };
const STRANGER: SessionData = {
  userId: "cust_2",
  email: "c@d.com",
  kind: "CUSTOMER",
};

function makeCase(over: Partial<AppealCase> = {}): AppealCase {
  return {
    id: "case_1",
    publicId: "PAG-0001",
    customerId: "cust_1",
    serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
    status: "AWAITING_PAYMENT",
    operatorName: "Op Ltd",
    pcnNumber: "PCN123",
    vrm: "AB12CDE",
    parkingLocation: "Car Park",
    parkingEventDate: "2025-01-05",
    noticeIssueDate: null,
    noticeReceivedDate: null,
    noticeRoute: "UNKNOWN",
    operatorAta: "UNKNOWN",
    driverStatus: "UNIDENTIFIED",
    pofaRoute: null,
    extraction: null,
    confirmed: {
      pcn_number: "PCN123",
      vrm: "AB12CDE",
      operator_name: "Op Ltd",
      parking_location: "Car Park",
      parking_event_date: "2025-01-05",
    } as AppealCase["confirmed"],
    adaptiveAnswers: {},
    askedQuestionIds: [],
    candidateRoutes: [],
    primaryRoute: null,
    secondaryRoutes: [],
    missingFacts: [],
    codeVersionId: null,
    questioningComplete: true,
    sufficiencyStatus: "SUFFICIENT",
    readinessCheckedAt: null,
    outOfScopeReason: null,
    outOfScopeDetail: null,
    paymentStatus: "UNPAID",
    appealLocked: true,
    orderId: null,
    lifecycleStatus: "IN_PROGRESS",
    outcomeStatus: "PENDING",
    outcomeRecordedAt: null,
    outcomeSource: null,
    outcomeDetail: null,
    submittedAt: null,
    followUpDueAt: null,
    stageNumber: 1,
    parentCaseId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    ...over,
  };
}

let current: AppealCase = makeCase();
let drafts: AppealDraftRow[] = [];
const generateSpy = vi.fn();
const setCaseStatus =
  vi.fn<(caseId: string, status: string) => Promise<void>>(async () => {});
const markSubmitted =
  vi.fn<(caseId: string) => Promise<void>>(async () => {});

function readyResult(body = "Para one.\n\nPara two."): GenerationResult {
  return {
    status: "READY",
    body,
    analysis: {
      primaryRoute: "POFA",
      secondaryRoutes: ["SIGNAGE"],
      codeVersionId: "CODE-SINGLE-V1",
      pofa: { route: "PARA_9" },
    } as unknown as GenerationResult["analysis"],
    attempts: [],
    reason: null,
    detail: null,
    moduleIds: ["KB-POFA-01"],
    provider: {
      providerId: "deterministic",
      promptVersion: "draft-v1",
      model: null,
      bespoke: false,
    },
    warnings: [],
    generationVersion: "generation-v1",
  };
}

function blockedResult(): GenerationResult {
  return {
    ...readyResult(),
    status: "MANUAL_REVIEW",
    body: null,
    reason: "VALIDATION_FAILED",
    detail: "Blocking validators: VAL-DRIVER.",
  };
}

vi.mock("@/lib/cases/repo", () => ({
  findCase: async (id: string) => (id === current.id ? current : null),
  listCaseDocuments: async () => [],
  findGeneratedDocumentForDraft: async () => null,
  addCaseDocument: async () => ({ id: "doc_mock" }),
  addCaseEvent: async () => {},
  setCaseStatus: (id: string, s: string) => setCaseStatus(id, s),
  setAwaitingAdminApproval: async () => {},
  markSubmitted: (id: string) => markSubmitted(id),
  updateCaseRoutes: async () => {},
}));

vi.mock("@/lib/cases/finalDocument", () => ({
  ensureFinalAppealDocument: async () => ({
    ok: true,
    final: { created: false, document: { id: "doc_existing" } },
  }),
}));

vi.mock("@/lib/generation/engine", () => ({
  generateValidatedAppeal: (...args: unknown[]) => generateSpy(...args),
  GENERATION_VERSION: "generation-v1",
}));

vi.mock("@/lib/kb/audit", () => ({ insertAuditEvent: async () => {} }));
vi.mock("@/lib/generation/manualReview", () => ({
  openManualReview: async () => "rev_1",
}));

let currentAppeal: {
  id: string;
  status: string;
  caseId: string;
  paragraphs?: Array<{ id: string; text: string }>;
  approvedParagraphs?: Array<{ id: string; text: string }> | null;
} | null = null;

vi.mock("@/lib/appeals/repo", () => ({
  findCurrentAppeal: async (caseId: string) =>
    currentAppeal && currentAppeal.caseId === caseId ? currentAppeal : null,
  findAppealById: async (id: string) =>
    currentAppeal && currentAppeal.id === id ? currentAppeal : null,
  saveAwaitingApprovalAppeal: async (input: {
    caseId: string;
    paragraphs?: Array<{ id: string; text: string }>;
  }) => {
    currentAppeal = {
      id: "cap_1",
      status: "AWAITING_ADMIN_APPROVAL",
      caseId: input.caseId,
      paragraphs: input.paragraphs ?? [],
      approvedParagraphs: null,
    };
    return currentAppeal;
  },
}));

vi.mock("@/lib/appeals/autoRelease", () => ({
  releaseAppealToCustomer: async () => {
    if (currentAppeal) {
      currentAppeal.status = "APPROVED";
      currentAppeal.approvedParagraphs = currentAppeal.paragraphs ?? [];
    }
    return {
      ok: true,
      appeal: currentAppeal,
      emailId: "eml_1",
      appealDocId: "doc_a",
      instructionsDocId: "doc_i",
    };
  },
}));

vi.mock("@/lib/engine/issueEngine", () => ({
  evaluateIssues: async () => ({
    serviceCode: "PRIVATE_PARKING_INITIAL_APPEAL",
    activeIssues: [{ code: "PAYMENT_KEYING", label: "Payment", moduleIds: ["KB-PAY-01"] }],
    missingFacts: [],
    nextFact: null,
    applicableModuleIds: ["KB-PAY-01"],
    sufficient: true,
    origin: "admin_config",
  }),
  isAdminIssueEngineEnabled: () => true,
}));

vi.mock("@/lib/config/seedAdminConfig", () => ({
  ensureAdminConfigSeeded: async () => {},
}));

vi.mock("@/lib/config/adminRepo", () => ({
  getServiceByCode: async () => ({ id: "svc_1", code: "PRIVATE_PARKING_INITIAL_APPEAL" }),
}));

vi.mock("@/lib/analysis/engine", () => ({
  factsForCase: () => ({ values: {}, tags: [] }),
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
    saveDraft: async (caseId: string, result: GenerationResult) => {
      for (const d of drafts) if (!d.supersededAt) d.supersededAt = "now";
      const row: AppealDraftRow = {
        id: `draft_${drafts.length + 1}`,
        caseId,
        version: drafts.length + 1,
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
        validation: null,
        checklist: null,
        warnings: result.warnings,
        attempts: 1,
        blockReason: result.reason,
        blockDetail: result.detail,
        generationVersion: result.generationVersion,
        createdAt: "2025-02-01T00:00:00.000Z",
        supersededAt: null,
      };
      drafts.push(row);
      return row;
    },
  };
});

const { generateAppealForCase, getAppealForCase, toCustomerView } = await import(
  "@/lib/generation/caseGeneration"
);
const { toParagraphs } = await import("@/lib/cases/draftRepo");

beforeEach(() => {
  current = makeCase();
  drafts = [];
  currentAppeal = null;
  generateSpy.mockReset();
  generateSpy.mockResolvedValue(readyResult());
  setCaseStatus.mockClear();
  markSubmitted.mockClear();
});

/* ========================= Entitlement gate ========================= */

describe("Entitlement gate", () => {
  it("refuses generation for an unpaid case with 402", async () => {
    const res = await generateAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(402);
      expect(res.code).toBe("PAYMENT_REQUIRED");
    }
  });

  it("makes no AI call when the case is unpaid", async () => {
    await generateAppealForCase("case_1", OWNER);
    // The whole point of gating before the pipeline: no spend.
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("does not treat CHECKOUT_CREATED as paid", async () => {
    current = makeCase({ paymentStatus: "CHECKOUT_CREATED" });
    const res = await generateAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(false);
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it("does not treat a refunded case as paid", async () => {
    current = makeCase({ paymentStatus: "REFUNDED" });
    const res = await generateAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(false);
  });

  it("generates once the case is PAID", async () => {
    current = makeCase({ paymentStatus: "PAID" });
    const res = await generateAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(true);
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("hides another customer's case behind 404", async () => {
    current = makeCase({ paymentStatus: "PAID" });
    const res = await generateAppealForCase("case_1", STRANGER);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("requires a session", async () => {
    current = makeCase({ paymentStatus: "PAID" });
    const res = await generateAppealForCase("case_1", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("lets an admin read a paid case", async () => {
    current = makeCase({ paymentStatus: "PAID" });
    const res = await generateAppealForCase("case_1", ADMIN);
    expect(res.ok).toBe(true);
  });
});

/* ======================== Generate-once ======================== */

describe("Generate once", () => {
  beforeEach(() => {
    current = makeCase({ paymentStatus: "PAID" });
  });

  it("reuses the stored draft on a repeat request", async () => {
    const first = await generateAppealForCase("case_1", OWNER);
    const second = await generateAppealForCase("case_1", OWNER);
    expect(first.ok && first.reused).toBe(false);
    expect(second.ok && second.reused).toBe(true);
    // A refresh must not spend another AI call.
    expect(generateSpy).toHaveBeenCalledTimes(1);
  });

  it("returns identical text across repeat requests", async () => {
    const a = await generateAppealForCase("case_1", OWNER);
    const b = await generateAppealForCase("case_1", OWNER);
    expect(a.ok && b.ok && a.draft.body).toBe(b.ok ? b.draft.body : null);
  });

  it("regenerates and supersedes when forced", async () => {
    await generateAppealForCase("case_1", OWNER);
    const forced = await generateAppealForCase("case_1", OWNER, { force: true });
    expect(generateSpy).toHaveBeenCalledTimes(2);
    expect(forced.ok && forced.draft.version).toBe(2);
    expect(drafts.filter((d) => !d.supersededAt)).toHaveLength(1);
  });

  it("reuses a blocked draft while awaiting admin (regen requires force)", async () => {
    generateSpy.mockResolvedValueOnce(blockedResult());
    await generateAppealForCase("case_1", OWNER);
    await generateAppealForCase("case_1", OWNER);
    // Awaiting-admin reuses; admin REGENERATE uses force:true.
    expect(generateSpy).toHaveBeenCalledTimes(1);
    await generateAppealForCase("case_1", OWNER, { force: true });
    expect(generateSpy).toHaveBeenCalledTimes(2);
  });

  it("refuses when the notice was never confirmed", async () => {
    current = makeCase({ paymentStatus: "PAID", confirmed: null });
    const res = await generateAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONFIRMATION_REQUIRED");
  });

  it("auto-releases on validation PASS (no awaiting-admin gate)", async () => {
    await generateAppealForCase("case_1", OWNER);
    expect(setCaseStatus).not.toHaveBeenCalledWith("case_1", "AWAITING_ADMIN_APPROVAL");
    expect(currentAppeal?.status).toBe("APPROVED");
  });

  it("does not leave a PASS draft stuck awaiting admin", async () => {
    await generateAppealForCase("case_1", OWNER);
    expect(currentAppeal?.status).toBe("APPROVED");
  });

  it("queues manual review when validation blocks the draft", async () => {
    generateSpy.mockResolvedValueOnce(blockedResult());
    await generateAppealForCase("case_1", OWNER);
    expect(setCaseStatus).toHaveBeenCalledWith("case_1", "MANUAL_REVIEW");
    expect(markSubmitted).not.toHaveBeenCalled();
  });

  it("persists a blocked outcome for the reviewer", async () => {
    generateSpy.mockResolvedValueOnce(blockedResult());
    await generateAppealForCase("case_1", OWNER);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].status).toBe("MANUAL_REVIEW");
    expect(drafts[0].blockReason).toBe("VALIDATION_FAILED");
  });
});

/* ==================== Customer-safe projection ==================== */

describe("Customer-safe projection", () => {
  beforeEach(() => {
    current = makeCase({ paymentStatus: "PAID" });
  });

  it("never exposes module IDs, provider or validator internals", async () => {
    const res = await getAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const keys = Object.keys(res.appeal);
    for (const leak of [
      "moduleIds", "provider", "validation", "checklist",
      "primaryRoute", "secondaryRoutes", "warnings", "codeVersionId",
    ]) {
      expect(keys, leak).not.toContain(leak);
    }
  });

  it("auto-releases READY with paragraphs on validation PASS", async () => {
    const res = await getAppealForCase("case_1", OWNER);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.appeal.status).toBe("READY");
    expect(res.appeal.paragraphs.length).toBeGreaterThan(0);
    expect(res.appeal.needsReview).toBe(false);
  });

  it("returns no paragraphs when not yet approved in projection helper", () => {
    const view = toCustomerView({
      ...drafts[0],
      id: "d",
      caseId: "case_1",
      version: 1,
      status: "READY",
      body: "secret",
      paragraphs: [{ id: "p1", text: "leak" }],
      primaryRoute: "POFA",
      secondaryRoutes: [],
      blockDetail: "A person will review this.",
    } as AppealDraftRow);

    expect(view.status).toBe("UNDER_REVIEW");
    expect(view.paragraphs).toEqual([]);
    expect(view.groundLabels).toEqual([]);
    expect(view.needsReview).toBe(true);
    expect(view.reviewDetail).toBe("We're preparing your appeal.");
  });

  it("exposes paragraphs only after admin approval", () => {
    const view = toCustomerView(
      {
        id: "d",
        caseId: "case_1",
        version: 1,
        status: "READY",
        body: "Para",
        paragraphs: [{ id: "p1", text: "Approved text" }],
        primaryRoute: "POFA",
        secondaryRoutes: [],
        moduleIds: [],
        codeVersionId: null,
        pofaRoute: null,
        providerId: null,
        promptVersion: null,
        model: null,
        bespoke: false,
        validation: null,
        checklist: null,
        warnings: [],
        attempts: 1,
        blockReason: null,
        blockDetail: null,
        generationVersion: "generation-v1",
        createdAt: "2025-02-01T00:00:00.000Z",
        supersededAt: null,
      } as AppealDraftRow,
      { approved: true },
    );
    expect(view.status).toBe("READY");
    expect(view.paragraphs).toEqual([{ id: "p1", text: "Approved text" }]);
  });
});

/* ========================= Draft paragraphs ========================= */

describe("Stored paragraph splitting", () => {
  it("splits a body on blank lines and numbers sequentially", () => {
    expect(toParagraphs("One.\n\nTwo.\n\n\nThree.")).toEqual([
      { id: "p1", text: "One." },
      { id: "p2", text: "Two." },
      { id: "p3", text: "Three." },
    ]);
  });

  it("drops empty segments and trims", () => {
    expect(toParagraphs("  A.  \n\n   \n\nB.")).toEqual([
      { id: "p1", text: "A." },
      { id: "p2", text: "B." },
    ]);
  });

  it("keeps single-newline breaks inside one paragraph", () => {
    expect(toParagraphs("Line one\nline two")).toEqual([
      { id: "p1", text: "Line one\nline two" },
    ]);
  });
});
