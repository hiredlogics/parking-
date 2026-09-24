/**
 * Private Parking V2 Regression & Synthetic Test Pack
 *
 * Mirrors Private_Parking_V2_Regression_Test_Pack.docx — Case Intelligence,
 * adaptive gaps, PoFA bank holidays, ANPR vs allegation, free-text facts.
 *
 * Recommended immediate order: T01–T03, T05, T07, T08, T17, T20 (+ baselines).
 */
import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { classifyGrounds } from "@/lib/cases/groundsAuthority";
import { buildCaseIntelligence } from "@/lib/cases/caseIntelligence";
import { deriveKnownFacts, FACT } from "@/lib/facts/facts";
import { applyDocumentImplications } from "@/lib/facts/documentImplications";
import { resolveFactGap } from "@/lib/facts/gapResolver";
import { analysePofa, addWorkingDays } from "@/lib/analysis/pofa";
import {
  englandWalesBankHolidays,
  isEnglandWalesBankHoliday,
} from "@/lib/analysis/englandWalesHolidays";
import { resolveSuitability } from "@/lib/cases/caseIntelligence";

const pcn = (over: Partial<ConfirmedPcn>): ConfirmedPcn =>
  ({
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    operator_name: "Test Operator",
    pcn_number: "TEST001",
    vrm: "AB12CDE",
    ...over,
  }) as ConfirmedPcn;

const keeper = {
  jurisdiction: "ENGLAND_WALES",
  registered_keeper: "YES",
  driver_identified: "NO",
};

async function gapFor(
  confirmed: ConfirmedPcn,
  answers: Record<string, unknown>,
) {
  const facts = applyDocumentImplications(
    deriveKnownFacts({ confirmed, answers, evidenceTypes: [] }),
  );
  const ci = buildCaseIntelligence({
    confirmed,
    answers,
    evidenceTypes: [],
    knownFactsOverride: facts,
  });
  const gap = await resolveFactGap({
    facts,
    evidenceTypes: [],
    caseIntelligence: ci,
  });
  return { facts, ci, gap, grounds: classifyGrounds({ confirmed, answers }) };
}

