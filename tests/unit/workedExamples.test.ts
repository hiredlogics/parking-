import { describe, expect, it } from "vitest";
import { evaluate } from "@/rules";
import { assembleAppeal } from "@/lib/assembly";
import type { ConfirmedPcn } from "@/types";

/**
 * PART 11 — Worked Developer Examples.
 *
 * These tests re-play each pack example exactly as stated and assert:
 *   - the listed rules fire,
 *   - the listed paragraph IDs are all present,
 *   - assembly is coherent (keeper-safe, no unresolved variables, no
 *     leaked IDs in the letter body),
 *   - PP-INTRO-001 is always present when the appeal is being sent by the
 *     registered keeper, and PP-END-001 is always the last paragraph.
 */

const OPERATOR = "MetroPark Enforcement Ltd";
const PCN_NO = "MP/2026/000123";

const commonPcn: ConfirmedPcn = {
  confirmedAt: "2026-08-01T00:00:00Z",
  operator_name: OPERATOR,
  pcn_number: PCN_NO,
  vrm: "AB12 CDE",
  parking_location: "Riverside Retail Park",
  parking_event_date: "2026-07-14",
  notice_issue_date: "2026-07-16",
  notice_route: "WINDSCREEN",
  charge_amount: 100,
  alleged_breach: "Failure to make a valid payment",
  case_stage: "INITIAL_OPERATOR_APPEAL",
};

describe("Example A — Payment + Minor Keying Error", () => {
  it("fires PP-R006 + PP-R008 and includes the listed paragraph IDs", () => {
    const ev = evaluate({
      pcn: commonPcn,
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          notice_route: "WINDSCREEN",
          alleged_breach: "Failure to make a valid payment",
          scenarios: ["payment_made", "vrm_error"],
        },
        branch: {
          payment: {
            parking_payment_made: "YES",
            payment_method: "APP",
            payment_evidence_uploaded: "YES",
          },
          keying: {
            vrm_error: "YES",
            vrm_error_type: "MINOR",
            payment_confirmed: "YES",
          },
        },
      },
      evidence: [],
    });

    expect(ev.matchedRuleIds).toEqual(expect.arrayContaining(["PP-R006", "PP-R008"]));
    expect(ev.matchedParagraphIds).toEqual(
      expect.arrayContaining([
        "PP-PAY-001",
        "PP-PAY-002",
        "PP-KEY-001",
        "PP-KEY-002",
        "PP-KEY-004",
      ]),
    );
  });

  it("assembles a keeper-safe, coherent letter (deduplicated repeated payment statement is preserved as distinct paragraphs)", () => {
    const ev = evaluate({
      pcn: commonPcn,
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          scenarios: ["payment_made", "vrm_error"],
        },
        branch: {
          payment: {
            parking_payment_made: "YES",
            payment_evidence_uploaded: "YES",
          },
          keying: {
            vrm_error: "YES",
            vrm_error_type: "MINOR",
            payment_confirmed: "YES",
          },
        },
      },
      evidence: [],
    });
    const appeal = assembleAppeal(
      commonPcn,
      {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          scenarios: ["payment_made", "vrm_error"],
        },
        branch: {
          payment: {
            parking_payment_made: "YES",
            payment_evidence_uploaded: "YES",
          },
          keying: {
            vrm_error: "YES",
            vrm_error_type: "MINOR",
            payment_confirmed: "YES",
          },
        },
      },
      [],
      ev,
    );
    // Body ends with PP-END-001 (closing) and starts with the keeper intro.
    expect(appeal.paragraphs[0].id).toBe("PP-INTRO-001");
    expect(appeal.paragraphs[appeal.paragraphs.length - 1].id).toBe("PP-END-001");
    // Both payment-anchored paragraphs remain — pack Example A lists them together.
    const ids = appeal.paragraphs.map((p) => p.id);
    expect(ids).toContain("PP-PAY-001");
    expect(ids).toContain("PP-KEY-001");
    expect(appeal.keeperSafe).toBe(true);
    expect(appeal.unresolvedVariables).toEqual([]);
    expect(appeal.body).not.toMatch(/PP-[A-Z0-9-]+/);
  });
});

describe("Example B — Multiple Visits / ANPR", () => {
  it("fires PP-R012 + PP-R013 + PP-R014 and includes 001/002/003/004/005/012", () => {
    const ev = evaluate({
      pcn: commonPcn,
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          scenarios: ["anpr_disputed", "multiple_visits_same_day"],
        },
        branch: {
          anpr: {
            evidence_type: "ANPR",
            customer_disputes_duration: "YES",
            multiple_visits_same_day: "YES",
            evidence_vehicle_elsewhere: "YES",
            external_evidence_contradicts_anpr: "YES",
          },
        },
      },
      evidence: [],
    });
    expect(ev.matchedRuleIds).toEqual(
      expect.arrayContaining(["PP-R012", "PP-R013", "PP-R014"]),
    );
    expect(ev.matchedParagraphIds).toEqual(
      expect.arrayContaining([
        "PP-ANPR-001",
        "PP-ANPR-002",
        "PP-ANPR-003",
        "PP-ANPR-004",
        "PP-ANPR-005",
        "PP-ANPR-012",
      ]),
    );
  });
});

describe("Example C — Keeper + Confirmed Late Postal NTK", () => {
  it("fires PP-R001 + PP-R004 + PP-R005B and includes intro + PoFA-001/003/006/007", () => {
    const ev = evaluate({
      pcn: {
        ...commonPcn,
        notice_route: "POSTAL",
        parking_event_date: "2026-05-02",
        notice_received_date: "2026-05-24",
        notice_issue_date: "2026-05-20",
      },
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          notice_route: "POSTAL",
          scenarios: ["postal_ntk_timing_issue"],
        },
        branch: {
          keeper: {
            notice_to_keeper_received: "YES",
            pofa_postal_timing_failure: true,
          },
        },
      },
      evidence: [],
    });
    expect(ev.matchedRuleIds).toEqual(
      expect.arrayContaining(["PP-R001", "PP-R004", "PP-R005B"]),
    );
    expect(ev.matchedParagraphIds).toEqual(
      expect.arrayContaining([
        "PP-INTRO-001",
        "PP-INTRO-002",
        "PP-POFA-001",
        "PP-POFA-003",
        "PP-POFA-006",
        "PP-POFA-007",
      ]),
    );
  });
});

describe("Example D — Paid Parking + Short Exit Period", () => {
  it("fires PP-R011 + PP-R011A and includes GRACE-001/005/006", () => {
    const ev = evaluate({
      pcn: commonPcn,
      answers: {
        core: {
          registered_keeper: "YES",
          driver_identified: "NO",
          scenarios: ["grace_or_exit"],
        },
        branch: {
          grace: {
            parking_period_completed: "YES",
            grace_period_applicable: "YES",
            alleged_overstay_minutes: 8,
            standard_10_minute_grace: "APPLICABLE",
          },
        },
      },
      evidence: [],
    });
    expect(ev.matchedRuleIds).toEqual(expect.arrayContaining(["PP-R011", "PP-R011A"]));
    expect(ev.matchedParagraphIds).toEqual(
      expect.arrayContaining(["PP-GRACE-001", "PP-GRACE-005", "PP-GRACE-006"]),
    );
  });
});
