/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AppealCase } from "@/lib/cases/types";
import { routeLabel, routeLabels } from "@/lib/cases/labels";
import type { SessionData } from "@/lib/auth/session";
import type { RouteFamily } from "@/types/caseState";

/**
 * P0-a — case ownership and customer-safe projection.
 *
 * The repository is mocked so these tests exercise the access rules and
 * the projection, not Postgres.
 */

const OWNER = "cl_owner";
const OTHER = "cl_other";

function makeCase(over: Partial<AppealCase> = {}): AppealCase {
  return {
    id: "case_1",
    publicId: "CASE-2026-000001",
    customerId: OWNER,
    serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
    status: "QUESTIONING",
    operatorName: "Euro Car Parks",
    pcnNumber: "ECP1",
    vrm: "AB12CDE",
    parkingLocation: "Retail Park",
    parkingEventDate: "2026-05-04",
    noticeIssueDate: "2026-05-06",
    noticeReceivedDate: null,
    noticeRoute: "POSTAL",
    operatorAta: "UNKNOWN",
    driverStatus: "UNIDENTIFIED",
    pofaRoute: null,
    extraction: null,
    confirmed: null,
    adaptiveAnswers: {},
    askedQuestionIds: [],
    candidateRoutes: [],
    primaryRoute: null,
    secondaryRoutes: [],
    missingFacts: [],
    codeVersionId: null,
    questioningComplete: false,
    sufficiencyStatus: "INCOMPLETE",
    readinessCheckedAt: null,
    outOfScopeReason: null,
    outOfScopeDetail: null,
    paymentStatus: "UNPAID",
    appealLocked: true,
    orderId: null,
    createdAt: "2026-05-06T10:00:00.000Z",
    updatedAt: "2026-05-06T10:00:00.000Z",
    ...over,
  };
}

const findCase = vi.fn<(id: string) => Promise<AppealCase | null>>();
const listCaseDocuments = vi.fn(async () => []);

vi.mock("@/lib/cases/repo", () => ({
  findCase: (id: string) => findCase(id),
  listCaseDocuments: () => listCaseDocuments(),
  createCase: vi.fn(),
  findCasesForCustomer: vi.fn(),
  findResumableCase: vi.fn(),
  setCaseStatus: vi.fn(),
  saveExtraction: vi.fn(),
  saveConfirmed: vi.fn(),
  saveAnswers: vi.fn(),
  upsertCaseFact: vi.fn(),
  listCaseFacts: vi.fn(),
  recordCaseAnswer: vi.fn(),
  listCaseAnswers: vi.fn(),
  addCaseDocument: vi.fn(),
  findCaseDocument: vi.fn(),
  softDeleteCaseDocument: vi.fn(),
  addCaseEvent: vi.fn(),
  listCaseEvents: vi.fn(),
}));

const { requireCaseAccess, getCustomerCaseState, requireStepEntitlement } =
  await import("@/lib/cases/service");

const ownerSession: SessionData = { userId: OWNER, kind: "CUSTOMER" };
const otherSession: SessionData = { userId: OTHER, kind: "CUSTOMER" };
const adminSession: SessionData = { userId: "adm_1", kind: "ADMIN" };
const anonSession: SessionData = {};

beforeEach(() => {
  findCase.mockReset();
  findCase.mockResolvedValue(makeCase());
  listCaseDocuments.mockClear();
});

