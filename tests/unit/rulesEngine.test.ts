import { describe, expect, it } from "vitest";
import { evaluate, RULES } from "@/rules";
import type { ConfirmedPcn } from "@/types";
import { EMPTY_ANSWERS } from "@/types";

function pcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    confirmedAt: "2026-08-01T00:00:00Z",
    operator_name: "Britannia Parking Ltd",
    pcn_number: "BR/PCN/2026/000123",
    vrm: "AB12 CDE",
    parking_location: "Riverside Retail Park",
    parking_event_date: "2026-07-14",
    notice_issue_date: "2026-07-16",
    notice_route: "WINDSCREEN",
    charge_amount: 100,
    alleged_breach: "Failure to make a valid payment",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    ...over,
  };
}

describe("rules engine — invariants", () => {
  it("always includes PP-END-001 (closing)", () => {
    const ev = evaluate({ pcn: pcn(), answers: EMPTY_ANSWERS, evidence: [] });
    expect(ev.matchedParagraphIds).toContain("PP-END-001");
  });

  it("adds PP-EV-001 when at least one evidence item is enclosed", () => {
    const withoutEvidence = evaluate({ pcn: pcn(), answers: EMPTY_ANSWERS, evidence: [] });
    expect(withoutEvidence.matchedParagraphIds).not.toContain("PP-EV-001");
    const withEvidence = evaluate({
      pcn: pcn(),
      answers: EMPTY_ANSWERS,
      evidence: [
        {
          id: "1",
          type: "payment_receipt",
          fileName: "r.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
          storageKey: "k",
          uploadedAt: new Date().toISOString(),
        },
      ],
    });
    expect(withEvidence.matchedParagraphIds).toContain("PP-EV-001");
  });

  it("PP-R001 activates KEEPER_ROUTE and emits PP-INTRO-001 + PP-INTRO-002", () => {
    const ev = evaluate({
      pcn: pcn(),
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          scenarios: [],
        },
        branch: {},
      },
      evidence: [],
    });
    expect(ev.matchedRuleIds).toContain("PP-R001");
    expect(ev.matchedParagraphIds).toEqual(
      expect.arrayContaining(["PP-INTRO-001", "PP-INTRO-002", "PP-POFA-001"]),
    );
    expect(ev.activeRoutes).toContain("KEEPER_ROUTE");
  });

  it("Part 9 rule 1: PP-INTRO-001 is included whenever registered_keeper = YES, even if the driver has been identified", () => {
    const ev = evaluate({
      pcn: pcn(),
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "YES", // driver already given — PP-R001 does NOT fire
          scenarios: ["payment_made"],
        },
        branch: {
          payment: { parking_payment_made: "YES" },
        },
      },
      evidence: [],
    });
    // PP-R001 must NOT fire (driver_identified = YES).
    expect(ev.matchedRuleIds).not.toContain("PP-R001");
    // PP-INTRO-002 must NOT be present (unidentified-driver route only).
    expect(ev.matchedParagraphIds).not.toContain("PP-INTRO-002");
    // But PP-INTRO-001 must still be present — Part 9 rule 1.
    expect(ev.matchedParagraphIds).toContain("PP-INTRO-001");
  });

  it("PP-INTRO-001 is NOT present when the appellant is not a registered keeper", () => {
    const ev = evaluate({
      pcn: pcn(),
      answers: { core: { scenarios: [] }, branch: {} },
      evidence: [],
    });
    expect(ev.matchedParagraphIds).not.toContain("PP-INTRO-001");
    expect(ev.matchedParagraphIds).not.toContain("PP-INTRO-002");
  });

  it("PP-R003 fires only when NTK not received", () => {
    const ev = evaluate({
      pcn: pcn(),
      answers: {
        core: { registered_keeper: "YES", driver_identified: "NO", scenarios: ["no_ntk_received"] },
        branch: { keeper: { notice_to_keeper_received: "NO" } },
      },
      evidence: [],
    });
    expect(ev.matchedRuleIds).toContain("PP-R003");
    expect(ev.matchedParagraphIds).toContain("PP-POFA-002");
  });

  it("does not apply universal 10-minute cancellation — Part 9 rule 8", () => {
    const ev = evaluate({ pcn: pcn(), answers: EMPTY_ANSWERS, evidence: [] });
    expect(ev.matchedParagraphIds).not.toContain("PP-GRACE-006");
    expect(ev.matchedParagraphIds).not.toContain("PP-GRACE-005");
  });

  it("consideration + grace are NOT merged — Part 9 rule 7", () => {
    const ev = evaluate({
      pcn: pcn(),
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          scenarios: ["short_stay_consideration", "grace_or_exit"],
        },
        branch: {
          consideration: { short_stay: "YES", consideration_reason: "READING_TERMS" },
          grace: {
            parking_period_completed: "YES",
            grace_period_applicable: "YES",
            alleged_overstay_minutes: 5,
            standard_10_minute_grace: "APPLICABLE",
          },
        },
      },
      evidence: [],
    });
    expect(ev.activeRoutes).toEqual(expect.arrayContaining(["CONSIDERATION_ROUTE", "GRACE_ROUTE"]));
    expect(ev.warnings.some((w) => /separate grounds/i.test(w))).toBe(true);
  });

  it("keying-error rule (PP-R008 family) does not fire without a VRM error", () => {
    const ev = evaluate({
      pcn: pcn(),
      answers: {
        core: { scenarios: ["payment_made"] },
        branch: {
          payment: { parking_payment_made: "YES" },
        },
      },
      evidence: [],
    });
    expect(ev.matchedRuleIds).not.toContain("PP-R008");
    expect(ev.matchedParagraphIds).not.toContain("PP-KEY-001");
  });

  it("CRM override: a rule marked active:false is skipped even though its condition matches", () => {
    const input = {
      pcn: pcn(),
      answers: {
        core: { registered_keeper: "YES" as const, driver_identified: "NO" as const, scenarios: [] },
        branch: {},
      },
      evidence: [],
    };
    const withDefaults = evaluate(input);
    expect(withDefaults.matchedRuleIds).toContain("PP-R001");

    const overridden = RULES.map((r) => (r.id === "PP-R001" ? { ...r, active: false } : r));
    const withOverride = evaluate(input, overridden);
    expect(withOverride.matchedRuleIds).not.toContain("PP-R001");
    // Every other rule is unaffected.
    expect(withOverride.matchedRuleIds).toEqual(
      withDefaults.matchedRuleIds.filter((id) => id !== "PP-R001"),
    );
  });
});
