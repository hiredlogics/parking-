/**
 * Acceptance: Case Intelligence before questions.
 *
 * Late-NTK dates must produce identified_issues including
 * possible_late_notice BEFORE the question engine runs.
 */
import { describe, expect, it } from "vitest";
import { buildCaseIntelligence } from "@/lib/cases/caseIntelligence";
import { assessPossibleLateNoticeFromDates } from "@/lib/analysis/pofa";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import { FACT } from "@/lib/facts/facts";

describe("Case Intelligence — late notice before questions", () => {
  it("date screen flags possible_late_notice from event + issue dates alone", () => {
    // Event 1 May, notice issued 20 May → given ~22 May, deadline 15 May → late
    const screen = assessPossibleLateNoticeFromDates({
      parkingEventDate: "2026-05-01",
      noticeIssueDate: "2026-05-20",
      noticeRoute: "POSTAL",
    });
    expect(screen.possible).toBe(true);
    expect(screen.timingStatus).toBe("FAILED");
    expect(screen.supportingFacts.parking_event_date).toBe("2026-05-01");
    expect(screen.supportingFacts.notice_issue_date).toBe("2026-05-20");
    expect(screen.missingFacts).toEqual(
      expect.arrayContaining([
        FACT.REGISTERED_KEEPER,
        FACT.DRIVER_IDENTIFIED,
      ]),
    );
  });

  it("buildCaseIntelligence stores possible_late_notice before any answers", () => {
    const intelligence = buildCaseIntelligence({
      confirmed: {
        operator_name: "ParkingEye Ltd",
        pcn_number: "PE123",
        vrm: "AB12CDE",
        parking_location: "Retail Park",
        parking_event_date: "2026-05-01",
        notice_issue_date: "2026-05-20",
        notice_route: "POSTAL",
        case_stage: "INITIAL_OPERATOR_APPEAL",
        confirmedAt: new Date().toISOString(),
      },
      answers: {},
    });

    expect(intelligence.identifiedIssues.map((i) => i.code)).toContain(
      "possible_late_notice",
    );
    const issue = intelligence.identifiedIssues.find(
      (i) => i.code === "possible_late_notice",
    )!;
    expect(issue.supportingFacts).toMatchObject({
      parking_event_date: "2026-05-01",
      notice_issue_date: "2026-05-20",
    });
    expect(issue.missingFacts.length).toBeGreaterThan(0);
    expect(intelligence.knowledgeRefs.length).toBeGreaterThan(0);
  });

  it("question engine receives intelligence and prioritises late-notice clarifications", async () => {
    const confirmed = {
      operator_name: "ParkingEye Ltd",
      pcn_number: "PE123",
      vrm: "AB12CDE",
      parking_location: "Retail Park",
      parking_event_date: "2026-05-01",
      notice_issue_date: "2026-05-20",
      notice_route: "POSTAL" as const,
      case_stage: "INITIAL_OPERATOR_APPEAL" as const,
      confirmedAt: new Date().toISOString(),
    };
    const intelligence = buildCaseIntelligence({ confirmed, answers: {} });
    expect(
      intelligence.identifiedIssues.some((i) => i.code === "possible_late_notice"),
    ).toBe(true);

    const out = await nextDynamicQuestion({
      confirmed,
      answers: {},
      provider: null,
      caseIntelligence: intelligence,
    });

    // Must ask something — clarifications for the late-notice ground — not skip.
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.eligibleRoutes).toContain("POFA");
      // First questions should include keeper/driver/jurisdiction-style facts,
      // not residential permission.
      expect([
        FACT.REGISTERED_KEEPER,
        FACT.DRIVER_IDENTIFIED,
        FACT.JURISDICTION,
        FACT.VEHICLE_HIRE_STATUS,
        FACT.NOTICE_ROUTE,
        FACT.SCENARIOS,
      ]).toContain(out.targetFact);
      expect([
        FACT.PERMISSION_HELD,
        FACT.OCCUPIER_STATUS,
        FACT.AGREEMENT_UPLOADED,
      ]).not.toContain(out.targetFact);
    }
  });

  it("timely notice does not invent possible_late_notice", () => {
    const intelligence = buildCaseIntelligence({
      confirmed: {
        operator_name: "ParkingEye Ltd",
        parking_event_date: "2026-05-01",
        notice_issue_date: "2026-05-03",
        notice_route: "POSTAL",
        confirmedAt: new Date().toISOString(),
      },
      answers: {},
    });
    expect(intelligence.identifiedIssues.map((i) => i.code)).not.toContain(
      "possible_late_notice",
    );
  });
});
