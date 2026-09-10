/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALL_OUTCOME_STATUSES,
  lifecycleStatusFor,
  type AppealCaseStatus,
} from "@/types/caseState";
import type { AppealCase } from "@/lib/cases/types";
import type { SessionData } from "@/lib/auth/session";

/**
 * Case lifecycle and outcome.
 *
 * The property under test throughout: workflow position and operator
 * decision are INDEPENDENT axes. A completed appeal with an unknown
 * outcome is the normal state for the ~30 days after submission, and
 * recording an outcome must never move the workflow.
 */

const OWNER: SessionData = { userId: "cust_1", kind: "CUSTOMER" };
const STRANGER: SessionData = { userId: "cust_2", kind: "CUSTOMER" };
const ADMIN: SessionData = { userId: "adm_1", kind: "ADMIN" };

function makeCase(over: Partial<AppealCase> = {}): AppealCase {
  const status = (over.status ?? "UNLOCKED") as AppealCaseStatus;
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
    extraction: null, confirmed: null,
    adaptiveAnswers: {}, askedQuestionIds: [],
    candidateRoutes: [], primaryRoute: "PAYMENT", secondaryRoutes: [],
    missingFacts: [], codeVersionId: null,
    questioningComplete: true, sufficiencyStatus: "SUFFICIENT",
    readinessCheckedAt: null, outOfScopeReason: null, outOfScopeDetail: null,
    paymentStatus: "PAID", appealLocked: false, orderId: null,
    outcomeStatus: "PENDING",
    outcomeRecordedAt: null,
    outcomeSource: null,
    outcomeDetail: null,
    submittedAt: "2026-07-20T00:00:00.000Z",
    followUpDueAt: "2026-08-19T00:00:00.000Z",
    stageNumber: 1,
    parentCaseId: null,
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    ...over,
    // Derived last so an `over` status/outcome is always reflected.
    lifecycleStatus: lifecycleStatusFor(over.status ?? status, {
      submittedAt: over.submittedAt !== undefined ? over.submittedAt : "2026-07-20T00:00:00.000Z",
      outcomeStatus: over.outcomeStatus ?? "PENDING",
    }),
  };
}

let current: AppealCase = makeCase();
const recordOutcomeSpy =
  vi.fn<(id: string, input: unknown) => Promise<void>>(async () => {});
const setCaseStatusSpy =
  vi.fn<(id: string, status: string) => Promise<void>>(async () => {});
const markSubmittedSpy =
  vi.fn<(id: string) => Promise<void>>(async () => {});

vi.mock("@/lib/cases/repo", () => ({
  findCase: async (id: string) => (id === current.id ? current : null),
  recordOutcome: (id: string, input: unknown) => recordOutcomeSpy(id, input),
  setCaseStatus: (id: string, s: string) => setCaseStatusSpy(id, s),
  markSubmitted: (id: string) => markSubmittedSpy(id),
  addCaseEvent: async () => {},
  listCaseDocuments: async () => [],
}));

const { recordOutcomeForCase, isFollowUpDue, toOutcomeView, isOutcomeStatus } =
  await import("@/lib/cases/outcome");

beforeEach(() => {
  current = makeCase();
  recordOutcomeSpy.mockClear();
  setCaseStatusSpy.mockClear();
  markSubmittedSpy.mockClear();
});

/* ===================== Lifecycle vs outcome ===================== */

/*
 * The full status vocabulary mapping lives in portalOverview.test.ts.
 * What matters here is that the two axes stay independent.
 */
describe("Workflow and outcome are independent", () => {
  it("reaches a finished workflow state while the outcome is unknown", () => {
    const c = makeCase({ status: "UNLOCKED", outcomeStatus: "PENDING" });
    expect(c.lifecycleStatus).toBe("SUBMITTED");
    expect(c.outcomeStatus).toBe("PENDING");
  });

  it("maps every review state to MANUAL_REVIEW", () => {
    for (const s of [
      "MANUAL_REVIEW", "OUT_OF_SCOPE", "FAILED",
    ] as AppealCaseStatus[]) {
      expect(lifecycleStatusFor(s), s).toBe("MANUAL_REVIEW");
    }
  });

  it("does not let an outcome pull a case out of review", () => {
    const c = makeCase({ status: "MANUAL_REVIEW", outcomeStatus: "REJECTED" });
    expect(c.lifecycleStatus).toBe("MANUAL_REVIEW");
  });
});

/* ========================= Outcome model ========================= */

describe("Outcome vocabulary", () => {
  it("supports the four required states", () => {
    expect([...ALL_OUTCOME_STATUSES].sort()).toEqual(
      ["ACCEPTED", "NO_RESPONSE", "PENDING", "REJECTED"].sort(),
    );
  });

  it("rejects anything outside the vocabulary", () => {
    expect(isOutcomeStatus("ACCEPTED")).toBe(true);
    expect(isOutcomeStatus("WON")).toBe(false);
    expect(isOutcomeStatus(null)).toBe(false);
  });
});

