/**
 * @vitest-environment node
 *
 * Phase 9 acceptance — the three scenarios the client reported.
 *
 * These assert INTELLIGENCE OUTCOMES, never question wording. Each one
 * exists because it failed in production:
 *
 *   A  A notice served long out of time produced no technical ground.
 *   B  A debt-recovery letter was carried into questioning and payment.
 *   C  Residential / permission questionnaires opened for a case where
 *      nothing in the document or the answers supported them.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildCaseIntelligence,
  resolveSuitability,
} from "@/lib/cases/caseIntelligence";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import { FACT } from "@/lib/questions/facts";
import { serialiseDraftingContext } from "@/services/ai/drafting/contextSerialiser";
import type { ConfirmedPcn } from "@/types";
import type { DraftingContext, DraftResult } from "@/services/ai/types";

/** Facts that must never open without support. */
const UNSUPPORTED_FACTS = [
  FACT.PERMISSION_HELD,
  FACT.PERMISSION_SOURCE,
  FACT.OCCUPIER_STATUS,
  FACT.AGREEMENT_UPLOADED,
];

function confirmed(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP123456",
    vrm: "AB12CDE",
    parking_location: "Sears Retail Park",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: new Date().toISOString(),
    ...over,
  } as ConfirmedPcn;
}

describe("Scenario A — Notice to Keeper served out of time", () => {
  // Event 1 May, notice issued 14 June: deemed given 16 June against a
  // 15 May deadline. Roughly a month late — unmissable.
  const lateNtk = confirmed({
    parking_event_date: "2026-05-01",
    notice_issue_date: "2026-06-14",
    notice_route: "POSTAL",
  });

  it("establishes the PoFA timing ground from the document alone", () => {
    const ci = buildCaseIntelligence({ confirmed: lateNtk, answers: {} });

    const finding = ci.technicalFindings.find(
      (f) => f.ground === "POFA_TIMING_FAILURE",
    );
    expect(finding).toBeTruthy();
    expect(finding!.status).toBe("IDENTIFIED");
    expect(finding!.knowledgeRefs.length).toBeGreaterThan(0);
    expect(Number(finding!.evidence.daysLate)).toBeGreaterThan(0);
    expect(finding!.reasons.join(" ")).toMatch(/\d+ day/i);
  });

  it("still finds it when the document does not state how it was served", () => {
    // The production failure: notice_route UNKNOWN erased a ground the
    // dates alone prove. Route is a refinement, not a precondition.
    const ci = buildCaseIntelligence({
      confirmed: confirmed({
        parking_event_date: "2026-05-01",
        notice_issue_date: "2026-06-14",
        notice_route: "UNKNOWN",
      }),
      answers: {},
    });

    expect(ci.identifiedIssues.map((i) => i.code)).toContain(
      "possible_late_notice",
    );
    expect(
      ci.technicalFindings.some((f) => f.ground === "POFA_TIMING_FAILURE"),
    ).toBe(true);
    // And it says out loud that service method is assumed, not known.
    expect(ci.warnings.join(" ")).toMatch(/method of service/i);
  });

  it("does not invent the ground when the notice was served in time", () => {
    const ci = buildCaseIntelligence({
      confirmed: confirmed({
        parking_event_date: "2026-05-01",
        notice_issue_date: "2026-05-03",
        notice_route: "POSTAL",
      }),
      answers: {},
    });
    expect(ci.identifiedIssues.map((i) => i.code)).not.toContain(
      "possible_late_notice",
    );
    expect(
      ci.technicalFindings.some(
        (f) => f.ground === "POFA_TIMING_FAILURE" && f.status === "IDENTIFIED",
      ),
    ).toBe(false);
  });

  it("carries the ground into the drafting prompt", async () => {
    // By drafting time the keeper clarifications the ground needs have
    // been answered — that is what the questions exist to collect.
    const answers = {
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.JURISDICTION]: "ENGLAND_WALES",
    };
    const ci = buildCaseIntelligence({ confirmed: lateNtk, answers });

    // Without a database there is no rules basis and no KB module, and
    // drafting stops at NO_APPROVED_MODULES before any provider runs.
    // Supply a minimal basis so the provider is reached.
    vi.doMock("@/lib/appeals/rulesPromptBasis", () => ({
      buildRulesPromptBasis: async () => ({
        activeRoutes: ["POFA"],
        matchedRuleIds: ["PP-POFA-003"],
        matchedRuleDescriptions: ["Notice served outside the statutory period."],
        approvedParagraphTexts: [
          "The notice was not served within the period allowed.",
        ],
        assembledBody: "The notice was not served within the period allowed.",
      }),
    }));

    // Capture the context the model would actually receive.
    let seen: DraftingContext | null = null;
    vi.doMock("@/services/ai/drafting", () => ({
      getDraftingProvider: () => ({
        id: "capture",
        displayName: "capture",
        bespoke: true,
        draft: async (ctx: DraftingContext): Promise<DraftResult> => {
          seen = ctx;
          return {
            body: "The operator did not serve the notice within the period allowed.",
            providerId: "capture",
            promptVersion: "test",
            model: null,
            bespoke: true,
            moduleIds: [],
            warnings: [],
          };
        },
      }),
    }));

    const { draftAppeal } = await import("@/lib/drafting/engine");
    await draftAppeal({
      confirmed: lateNtk,
      answers,
      intelligence: ci,
      modules: [],
      sources: [],
      blocks: [],
    });
    vi.doUnmock("@/services/ai/drafting");
    vi.doUnmock("@/lib/appeals/rulesPromptBasis");

    expect(seen).toBeTruthy();
    const passed = seen!.intelligence;
    expect(passed).toBeTruthy();
    expect(passed!.technicalFindings.map((f) => f.ground)).toContain(
      "POFA_TIMING_FAILURE",
    );

    // And the serialiser actually puts it in front of the model.
    const prompt = serialiseDraftingContext(seen!);
    expect(prompt).toMatch(/TECHNICAL GROUNDS ALREADY ESTABLISHED/);
    expect(prompt).toContain("POFA_TIMING_FAILURE");
  });
});

