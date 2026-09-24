/**
 * Case Intelligence authority — allegation keywords must not open grounds;
 * document timing establishes ANPR images without asking the customer.
 */
import { describe, expect, it } from "vitest";
import { buildCaseIntelligence } from "@/lib/cases/caseIntelligence";
import { classifyGrounds } from "@/lib/cases/groundsAuthority";
import { deriveKnownFacts, FACT } from "@/lib/facts/facts";
import {
  applyDocumentImplications,
  documentImpliedFacts,
} from "@/lib/facts/documentImplications";
import { resolveFactGap } from "@/lib/facts/gapResolver";
import type { ConfirmedPcn } from "@/types";

const euroLike: ConfirmedPcn = {
  operator_name: "Euro Car Parks",
  pcn_number: "88812303053",
  vrm: "KS58OPW",
  parking_location: "Sainsburys - Harringay",
  parking_event_date: "2026-07-17",
  notice_issue_date: "2026-07-30",
  notice_route: "POSTAL",
  entry_time: "13:39",
  exit_time: "17:06",
  total_recorded_duration: 207,
  charge_amount: 100,
  alleged_breach:
    "Your vehicle has overstayed the maximum time period allowed",
  uk_jurisdiction: "ENGLAND_WALES",
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: "2026-09-24T18:07:25.019Z",
} as ConfirmedPcn;