describe("V2 Regression Pack — PoFA timing", () => {
  it("T01 — Late postal NTK: PoFA timing failure with dates", () => {
    const confirmed = pcn({
      parking_event_date: "2026-09-01",
      notice_issue_date: "2026-09-16",
      alleged_breach: null,
    });
    const g = classifyGrounds({ confirmed, answers: keeper });
    expect(g.pofa_analysis.timingStatus).toBe("FAILED");
    expect(g.supported_grounds.some((x) => x.code === "POFA_TIMING")).toBe(
      true,
    );
    expect(g.pofa_analysis.deadline).toBeTruthy();
    expect(g.pofa_analysis.noticeGivenDate).toBeTruthy();
    expect(g.pofa_analysis.daysLate).toBeGreaterThan(0);
    expect(g.supported_grounds.map((x) => x.code)).not.toContain(
      "ANPR_OVERSTAY",
    );
  });

  it("T02 — Compliant postal NTK: no false PoFA ground", () => {
    // Wise-style: event 8 Sep, notice 14 Sep → within window
    const confirmed = pcn({
      parking_event_date: "2026-09-08",
      notice_issue_date: "2026-09-14",
      entry_time: "09:07",
      exit_time: "16:28",
      alleged_breach: "No Permit",
    });
    const g = classifyGrounds({ confirmed, answers: keeper });
    expect(g.pofa_analysis.timingStatus).toBe("COMPLIANT");
    expect(g.supported_grounds.map((x) => x.code)).not.toContain("POFA_TIMING");
  });

  it("T03 — Bank holiday: 27 Aug 2026 → deemed 1 Sep, 8 days late", () => {
    expect(englandWalesBankHolidays(2026).has("2026-08-31")).toBe(true);
    expect(
      isEnglandWalesBankHoliday(new Date(Date.UTC(2026, 7, 31))),
    ).toBe(true);
    expect(
      addWorkingDays(new Date(Date.UTC(2026, 7, 27)), 2)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-09-01");

    const confirmed = pcn({
      operator_name: "Smart Parking Ltd",
      pcn_number: "SP62712518",
      vrm: "FD18BOF",
      parking_location: "B&M Chatham - ME4 4HA",
      parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27",
      entry_time: "19:06",
      exit_time: "20:41",
      total_recorded_duration: 95,
      charge_amount: 90,
    });
    const p = analysePofa({
      facts: deriveKnownFacts({ confirmed, answers: keeper }),
    });
    expect(p.deadline).toBe("2026-08-24");
    expect(p.noticeGivenDate).toBe("2026-09-01");
    expect(p.daysLate).toBe(8);
    expect(p.timingStatus).toBe("FAILED");
  });

  it("T04 — Christmas/New Year working days exclude holidays", () => {
    const hols = englandWalesBankHolidays(2026);
    expect(hols.has("2026-12-25")).toBe(true);
    expect(hols.has("2026-12-28")).toBe(true); // Boxing Day observed (Sat 26 → Mon 28)
    // Posted Wed 23 Dec 2026 → Thu 24 WD1, Fri 25 Xmas, Mon 28 Boxing observed —
    // next working days: Tue 29 = WD2 if counting from 23... 
    // From Tue 22 Dec +2 WD: Wed 23, Thu 24 = 2026-12-24
    expect(
      addWorkingDays(new Date(Date.UTC(2026, 11, 22)), 2)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-12-24");
    // From Wed 24 Dec +2 WD: Thu 25 Xmas, Fri–Sun non-working, Mon 28 Boxing
    // observed → Tue 29 = WD1, Wed 30 = WD2.
    expect(
      addWorkingDays(new Date(Date.UTC(2026, 11, 24)), 2)
        .toISOString()
        .slice(0, 10),
    ).toBe("2026-12-30");
  });
});

describe("V2 Regression Pack — allegation + ANPR + free text", () => {
  it("T05 — No Permit: PERMIT gap, not ANPR_OVERSTAY", async () => {
    const confirmed = pcn({
      operator_name: "Wise Parking Ltd",
      pcn_number: "AP539112",
      parking_location: "Queen Elizabeth Hospital - Car Park 1",
      parking_event_date: "2026-09-08",
      notice_issue_date: "2026-09-14",
      entry_time: "09:07",
      exit_time: "16:28",
      total_recorded_duration: 441,
      alleged_breach: "No Permit",
      charge_amount: 80,
    });
    const { grounds, gap } = await gapFor(confirmed, keeper);
    expect(grounds.pofa_analysis.timingStatus).toBe("COMPLIANT");
    expect(grounds.primary_ground).toBe("PERMIT");
    expect(grounds.unresolved_grounds.map((g) => g.code)).toContain("PERMIT");
    expect(grounds.unresolved_grounds.map((g) => g.code)).toContain(
      "ANPR_EVIDENCE",
    );
    expect(
      [...grounds.supported_grounds, ...grounds.unresolved_grounds].map(
        (g) => g.code,
      ),
    ).not.toContain("ANPR_OVERSTAY");
    expect(gap.gap?.factKey).toBe("permission_held");
  });

  it("T07 — Free-text left-and-returned: no continuous_presence re-ask", async () => {
    const confirmed = pcn({
      operator_name: "Euro Car Parks",
      pcn_number: "88812545842",
      parking_event_date: "2026-08-29",
      notice_issue_date: "2026-09-04",
      entry_time: "13:05",
      exit_time: "14:14",
      total_recorded_duration: 69,
      alleged_breach:
        "A voucher/receipt was not validated at the kiosk during the time period the vehicle was on site",
    });
    const answers = {
      ...keeper,
      situation_other:
        "I left the site and returned later — two separate visits the same day.",
    };
    const { facts, grounds, gap } = await gapFor(confirmed, answers);
    expect(facts.values[FACT.CONTINUOUS_PRESENCE]).toBe("NO");
    expect(facts.values[FACT.VISIT_COUNT]).toBe(2);
    expect(grounds.supported_grounds.map((g) => g.code)).toContain(
      "ANPR_EVIDENCE",
    );
    expect(grounds.supported_grounds.map((g) => g.code)).not.toContain(
      "ANPR_OVERSTAY",
    );
    expect(grounds.primary_ground).toBe("PAYMENT");
    expect(gap.gap?.factKey).toBe("payment_made");
    expect(gap.gap?.factKey).not.toBe("continuous_presence");
  });

  it("T08 — Continuous stay: no invented double visit support", () => {
    const confirmed = pcn({
      parking_event_date: "2026-07-03",
      notice_issue_date: "2026-07-09",
      entry_time: "11:20",
      exit_time: "14:55",
      total_recorded_duration: 215,
      alleged_breach: "Overstaying the maximum permitted free stay of 180 minutes",
    });
    const g = classifyGrounds({
      confirmed,
      answers: { ...keeper, continuous_presence: "YES" },
    });
    // Duration allegation may support ANPR_OVERSTAY; must not support ANPR_EVIDENCE pairing
    expect(g.supported_grounds.map((x) => x.code)).not.toContain(
      "ANPR_EVIDENCE",
    );
    const anprEvidence = g.possible_grounds.find(
      (x) => x.code === "ANPR_EVIDENCE",
    );
    // If present at all, must not be supported with two-visit claim
    expect(anprEvidence?.status === "supported").not.toBe(true);
  });
});

describe("V2 Regression Pack — routing / weak case", () => {
  it("T17 — Debt recovery letter: not supported for initial appeal", () => {
    const suitability = resolveSuitability({
      serviceDecision: "NOT_SUPPORTED",
      triageServiceDecision: "WRONG_STAGE_REDIRECT",
      triageDetail: "Debt recovery letter — not an initial operator appeal.",
    });
    expect(suitability.decision).toBe("NOT_SUPPORTED");
  });

  it("T20 — Compliant notice + weak case: no invented PoFA/ANPR_OVERSTAY", () => {
    const confirmed = pcn({
      parking_event_date: "2026-09-08",
      notice_issue_date: "2026-09-14",
      entry_time: "10:00",
      exit_time: "10:45",
      alleged_breach: "No Permit",
    });
    const g = classifyGrounds({
      confirmed,
      answers: { ...keeper, permission_held: "NO", continuous_presence: "YES" },
    });
    expect(g.pofa_analysis.timingStatus).toBe("COMPLIANT");
    expect(g.supported_grounds.map((x) => x.code)).not.toContain("POFA_TIMING");
    expect(g.supported_grounds.map((x) => x.code)).not.toContain(
      "ANPR_OVERSTAY",
    );
    expect(g.rejected_grounds.map((x) => x.code)).toContain("PERMIT");
  });
});

describe("V2 Regression Pack — baseline real notices (CI)", () => {
  it("Euro late postal overstay: POFA supported, dates present", () => {
    const confirmed = pcn({
      operator_name: "Euro Car Parks",
      pcn_number: "88812303053",
      parking_location: "Sainsburys - Harringay",
      parking_event_date: "2026-07-17",
      notice_issue_date: "2026-07-30",
      entry_time: "13:39",
      exit_time: "17:06",
      total_recorded_duration: 207,
      charge_amount: 100,
      alleged_breach:
        "Your vehicle has overstayed the maximum time period allowed",
    });
    const g = classifyGrounds({ confirmed, answers: keeper });
    expect(g.supported_grounds.some((x) => x.code === "POFA_TIMING")).toBe(
      true,
    );
    expect(g.pofa_analysis.daysLate).toBe(3);
    expect(g.pofa_analysis.deadline).toBe("2026-07-31");
    expect(g.pofa_analysis.noticeGivenDate).toBe("2026-08-03");
  });

  it("Smart Parking bank-holiday late: 8 days", () => {
    const confirmed = pcn({
      operator_name: "Smart Parking Ltd",
      parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27",
      entry_time: "19:06",
      exit_time: "20:41",
    });
    const g = classifyGrounds({ confirmed, answers: keeper });
    expect(g.pofa_analysis.noticeGivenDate).toBe("2026-09-01");
    expect(g.pofa_analysis.daysLate).toBe(8);
  });
});
