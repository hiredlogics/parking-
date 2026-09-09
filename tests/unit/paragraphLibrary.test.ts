import { describe, expect, it } from "vitest";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import { validateKeeperSafe } from "@/lib/keeperSafe";
import { SUPPORTED_VARIABLES } from "@/lib/variables";

/**
 * Guards on the approved paragraph library (Master Developer Pack, Part 8).
 * These tests ensure the library remains keeper-safe and consistent.
 */
describe("paragraph library invariants", () => {
  it("has unique IDs", () => {
    const ids = PARAGRAPH_LIBRARY.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contains every paragraph ID cited in Part 6 / Part 7 / Part 8", () => {
    const required = [
      "PP-INTRO-001",
      "PP-INTRO-002",
      "PP-POFA-001",
      "PP-POFA-002",
      "PP-POFA-003",
      "PP-POFA-004",
      "PP-POFA-005A",
      "PP-POFA-005B",
      "PP-POFA-005C",
      "PP-POFA-005D",
      "PP-POFA-005E",
      "PP-POFA-006",
      "PP-POFA-007",
      "PP-PAY-001",
      "PP-PAY-002",
      "PP-PAY-003",
      "PP-PAY-003A",
      "PP-PAY-004",
      "PP-PAY-004A",
      "PP-PAY-005",
      "PP-PAY-006",
      "PP-KEY-001",
      "PP-KEY-002",
      "PP-KEY-003",
      "PP-KEY-004",
      "PP-CON-001",
      "PP-CON-002",
      "PP-CON-003",
      "PP-CON-004",
      "PP-CON-005",
      "PP-CON-006",
      "PP-GRACE-001",
      "PP-GRACE-002",
      "PP-GRACE-003",
      "PP-GRACE-004",
      "PP-GRACE-005",
      "PP-GRACE-006",
      "PP-GRACE-008",
      "PP-ANPR-001",
      "PP-ANPR-002",
      "PP-ANPR-003",
      "PP-ANPR-004",
      "PP-ANPR-005",
      "PP-ANPR-006",
      "PP-ANPR-007",
      "PP-ANPR-008",
      "PP-ANPR-009",
      "PP-ANPR-010",
      "PP-ANPR-011",
      "PP-ANPR-012",
      "PP-AUTH-001",
      "PP-AUTH-002",
      "PP-AUTH-003",
      "PP-AUTH-004",
      "PP-AUTH-005",
      "PP-AUTH-006",
      "PP-AUTH-007",
      "PP-AUTH-008",
      "PP-AUTH-009",
      "PP-AUTH-010",
      "PP-AUTH-011",
      "PP-SIGN-001",
      "PP-SIGN-002",
      "PP-SIGN-003",
      "PP-SIGN-004",
      "PP-SIGN-005",
      "PP-SIGN-006",
      "PP-SIGN-007",
      "PP-SIGN-008",
      "PP-SIGN-009",
      "PP-SIGN-010",
      "PP-SIGN-011",
      "PP-SIGN-012",
      "PP-SIGN-013",
      "PP-LAND-001",
      "PP-LAND-002",
      "PP-LAND-003",
      "PP-LAND-004",
      "PP-LAND-005",
      "PP-LAND-006",
      "PP-LAND-007",
      "PP-LAND-008",
      "PP-LAND-009",
      "PP-EV-001",
      "PP-END-001",
      "PP-END-002",
      "PP-END-003",
    ];
    const ids = new Set(PARAGRAPH_LIBRARY.map((p) => p.id));
    for (const r of required) {
      expect(ids.has(r), `paragraph ${r} missing from library`).toBe(true);
    }
  });

  it("every active paragraph is keeper-safe as written", () => {
    for (const p of PARAGRAPH_LIBRARY.filter((x) => x.active)) {
      const check = validateKeeperSafe(p.text);
      expect(
        check.ok,
        `paragraph ${p.id} violated keeper-safe: ${JSON.stringify(check.violations)}`,
      ).toBe(true);
    }
  });

  it("only uses supported variable placeholders", () => {
    const supported = new Set<string>(SUPPORTED_VARIABLES);
    for (const p of PARAGRAPH_LIBRARY) {
      const matches = p.text.match(/\{\{\s*([a-z_]+)\s*\}\}/gi) ?? [];
      for (const m of matches) {
        const name = m.replace(/[{} ]/g, "");
        expect(supported.has(name), `${p.id} uses unknown variable ${name}`).toBe(true);
      }
    }
  });
});
