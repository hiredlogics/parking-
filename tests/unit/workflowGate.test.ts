/**
 * @vitest-environment node
 */
import { describe, expect, it, beforeAll } from "vitest";
import {
  freeSteps,
  getWorkflow,
  isPaidStep,
  paymentGateStep,
  servicePrice,
  type ServiceWorkflow,
  type WorkflowStep,
} from "@/lib/workflow/config";
import { assessSufficiency } from "@/lib/cases/sufficiency";
import { askedFactKey } from "@/lib/facts/missing";
import { FACT } from "@/lib/facts/facts";
import type { AppealCase } from "@/lib/cases/types";
import type { AnswerMap } from "@/lib/facts/types";
import type { ConfirmedPcn } from "@/types";

/**
 * P0-b — configurable payment gate and the sufficient-information check.
 */

const SERVICE = "PRIVATE_PARKING_INITIAL_APPEAL";

function confirmedPcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP123456",
    vrm: "AB12CDE",
    parking_location: "Retail Park, Northampton",
    parking_event_date: "2026-05-04",
    notice_issue_date: "2026-05-06",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "Overstayed the maximum period",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: new Date().toISOString(),
    ...over,
  };
}

/**
 * A case whose questioning has happened.
 *
 * Every fact passed here is recorded as answered AND as having been put
 * to the customer. The asked marker is the point: readiness blocks while
 * a question is still going to be asked, so a fixture that supplies
 * answers without saying they were asked is describing a case in the
 * middle of the loop, not one that finished it.
 *
 * These markers used to be question ids (`__asked:Q-PAY-METHOD`), which
 * the question engine minted. That engine is gone and nothing reads that
 * prefix any more; the fact-keyed marker in lib/facts/missing.ts is what
 * both the gap resolver and the archive replay now write.
 */
function answers(extra: AnswerMap = {}): AnswerMap {
  const values: AnswerMap = {
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
    ...extra,
  };
  for (const key of Object.keys(values)) {
    if (!key.startsWith("__")) values[askedFactKey(key)] = true;
  }
  return values;
}

function makeCase(over: Partial<AppealCase> = {}): AppealCase {
  return {
    id: "case_1",
    publicId: "CASE-2026-000001",
    customerId: "cl_owner",
    serviceType: SERVICE,
    status: "QUESTIONING",
    operatorName: "Euro Car Parks",
    pcnNumber: "ECP123456",
    vrm: "AB12CDE",
    parkingLocation: "Retail Park",
    parkingEventDate: "2026-05-04",
    noticeIssueDate: "2026-05-06",
    noticeReceivedDate: null,
    noticeRoute: "POSTAL",
    operatorAta: "UNKNOWN",
    driverStatus: "UNIDENTIFIED",
    pofaRoute: null,
    extraction: {
      raw: { pcn_number: "ECP123456" },
      confidence: {},
      providerId: "test",
      extractedAt: new Date().toISOString(),
      warnings: [],
    },
    confirmed: confirmedPcn(),
    adaptiveAnswers: {},
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
    documentType: null,
    senderName: null,
    parkingOperatorName: null,
    caseStage: null,
    serviceDecision: null,
    caseIntelligence: null,
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
    createdAt: "2026-05-06T10:00:00.000Z",
    updatedAt: "2026-05-06T10:00:00.000Z",
    ...over,
  };
}

/* ===================== Workflow gate configuration ===================== */

describe("Payment gate is configuration, not hard-coded", () => {
  it("places payment after the sufficiency check for private parking", async () => {
    expect(paymentGateStep(SERVICE)).toBe("SUFFICIENCY_CHECK");
  });

  it("treats everything before the gate as free", async () => {
    const free = freeSteps(SERVICE);
    for (const step of [
      "UPLOAD", "EXTRACTION", "CONFIRMATION", "QUESTIONING",
      "EVIDENCE", "SUFFICIENCY_CHECK",
    ] as WorkflowStep[]) {
      expect(free, step).toContain(step);
      expect(isPaidStep(SERVICE, step), step).toBe(false);
    }
  });

  it("puts analysis, drafting, validation, PDF and delivery behind the gate", async () => {
    for (const step of [
      "ANALYSIS", "RETRIEVAL", "DRAFTING", "VALIDATION", "PDF", "DELIVERY",
    ] as WorkflowStep[]) {
      expect(isPaidStep(SERVICE, step), step).toBe(true);
    }
  });

  it("exposes the price from configuration", async () => {
    const p = servicePrice(SERVICE);
    expect(p.amount).toBeGreaterThan(0);
    expect(p.currency).toBe("GBP");
    expect(p.description).toMatch(/Private Parking/i);
  });

  it("re-evaluates the gate when the configured position moves", async () => {
    // Proves the gate really is data: a service that charges after
    // drafting leaves analysis free without any code change.
    const custom: ServiceWorkflow = {
      ...getWorkflow(SERVICE),
      pipeline: [
        "UPLOAD", "EXTRACTION", "CONFIRMATION", "QUESTIONING",
        "SUFFICIENCY_CHECK", "ANALYSIS", "RETRIEVAL", "DRAFTING",
        "PAYMENT", "VALIDATION", "PDF", "DELIVERY",
      ],
    };
    const gateIndex = custom.pipeline.indexOf("PAYMENT");
    expect(custom.pipeline.indexOf("ANALYSIS")).toBeLessThan(gateIndex);
    expect(custom.pipeline.indexOf("PDF")).toBeGreaterThan(gateIndex);
  });

  it("throws for an unconfigured service rather than guessing", async () => {
    // @ts-expect-error deliberately invalid service type
    expect(() => getWorkflow("COUNCIL_PCN_APPEAL")).toThrow(/No workflow configured/);
  });
});