describe("Recording an outcome", () => {
  it("accepts a decision from the owning customer", async () => {
    const res = await recordOutcomeForCase("case_1", OWNER, {
      outcomeStatus: "ACCEPTED",
    });
    expect(res.ok).toBe(true);
    expect(recordOutcomeSpy).toHaveBeenCalledWith("case_1", {
      outcomeStatus: "ACCEPTED",
      source: "CUSTOMER",
      detail: null,
    });
  });

  it("NEVER changes the workflow status", async () => {
    await recordOutcomeForCase("case_1", OWNER, { outcomeStatus: "REJECTED" });
    // A rejected appeal is still a completed piece of work.
    expect(setCaseStatusSpy).not.toHaveBeenCalled();
  });

  it("refuses an outcome before the appeal was submitted", async () => {
    current = makeCase({ submittedAt: null, status: "QUESTIONING" });
    const res = await recordOutcomeForCase("case_1", OWNER, {
      outcomeStatus: "ACCEPTED",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("NOT_SUBMITTED");
    expect(recordOutcomeSpy).not.toHaveBeenCalled();
  });

  it("rejects an unknown outcome value", async () => {
    const res = await recordOutcomeForCase("case_1", OWNER, {
      outcomeStatus: "MAYBE" as never,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BAD_OUTCOME");
  });

  it("hides another customer's case", async () => {
    const res = await recordOutcomeForCase("case_1", STRANGER, {
      outcomeStatus: "ACCEPTED",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("refuses an admin recording on the customer's behalf", async () => {
    // Admins are read-only on case content; an admin-sourced outcome
    // will come through a separate path with source = ADMIN.
    const res = await recordOutcomeForCase("case_1", ADMIN, {
      outcomeStatus: "ACCEPTED",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it("requires a session", async () => {
    const res = await recordOutcomeForCase("case_1", {}, {
      outcomeStatus: "ACCEPTED",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });
});

/* ======================== Follow-up window ======================== */

describe("Follow-up window", () => {
  const before = new Date("2026-08-01T00:00:00.000Z");
  const after = new Date("2026-08-20T00:00:00.000Z");

  it("is not due before 30 days have passed", () => {
    expect(isFollowUpDue(makeCase(), before)).toBe(false);
  });

  it("is due once the window passes and the outcome is unknown", () => {
    expect(isFollowUpDue(makeCase(), after)).toBe(true);
  });

  it("is never due once an outcome is known", () => {
    expect(isFollowUpDue(makeCase({ outcomeStatus: "ACCEPTED" }), after)).toBe(false);
    expect(isFollowUpDue(makeCase({ outcomeStatus: "REJECTED" }), after)).toBe(false);
    expect(isFollowUpDue(makeCase({ outcomeStatus: "NO_RESPONSE" }), after)).toBe(false);
  });

  it("is never due for an unsubmitted case", () => {
    expect(
      isFollowUpDue(makeCase({ submittedAt: null, followUpDueAt: null }), after),
    ).toBe(false);
  });
});

/* ==================== Second-stage readiness ==================== */

describe("Second-stage linkage", () => {
  it("defaults to stage 1 with no parent", () => {
    const c = makeCase();
    expect(c.stageNumber).toBe(1);
    expect(c.parentCaseId).toBeNull();
  });

  it("flags that a second stage may apply only after a rejection", () => {
    expect(toOutcomeView(makeCase({ outcomeStatus: "REJECTED" })).secondStageMayApply).toBe(true);
    for (const s of ["PENDING", "ACCEPTED", "NO_RESPONSE"] as const) {
      expect(toOutcomeView(makeCase({ outcomeStatus: s })).secondStageMayApply).toBe(false);
    }
  });

  it("can represent a child case referencing the original", () => {
    // No workflow implements this yet; the shape must simply exist.
    const child = makeCase({
      id: "case_2",
      publicId: "CASE-2026-000002",
      stageNumber: 2,
      parentCaseId: "case_1",
      status: "DRAFT",
      submittedAt: null,
      followUpDueAt: null,
      outcomeStatus: "PENDING",
    });
    expect(child.parentCaseId).toBe("case_1");
    expect(child.stageNumber).toBe(2);
    expect(child.lifecycleStatus).toBe("IN_PROGRESS");
  });
});

/* ===================== Reporting readiness ===================== */

describe("Reporting readiness", () => {
  it("carries every dimension the future CRM reports need", () => {
    const c = makeCase({ outcomeStatus: "ACCEPTED" });
    // total / accepted / rejected / awaiting, success rate
    expect(c.outcomeStatus).toBeDefined();
    // by operator
    expect(c.operatorName).toBeTruthy();
    // by appeal route
    expect(c.primaryRoute).toBeTruthy();
    // by service and stage
    expect(c.serviceType).toBeTruthy();
    expect(c.stageNumber).toBe(1);
    // time-to-outcome
    expect(c.submittedAt).toBeTruthy();
  });
});