describe("Scenario B — Debt Recovery Plus letter", () => {
  const drpUnderstanding = {
    documentType: "DEBT_RECOVERY" as never,
    senderName: "Debt Recovery Plus Ltd",
    parkingOperatorName: "Euro Car Parks",
    caseStage: "DEBT_RECOVERY" as never,
    serviceDecision: "NOT_SUPPORTED" as never,
  };

  const drpCase = confirmed({
    operator_name: "Euro Car Parks",
    case_stage: "DEBT_RECOVERY",
    parking_event_date: "2026-05-04",
    notice_issue_date: "2026-08-20",
  });

  it("records NOT_SUPPORTED and keeps the sender separate from the operator", () => {
    const ci = buildCaseIntelligence({
      confirmed: drpCase,
      answers: {},
      documentUnderstanding: drpUnderstanding,
    });

    expect(ci.suitability.decision).toBe("NOT_SUPPORTED");
    expect(ci.documentUnderstanding?.sender).toMatch(/Debt Recovery Plus/i);
    expect(ci.documentUnderstanding?.operator).toBe("Euro Car Parks");
    expect(ci.documentUnderstanding?.stage).toBe("DEBT_RECOVERY");
    expect(ci.warnings.join(" ")).toMatch(/not suitable/i);
  });

  it("is the authority the gates read, and NOT_SUPPORTED cannot be overridden", () => {
    const ci = buildCaseIntelligence({
      confirmed: drpCase,
      answers: {},
      documentUnderstanding: drpUnderstanding,
    });

    // Even if a stale column says the service is fine, the record wins.
    expect(
      resolveSuitability({
        caseIntelligence: ci,
        serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
      }).decision,
    ).toBe("NOT_SUPPORTED");
  });

  it("refuses payment before a customer can be charged", async () => {
    vi.doMock("@/lib/cases/service", () => ({
      requireCaseAccess: async () => ({
        ok: true,
        appealCase: {
          id: "case_drp",
          serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
          sufficiencyStatus: "SUFFICIENT",
          paymentStatus: "UNPAID",
          serviceDecision: "NOT_SUPPORTED",
          outOfScopeDetail: null,
          extraction: null,
          caseIntelligence: buildCaseIntelligence({
            confirmed: drpCase,
            answers: {},
            documentUnderstanding: drpUnderstanding,
          }),
        },
      }),
    }));

    const { startCheckout } = await import("@/lib/payments/service");
    const result = await startCheckout("case_drp", {
      userId: "u1",
      kind: "CUSTOMER",
    } as never);
    vi.doUnmock("@/lib/cases/service");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(409);
      expect(result.code).toBe("WRONG_DOCUMENT_STAGE");
    }
  });

  it("asks nothing — questioning stops before the first fact", async () => {
    const out = await nextDynamicQuestion({
      confirmed: drpCase,
      answers: {},
      provider: null,
      caseIntelligence: buildCaseIntelligence({
        confirmed: drpCase,
        answers: {},
        documentUnderstanding: drpUnderstanding,
      }),
    });
    expect(out.status).not.toBe("QUESTION_REQUIRED");
  });
});

describe("Scenario C — grace period only", () => {
  const graceCase = confirmed({
    alleged_breach: "Unauthorised parking",
    parking_location: "Hospital car park",
    parking_event_date: "2026-05-01",
    notice_issue_date: "2026-05-06",
    notice_route: "POSTAL",
  });

  const graceAnswers = {
    [FACT.SCENARIOS]: ["grace_or_exit"],
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
  };

  it("does not ask for permission, occupier status or a lease", async () => {
    const ci = buildCaseIntelligence({
      confirmed: graceCase,
      answers: graceAnswers,
    });

    const out = await nextDynamicQuestion({
      confirmed: graceCase,
      answers: graceAnswers,
      provider: null,
      caseIntelligence: ci,
    });

    if (out.status === "QUESTION_REQUIRED") {
      // The whole outstanding plan, not just the next question.
      for (const fact of UNSUPPORTED_FACTS) {
        expect(out.missingFacts).not.toContain(fact);
      }
      expect(UNSUPPORTED_FACTS).not.toContain(out.targetFact);
    }
  });

  it("does not list residential or permission facts as outstanding", () => {
    const ci = buildCaseIntelligence({
      confirmed: graceCase,
      answers: graceAnswers,
    });
    for (const fact of UNSUPPORTED_FACTS) {
      expect(ci.missingFacts).not.toContain(fact);
    }
  });

  it("only Case Intelligence can open them — a bare allegation cannot", () => {
    // "Unauthorised parking" on the notice is an allegation, not a
    // finding. Nothing here supports a residential or permission ground.
    const ci = buildCaseIntelligence({ confirmed: graceCase, answers: {} });
    const grounds = ci.technicalFindings
      .filter((f) => f.status === "IDENTIFIED")
      .map((f) => f.ground);
    expect(grounds).not.toContain("RESIDENTIAL");
    expect(grounds).not.toContain("AUTHORISATION");
  });
});
