import { describe, expect, it } from "vitest";
import { buildVariableMap, replaceVariables } from "@/lib/variables";
import { EMPTY_ANSWERS } from "@/types";

describe("variable replacement", () => {
  it("resolves the Part 3 variables plus permission_source and alleged_term", () => {
    const vars = buildVariableMap(
      {
        confirmedAt: "2026-01-01T00:00:00Z",
        vrm: "AB12 CDE",
        pcn_number: "PCN-1",
        operator_name: "Britannia Parking Ltd",
        parking_location: "Riverside",
        parking_event_date: "2026-07-14",
        notice_issue_date: "2026-07-16",
      },
      {
        ...EMPTY_ANSWERS,
        branch: { authorisation: { permission_source: "the landlord" } },
      },
    );
    const { text, unresolved } = replaceVariables(
      "Vehicle {{vrm}} at {{parking_location}} on {{parking_event_date}} authorised by {{permission_source}}.",
      vars,
    );
    expect(text).toBe(
      "Vehicle AB12 CDE at Riverside on 2026-07-14 authorised by the landlord.",
    );
    expect(unresolved).toEqual([]);
  });

  it("reports unresolved placeholders", () => {
    const { unresolved } = replaceVariables(
      "{{vrm}} — {{alleged_term}} — {{permission_source}}",
      { vrm: "X" },
    );
    expect(unresolved.sort()).toEqual(["alleged_term", "permission_source"]);
  });

  it("does not leak unknown variable names", () => {
    const { text, unresolved } = replaceVariables("Hello {{not_a_var}}", {});
    expect(text).toContain("{{not_a_var}}");
    expect(unresolved).toContain("not_a_var");
  });
});
