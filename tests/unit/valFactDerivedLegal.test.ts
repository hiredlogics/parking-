/**
 * VAL-FACT must allow DERIVED_LEGAL_FACT PoFA dates.
 */
import { describe, expect, it } from "vitest";
import { analyseCase } from "@/lib/analysis/engine";
import { derivedLegalFactsFromPofa } from "@/lib/analysis/derivedLegalFacts";
import { VALIDATORS } from "@/lib/validation/validators";
import type { ValidatorContext } from "@/lib/validation/context";
import { deriveKnownFacts } from "@/lib/facts/facts";
import type { ConfirmedPcn } from "@/types";

const euro = {
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
  alleged_breach: "Your vehicle has overstayed the maximum time period allowed",
  uk_jurisdiction: "ENGLAND_WALES",
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: "2026-09-24T00:00:00.000Z",
} as ConfirmedPcn;

describe("VAL-FACT vs derived legal facts", () => {
  it("records PoFA deadline and deemed given as computed verifiedFacts", () => {
    const analysis = analyseCase({
      confirmed: euro,
      answers: { registered_keeper: "YES", driver_identified: "NO" },
    });
    expect(analysis.pofa.timingStatus).toBe("FAILED");
    const fields = analysis.verifiedFacts.map((f) => f.field);
    expect(fields).toContain("pofa_deadline");
    expect(fields).toContain("pofa_notice_given_date");
    expect(fields).toContain("pofa_days_late");
    const deadline = analysis.verifiedFacts.find((f) => f.field === "pofa_deadline");
    expect(deadline?.source).toBe("computed");
    expect(deadline?.value).toBe("2026-07-31");
  });

  it("does not block a draft that states derived PoFA dates in UK prose", () => {
    const analysis = analyseCase({
      confirmed: euro,
      answers: { registered_keeper: "YES", driver_identified: "NO" },
    });
    const facts = deriveKnownFacts({
      confirmed: euro,
      answers: { registered_keeper: "YES", driver_identified: "NO" },
    });
    const body = `
I write as the registered keeper of vehicle KS58OPW regarding Parking Charge Notice 88812303053.
The parking event was on 17 July 2026. The Notice to Keeper was issued on 30 July 2026.
Under Schedule 4 paragraph 9 the notice had to be given by 31 July 2026.
Applying postal deemed service, it is treated as given on 3 August 2026, which is 3 days late.
The Notice to Keeper was not given within the statutory period.
`;
    const valFact = VALIDATORS.find((v) => v.code === "VAL-FACT")!;
    const ctx: ValidatorContext = {
      body,
      analysis,
      modules: [],
      sources: [],
      facts,
      evidence: new Set(),
      variables: {
        parking_event_date: "17 July 2026",
        notice_issue_date: "30 July 2026",
        vrm: "KS58OPW",
        pcn_number: "88812303053",
        pofa_deadline: "31 July 2026",
        pofa_notice_given_date: "3 August 2026",
        pofa_days_late: "3",
      },
    };
    const issues = valFact.run(ctx).filter((i) => i.severity === "BLOCKING");
    expect(issues.map((i) => i.message)).toEqual([]);
  });

  it("derivedLegalFactsFromPofa records rule + calculation", () => {
    const analysis = analyseCase({
      confirmed: euro,
      answers: { registered_keeper: "YES", driver_identified: "NO" },
    });
    const { records } = derivedLegalFactsFromPofa(analysis.pofa);
    expect(records.some((r) => r.field === "pofa_deadline" && r.rule.includes("Schedule 4"))).toBe(true);
  });
});