describe("Case Intelligence authority model", () => {
  it("does not support GRACE/CONSIDERATION from allegation keywords alone", () => {
    const grounds = classifyGrounds({
      confirmed: euroLike,
      answers: { jurisdiction: "ENGLAND_WALES", registered_keeper: "YES" },
      evidenceTypes: [],
    });
    expect(
      grounds.supported_grounds.map((g) => g.code),
    ).not.toContain("GRACE_PERIOD");
    expect(
      grounds.supported_grounds.map((g) => g.code),
    ).not.toContain("CONSIDERATION_PERIOD");
  });

  it("supports POFA_TIMING from event + notice dates", () => {
    const grounds = classifyGrounds({
      confirmed: euroLike,
      answers: {
        jurisdiction: "ENGLAND_WALES",
        registered_keeper: "YES",
        driver_identified: "NO",
      },
      evidenceTypes: [],
    });
    expect(grounds.supported_grounds.some((g) => g.code === "POFA_TIMING")).toBe(
      true,
    );
    expect(grounds.pofa_analysis.timingStatus).toBe("FAILED");
    expect(grounds.pofa_analysis.daysLate).toBe(3);
    expect(grounds.routes_in_play).toContain("POFA");
  });

  it("implies anpr_images_on_notice from entry/exit and does not ask it", async () => {
    const facts = applyDocumentImplications(
      deriveKnownFacts({
        confirmed: euroLike,
        answers: { registered_keeper: "YES", driver_identified: "NO" },
        evidenceTypes: [],
      }),
    );
    expect(documentImpliedFacts(facts)[FACT.ANPR_IMAGES_ON_NOTICE] ?? facts.known.has(FACT.ANPR_IMAGES_ON_NOTICE)).toBeTruthy();
    expect(facts.known.has(FACT.ANPR_IMAGES_ON_NOTICE)).toBe(true);
    expect(facts.values[FACT.ANPR_IMAGES_ON_NOTICE]).toBe("YES");

    const ci = buildCaseIntelligence({
      confirmed: euroLike,
      answers: { registered_keeper: "YES", driver_identified: "NO" },
      evidenceTypes: [],
      knownFactsOverride: facts,
    });
    const gap = await resolveFactGap({
      facts,
      evidenceTypes: [],
      caseIntelligence: ci,
    });
    expect(gap.outstanding.map((m) => m.factKey)).not.toContain(
      "anpr_images_on_notice",
    );
    expect(gap.gap?.factKey).not.toBe("anpr_images_on_notice");
  });

  it("lists ANPR_OVERSTAY as possible/unresolved without forcing ANPR questions when PoFA is supported", async () => {
    const ci = buildCaseIntelligence({
      confirmed: euroLike,
      answers: {
        registered_keeper: "YES",
        driver_identified: "NO",
        jurisdiction: "ENGLAND_WALES",
      },
      evidenceTypes: [],
    });
    expect(ci.supported_grounds.some((g) => g.code === "POFA_TIMING")).toBe(
      true,
    );
    const anpr = [
      ...ci.supported_grounds,
      ...ci.possible_grounds,
      ...ci.unresolved_grounds,
    ].find((g) => g.code === "ANPR_OVERSTAY");
    expect(anpr).toBeTruthy();
    // Overstay allegation may support ANPR; PoFA already supported so
    // ANPR follow-up questions must not block the journey.
    const gap = await resolveFactGap({
      facts: applyDocumentImplications(
        deriveKnownFacts({
          confirmed: euroLike,
          answers: {
            registered_keeper: "YES",
            driver_identified: "NO",
            jurisdiction: "ENGLAND_WALES",
          },
          evidenceTypes: [],
        }),
      ),
      evidenceTypes: [],
      caseIntelligence: ci,
    });
    expect(gap.complete).toBe(true);
  });

  it("No Permit: PERMIT + ANPR_EVIDENCE (not OVERSTAY); asks permit then continuous presence", async () => {
    const wise: ConfirmedPcn = {
      operator_name: "Wise Parking Ltd",
      pcn_number: "AP539112",
      vrm: "LX71UNS",
      parking_location: "Queen Elizabeth Hospital - Car Park 1, London, SE18 4QH",
      parking_event_date: "2026-09-08",
      notice_issue_date: "2026-09-14",
      notice_route: "POSTAL",
      entry_time: "09:07",
      exit_time: "16:28",
      total_recorded_duration: 441,
      charge_amount: 80,
      alleged_breach: "No Permit",
      uk_jurisdiction: "ENGLAND_WALES",
      case_stage: "INITIAL_OPERATOR_APPEAL",
      confirmedAt: "2026-09-24T18:07:25.019Z",
    } as ConfirmedPcn;

    const answers = {
      registered_keeper: "YES",
      driver_identified: "NO",
      jurisdiction: "ENGLAND_WALES",
    };

    const grounds = classifyGrounds({ confirmed: wise, answers, evidenceTypes: [] });
    expect(grounds.pofa_analysis.timingStatus).toBe("COMPLIANT");
    expect(grounds.primary_ground).toBe("PERMIT");
    expect(grounds.supported_grounds.map((g) => g.code)).not.toContain(
      "ANPR_OVERSTAY",
    );
    expect(grounds.unresolved_grounds.map((g) => g.code)).toContain("PERMIT");
    expect(grounds.unresolved_grounds.map((g) => g.code)).toContain(
      "ANPR_EVIDENCE",
    );
    expect(grounds.unresolved_grounds.map((g) => g.code)).not.toContain(
      "ANPR_OVERSTAY",
    );
    expect(grounds.missing_material_facts.map((m) => m.factKey)).toEqual(
      expect.arrayContaining(["permission_held", "continuous_presence"]),
    );
    expect(
      grounds.missing_material_facts.find((m) => m.factKey === "permission_held")!
        .priority,
    ).toBeLessThan(
      grounds.missing_material_facts.find(
        (m) => m.factKey === "continuous_presence",
      )!.priority,
    );

    const ci = buildCaseIntelligence({
      confirmed: wise,
      answers,
      evidenceTypes: [],
    });
    const gap = await resolveFactGap({
      facts: applyDocumentImplications(
        deriveKnownFacts({ confirmed: wise, answers, evidenceTypes: [] }),
      ),
      evidenceTypes: [],
      caseIntelligence: ci,
    });
    expect(gap.complete).toBe(false);
    expect(gap.gap?.factKey).toBe("permission_held");

    const afterPermit = classifyGrounds({
      confirmed: wise,
      answers: { ...answers, permission_held: "YES", permission_source: "other" },
      evidenceTypes: [],
    });
    expect(afterPermit.supported_grounds.some((g) => g.code === "PERMIT")).toBe(
      true,
    );
    expect(afterPermit.unresolved_grounds.some((g) => g.code === "ANPR_EVIDENCE")).toBe(
      true,
    );
    expect(afterPermit.missing_material_facts.map((m) => m.factKey)).toContain(
      "continuous_presence",
    );

    const afterPresenceNo = classifyGrounds({
      confirmed: wise,
      answers: {
        ...answers,
        permission_held: "YES",
        permission_source: "other",
        continuous_presence: "NO",
        visit_count: 2,
      },
      evidenceTypes: [],
    });
    expect(
      afterPresenceNo.supported_grounds.some((g) => g.code === "ANPR_EVIDENCE"),
    ).toBe(true);
    expect(
      afterPresenceNo.supported_grounds.map((g) => g.code),
    ).not.toContain("ANPR_OVERSTAY");

    const afterPresenceYes = classifyGrounds({
      confirmed: wise,
      answers: {
        ...answers,
        permission_held: "YES",
        permission_source: "other",
        continuous_presence: "YES",
      },
      evidenceTypes: [],
    });
    const anprPossible = afterPresenceYes.possible_grounds.find(
      (g) => g.code === "ANPR_EVIDENCE",
    );
    expect(anprPossible?.status).toBe("possible");
    expect(
      afterPresenceYes.supported_grounds.map((g) => g.code),
    ).not.toContain("ANPR_EVIDENCE");
  });

  it("free-text left-and-returned sets continuous_presence and skips re-asking it", async () => {
    const willesden: ConfirmedPcn = {
      operator_name: "Euro Car Parks",
      pcn_number: "88812545842",
      vrm: "KJ19KYN",
      parking_location: "Sainsburys - Willesden Green",
      parking_event_date: "2026-08-29",
      notice_issue_date: "2026-09-04",
      notice_route: "POSTAL",
      entry_time: "13:05",
      exit_time: "14:14",
      total_recorded_duration: 69,
      charge_amount: 100,
      alleged_breach:
        "A voucher/receipt was not validated at the kiosk during the time period the vehicle was on site",
      uk_jurisdiction: "ENGLAND_WALES",
      case_stage: "INITIAL_OPERATOR_APPEAL",
      confirmedAt: "2026-09-24T18:07:25.019Z",
    } as ConfirmedPcn;

    const answers = {
      registered_keeper: "YES",
      driver_identified: "NO",
      jurisdiction: "ENGLAND_WALES",
      situation_other:
        "I left the site and returned later the same day — it was two separate visits.",
    };

    const facts = deriveKnownFacts({
      confirmed: willesden,
      answers,
      evidenceTypes: [],
    });
    expect(facts.values.continuous_presence).toBe("NO");
    expect(facts.values.visit_count).toBe(2);
    expect(facts.provenance.continuous_presence).toBe("answer");

    const grounds = classifyGrounds({
      confirmed: willesden,
      answers,
      evidenceTypes: [],
    });
    expect(grounds.primary_ground).toBe("PAYMENT");
    expect(grounds.unresolved_grounds.map((g) => g.code)).toContain("PAYMENT");
    expect(grounds.supported_grounds.map((g) => g.code)).toContain(
      "ANPR_EVIDENCE",
    );
    expect(grounds.supported_grounds.map((g) => g.code)).not.toContain(
      "ANPR_OVERSTAY",
    );
    expect(grounds.missing_material_facts.map((m) => m.factKey)).toContain(
      "payment_made",
    );
    expect(grounds.missing_material_facts.map((m) => m.factKey)).not.toContain(
      "continuous_presence",
    );

    const ci = buildCaseIntelligence({
      confirmed: willesden,
      answers,
      evidenceTypes: [],
    });
    const gap = await resolveFactGap({
      facts: applyDocumentImplications(
        deriveKnownFacts({ confirmed: willesden, answers, evidenceTypes: [] }),
      ),
      evidenceTypes: [],
      caseIntelligence: ci,
    });
    expect(gap.gap?.factKey).toBe("payment_made");
    expect(gap.gap?.factKey).not.toBe("continuous_presence");
  });
});