describe("Case ownership", () => {
  it("allows the owner to read and write", async () => {
    const read = await requireCaseAccess("case_1", ownerSession, "read");
    const write = await requireCaseAccess("case_1", ownerSession, "write");
    expect(read.ok).toBe(true);
    expect(write.ok).toBe(true);
  });

  it("rejects an unauthenticated caller", async () => {
    const r = await requireCaseAccess("case_1", anonSession, "read");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("hides another customer's case behind 404, not 403", async () => {
    const r = await requireCaseAccess("case_1", otherSession, "read");
    expect(r.ok).toBe(false);
    // 404 so case IDs cannot be probed for existence.
    if (!r.ok) {
      expect(r.status).toBe(404);
      expect(r.code).toBe("NOT_FOUND");
    }
  });

  it("blocks another customer from writing", async () => {
    const r = await requireCaseAccess("case_1", otherSession, "write");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });

  it("gives an admin read access", async () => {
    const r = await requireCaseAccess("case_1", adminSession, "read");
    expect(r.ok).toBe(true);
  });

  it("denies an admin write access to a customer's answers", async () => {
    const r = await requireCaseAccess("case_1", adminSession, "write");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.code).toBe("ADMIN_READ_ONLY");
    }
  });

  it("returns 404 for a case that does not exist", async () => {
    findCase.mockResolvedValue(null);
    const r = await requireCaseAccess("nope", ownerSession, "read");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe("Customer-safe case projection", () => {
  it("never exposes internal route identifiers or fact keys", async () => {
    findCase.mockResolvedValue(
      makeCase({
        candidateRoutes: ["POFA", "PAYMENT"] as RouteFamily[],
        primaryRoute: "PAYMENT" as RouteFamily,
        secondaryRoutes: ["POFA"] as RouteFamily[],
        missingFacts: ["payment_method", "payment_evidence"],
      }),
    );
    const r = await getCustomerCaseState("case_1", ownerSession);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const serialised = JSON.stringify(r.state);
    expect(serialised).not.toMatch(/POFA|PAYMENT|KEYING/);
    expect(serialised).not.toMatch(/payment_method/);
    expect(serialised).not.toMatch(/\bKB-[A-Z]+-\d/);

    // Outstanding work is a count, never the internal keys.
    expect(r.state.outstandingCount).toBe(2);
    expect(r.state.groundLabels).toEqual([
      "Keeper liability has not been established",
      "Payment was made for the parking",
    ]);
  });

  it("exposes the public case reference for resume", async () => {
    const r = await getCustomerCaseState("case_1", ownerSession);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.publicId).toBe("CASE-2026-000001");
  });

  it("surfaces an out-of-scope message without the internal reason code", async () => {
    findCase.mockResolvedValue(
      makeCase({
        outOfScopeReason: "JURISDICTION_SCOTLAND",
        outOfScopeDetail: "This case needs manual review.",
      }),
    );
    const r = await getCustomerCaseState("case_1", ownerSession);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.outOfScope?.detail).toMatch(/manual review/);
    expect(JSON.stringify(r.state)).not.toMatch(/JURISDICTION_SCOTLAND/);
  });

  it("keeps the appeal locked and unpaid by default", async () => {
    const r = await getCustomerCaseState("case_1", ownerSession);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.appealLocked).toBe(true);
    expect(r.state.paymentStatus).toBe("UNPAID");
  });

  it("does not leak the state to another customer", async () => {
    const r = await getCustomerCaseState("case_1", otherSession);
    expect(r.ok).toBe(false);
  });
});

describe("Server-side payment entitlement", () => {
  it("allows free steps without payment", async () => {
    findCase.mockResolvedValue(makeCase({ paymentStatus: "UNPAID" }));
    for (const step of ["QUESTIONING", "EVIDENCE", "SUFFICIENCY_CHECK"] as const) {
      const r = await requireStepEntitlement("case_1", ownerSession, step);
      expect(r.ok, step).toBe(true);
    }
  });

  it("blocks gated steps with 402 when unpaid", async () => {
    findCase.mockResolvedValue(makeCase({ paymentStatus: "UNPAID" }));
    for (const step of ["ANALYSIS", "DRAFTING", "VALIDATION", "PDF", "DELIVERY"] as const) {
      const r = await requireStepEntitlement("case_1", ownerSession, step);
      expect(r.ok, step).toBe(false);
      if (!r.ok) {
        expect(r.status).toBe(402);
        expect(r.code).toBe("PAYMENT_REQUIRED");
      }
    }
  });

  it("allows gated steps once the database records payment", async () => {
    findCase.mockResolvedValue(makeCase({ paymentStatus: "PAID" }));
    const r = await requireStepEntitlement("case_1", ownerSession, "DRAFTING");
    expect(r.ok).toBe(true);
  });

  it("does not accept a PENDING payment as entitlement", async () => {
    findCase.mockResolvedValue(makeCase({ paymentStatus: "PENDING" }));
    const r = await requireStepEntitlement("case_1", ownerSession, "PDF");
    expect(r.ok).toBe(false);
  });

  it("still enforces ownership on gated steps", async () => {
    findCase.mockResolvedValue(makeCase({ paymentStatus: "PAID" }));
    const r = await requireStepEntitlement("case_1", otherSession, "PDF");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe("Route labels", () => {
  it("translates every route family to plain language", () => {
    const families: RouteFamily[] = [
      "POFA", "PAYMENT", "KEYING", "CONSIDERATION", "GRACE", "ANPR",
      "AUTHORIZATION", "PERMIT", "BREAKDOWN", "RESIDENTIAL", "SIGNAGE",
      "EQUALITY", "HOSPITAL", "LOADING", "DROP_OFF", "EV_CHARGING",
      "INFRASTRUCTURE", "LANDOWNER",
    ];
    for (const f of families) {
      const label = routeLabel(f);
      expect(label.length, f).toBeGreaterThan(5);
      // The label must not contain the internal identifier.
      expect(label).not.toContain(f);
    }
  });

  it("deduplicates labels that map from several routes", () => {
    const labels = routeLabels([
      "AUTHORIZATION",
      "AUTHORIZATION",
      "PAYMENT",
    ] as RouteFamily[]);
    expect(labels).toHaveLength(2);
  });
});