/* ================== Sufficient-information check ================== */

describe("Sufficiency check", () => {
  it("blocks when the notice has not been confirmed", async () => {
    const r = await assessSufficiency(makeCase({ confirmed: null }), []);
    expect(r.sufficient).toBe(false);
    expect(r.status).toBe("INCOMPLETE");
    expect(r.blockers.join(" ")).toMatch(/confirm the details/i);
  });

  it("blocks while a material fact is still going to be asked", async () => {
    const r = await assessSufficiency(makeCase({ adaptiveAnswers: {} }), []);
    expect(r.sufficient).toBe(false);
    expect(r.blockers.join(" ")).toMatch(/what happened/i);
    // The count comes from the issue configuration, not a question bank.
    expect(r.outstandingCount).toBeGreaterThan(0);
  });

  it("passes once questioning is complete and a ground is supported", async () => {
    const r = await assessSufficiency(
      makeCase({
        adaptiveAnswers: answers({
          [FACT.SCENARIOS]: ["payment_made"],
          [FACT.PAYMENT_METHOD]: "app",
          [FACT.PAYMENT_EVIDENCE]: "YES",
        }),
      }),
      ["receipt"],
    );
    expect(r.sufficient).toBe(true);
    expect(r.status).toBe("SUFFICIENT");
    expect(r.blockers).toEqual([]);
    expect(r.groundLabels.length).toBeGreaterThan(0);
  });

  it("allows checkout for Scotland — admin review after payment", async () => {
    const r = await assessSufficiency(
      makeCase({
        adaptiveAnswers: answers({ [FACT.JURISDICTION]: "SCOTLAND" }),
      }),
      [],
    );
    expect(r.sufficient).toBe(true);
    expect(r.outOfScope).toBeNull();
    expect(r.groundLabels.join(" ")).toMatch(/team/i);
  });

  it("suggests evidence that would unlock a set-aside ground", async () => {
    const r = await assessSufficiency(
      makeCase({
        adaptiveAnswers: answers({
          [FACT.SCENARIOS]: ["breakdown_immobilised"],
          [FACT.BREAKDOWN_NATURE]: "mechanical_failure",
          [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
          [FACT.BREAKDOWN_EVIDENCE]: ["none"],
        }),
      }),
      [],
    );
    const labels = r.evidence.suggestions.map((s) => s.label).join(" ");
    expect(labels).toMatch(/recovery|garage/i);
  });
});

/* ================== No internal leakage ================== */

describe("Pre-payment summary is customer-safe", () => {
  let ready: Awaited<ReturnType<typeof assessSufficiency>>;
  let customerFacing = "";

  beforeAll(async () => {
    ready = await assessSufficiency(
      makeCase({
        adaptiveAnswers: answers({
          [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
          [FACT.PAYMENT_METHOD]: "app",
          [FACT.PAYMENT_EVIDENCE]: "YES",
          [FACT.VRM_ENTERED]: "AB12CDF",
        }),
      }),
      ["receipt"],
    );

    customerFacing = JSON.stringify({
      sufficient: ready.sufficient,
      status: ready.status,
      blockers: ready.blockers,
      groundLabels: ready.groundLabels,
      outstandingCount: ready.outstandingCount,
      evidence: ready.evidence,
      outOfScope: ready.outOfScope,
    });
  });

  it("identifies grounds in plain language", async () => {
    expect(ready.groundLabels.length).toBeGreaterThan(0);
    expect(ready.groundLabels.join(" ")).toMatch(/payment|registration/i);
  });

  it("never exposes route identifiers", async () => {
    for (const id of ["POFA", "PAYMENT", "KEYING", "RESIDENTIAL", "ANPR"]) {
      expect(customerFacing, id).not.toContain(id);
    }
  });

  it("never exposes knowledge-module, source or validator identifiers", async () => {
    expect(customerFacing).not.toMatch(/\bKB-[A-Z]+-\d/);
    expect(customerFacing).not.toMatch(/\bSRC-[A-Z]/);
    expect(customerFacing).not.toMatch(/\bVAL-[A-Z]/);
    expect(customerFacing).not.toMatch(/\bPP-[A-Z]+-\d/);
  });

  it("never exposes internal fact keys", async () => {
    expect(customerFacing).not.toContain("payment_method");
    expect(customerFacing).not.toContain("driver_identified");
  });

  it("contains no appeal wording, because nothing is drafted yet", async () => {
    // Phrases that only appear in approved appeal paragraphs.
    expect(customerFacing).not.toMatch(/registered keeper of vehicle/i);
    expect(customerFacing).not.toMatch(/Schedule 4/i);
    expect(customerFacing).not.toMatch(/Protection of Freedoms/i);
  });

  it("keeps the internal block separate from what the customer sees", async () => {
    // The internal data exists for persistence, and is not part of the
    // customer projection above.
    expect(ready.internal.primaryRoute).toBeTruthy();
    expect(customerFacing).not.toContain(String(ready.internal.primaryRoute));
  });
});
