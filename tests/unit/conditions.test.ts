/**
 * The condition evaluator is the replacement for hard-coded rule
 * predicates, so these tests are written as: "this rule used to be
 * TypeScript in rules/rules.ts — express it as data and get the same
 * answer".
 */
import { describe, expect, it } from "vitest";
import {
  describeCondition,
  evaluateCondition,
  validateCondition,
  type Condition,
} from "@/lib/rules/conditions";
import { deriveKnownFacts, FACT } from "@/lib/questions/facts";
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/questions/types";

function facts(
  over: Partial<ConfirmedPcn> = {},
  answers: AnswerMap = {},
  evidenceTypes: string[] = [],
) {
  return deriveKnownFacts({
    confirmed: {
      operator_name: "Euro Car Parks",
      pcn_number: "ECP1",
      vrm: "AB12CDE",
      parking_location: "Retail Park",
      case_stage: "INITIAL_OPERATOR_APPEAL",
      confirmedAt: new Date().toISOString(),
      ...over,
    } as ConfirmedPcn,
    answers,
    evidenceTypes,
  });
}

describe("evaluateCondition — leaves", () => {
  it("compares facts case-insensitively and treats YES/NO as boolean", () => {
    const f = facts({}, { [FACT.REGISTERED_KEEPER]: "YES" });
    expect(
      evaluateCondition({ fact: FACT.REGISTERED_KEEPER, op: "eq", value: "yes" }, f)
        .matched,
    ).toBe(true);
    expect(
      evaluateCondition({ fact: FACT.REGISTERED_KEEPER, op: "truthy" }, f).matched,
    ).toBe(true);
  });

  it("an unknown fact does not match, and is not an error", () => {
    const f = facts();
    const r = evaluateCondition(
      { fact: FACT.PERMISSION_HELD, op: "eq", value: "YES" },
      f,
    );
    expect(r.matched).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it("neq does not fire on an unknown fact", () => {
    // "not equal" on something we have never asked would silently
    // activate grounds on absence of information.
    const f = facts();
    expect(
      evaluateCondition(
        { fact: FACT.PERMISSION_HELD, op: "neq", value: "YES" },
        f,
      ).matched,
    ).toBe(false);
  });

  it("matches circumstance tags and evidence", () => {
    const f = facts({}, { [FACT.SCENARIOS]: ["grace_or_exit"] }, [
      "payment_receipt",
    ]);
    expect(evaluateCondition({ tag: "grace_or_exit" }, f).matched).toBe(true);
    expect(evaluateCondition({ tag: "residential" }, f).matched).toBe(false);
    expect(
      evaluateCondition({ evidence: "payment_receipt" }, f).matched,
    ).toBe(true);
  });

  it("in / nin work over scalar and array facts", () => {
    const f = facts({ notice_route: "POSTAL" });
    expect(
      evaluateCondition(
        { fact: FACT.NOTICE_ROUTE, op: "in", value: ["POSTAL", "WINDSCREEN"] },
        f,
      ).matched,
    ).toBe(true);
    expect(
      evaluateCondition(
        { fact: FACT.NOTICE_ROUTE, op: "nin", value: ["WINDSCREEN"] },
        f,
      ).matched,
    ).toBe(true);
  });
});

describe("evaluateCondition — date arithmetic", () => {
  const timing: Condition = {
    daysBetween: {
      from: FACT.PARKING_EVENT_DATE,
      to: FACT.NOTICE_ISSUE_DATE,
    },
    op: "gt",
    value: 14,
  };

  it("fires when the notice was issued outside the configured window", () => {
    const f = facts({
      parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27",
    });
    const r = evaluateCondition(timing, f);
    expect(r.matched).toBe(true);
    expect(r.trace[0]!.leaf).toContain("=17");
  });

  it("does not fire inside the window", () => {
    const f = facts({
      parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-20",
    });
    expect(evaluateCondition(timing, f).matched).toBe(false);
  });

  it("does not fire when either date is missing", () => {
    const f = facts({ parking_event_date: "2026-08-10" });
    const r = evaluateCondition(timing, f);
    expect(r.matched).toBe(false);
    expect(r.errors).toEqual([]);
  });
});

describe("evaluateCondition — the rules it replaces", () => {
  it("PP-R001 keeper route: registered_keeper YES AND driver_identified NO", () => {
    const rule: Condition = {
      all: [
        { fact: FACT.REGISTERED_KEEPER, op: "eq", value: "YES" },
        { fact: FACT.DRIVER_IDENTIFIED, op: "eq", value: "NO" },
      ],
    };
    expect(
      evaluateCondition(
        rule,
        facts({}, {
          [FACT.REGISTERED_KEEPER]: "YES",
          [FACT.DRIVER_IDENTIFIED]: "NO",
        }),
      ).matched,
    ).toBe(true);
    expect(
      evaluateCondition(
        rule,
        facts({}, {
          [FACT.REGISTERED_KEEPER]: "YES",
          [FACT.DRIVER_IDENTIFIED]: "YES",
        }),
      ).matched,
    ).toBe(false);
  });

  it("PP-R004 postal timing: route POSTAL AND notice outside the window", () => {
    const rule: Condition = {
      all: [
        { fact: FACT.NOTICE_ROUTE, op: "eq", value: "POSTAL" },
        {
          daysBetween: {
            from: FACT.PARKING_EVENT_DATE,
            to: FACT.NOTICE_ISSUE_DATE,
          },
          op: "gt",
          value: 14,
        },
      ],
    };
    expect(
      evaluateCondition(
        rule,
        facts({
          notice_route: "POSTAL",
          parking_event_date: "2026-08-10",
          notice_issue_date: "2026-08-27",
        }),
      ).matched,
    ).toBe(true);
    // Same dates, windscreen notice — the postal rule must not fire.
    expect(
      evaluateCondition(
        rule,
        facts({
          notice_route: "WINDSCREEN",
          parking_event_date: "2026-08-10",
          notice_issue_date: "2026-08-27",
        }),
      ).matched,
    ).toBe(false);
  });

  it("exclusion: grace applies unless the customer named other circumstances", () => {
    const applicability: Condition = { tag: "grace_or_exit" };
    const exclusion: Condition = { any: [{ tag: "residential" }, { tag: "permit" }] };

    const graceOnly = facts({}, { [FACT.SCENARIOS]: ["grace_or_exit"] });
    expect(evaluateCondition(applicability, graceOnly).matched).toBe(true);
    expect(evaluateCondition(exclusion, graceOnly).matched).toBe(false);
  });
});

describe("evaluateCondition — robustness", () => {
  it("never throws on malformed configuration, and reports it", () => {
    const f = facts();
    for (const bad of [
      null,
      undefined,
      42,
      "nonsense",
      [],
      { fact: "", op: "eq", value: 1 },
      { fact: FACT.VRM, op: "regex", value: "x" },
      { all: "not-an-array" },
      { daysBetween: { from: FACT.VRM }, op: "gt", value: 1 },
    ]) {
      const r = evaluateCondition(bad, f);
      expect(r.matched).toBe(false);
      expect(r.errors.length).toBeGreaterThan(0);
    }
  });

  it("stops runaway nesting instead of hanging", () => {
    let node: unknown = { fact: FACT.VRM, op: "exists" };
    for (let i = 0; i < 50; i++) node = { not: node };
    const r = evaluateCondition(node, facts());
    expect(r.errors.join(" ")).toMatch(/nested deeper/);
  });

  it("evaluates every branch so the admin trace is complete", () => {
    const f = facts({ notice_route: "POSTAL" });
    const r = evaluateCondition(
      {
        all: [
          { fact: FACT.NOTICE_ROUTE, op: "eq", value: "WINDSCREEN" },
          { fact: FACT.VRM, op: "exists" },
        ],
      },
      f,
    );
    expect(r.matched).toBe(false);
    // Both leaves present: the first failed, the second still recorded.
    expect(r.trace).toHaveLength(2);
    expect(r.trace[0]!.matched).toBe(false);
    expect(r.trace[1]!.matched).toBe(true);
  });
});

describe("validateCondition — rejects bad admin edits at save time", () => {
  const keys = [FACT.VRM, FACT.NOTICE_ROUTE, FACT.PARKING_EVENT_DATE];

  it("accepts a well-formed tree", () => {
    const r = validateCondition(
      {
        all: [
          { fact: FACT.NOTICE_ROUTE, op: "eq", value: "POSTAL" },
          { any: [{ fact: FACT.VRM, op: "exists" }, { tag: "grace" }] },
        ],
      },
      keys,
    );
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it("catches a misspelled fact key", () => {
    const r = validateCondition(
      { fact: "notice_rout", op: "eq", value: "POSTAL" },
      keys,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unknown fact/);
  });

  it("catches a missing value, an empty group and a bad operator", () => {
    expect(validateCondition({ fact: FACT.VRM, op: "eq" }, keys).ok).toBe(false);
    expect(validateCondition({ all: [] }, keys).ok).toBe(false);
    expect(
      validateCondition({ fact: FACT.VRM, op: "matches", value: "x" }, keys).ok,
    ).toBe(false);
    expect(
      validateCondition({ fact: FACT.VRM, op: "in", value: "POSTAL" }, keys).ok,
    ).toBe(false);
  });
});

describe("describeCondition — admins read rules in words", () => {
  it("renders a tree as a sentence", () => {
    expect(
      describeCondition({
        all: [
          { fact: FACT.NOTICE_ROUTE, op: "eq", value: "POSTAL" },
          {
            daysBetween: {
              from: FACT.PARKING_EVENT_DATE,
              to: FACT.NOTICE_ISSUE_DATE,
            },
            op: "gt",
            value: 14,
          },
        ],
      }),
    ).toBe(
      "notice_route eq POSTAL AND days from parking_event_date to notice_issue_date gt 14",
    );
  });
});
