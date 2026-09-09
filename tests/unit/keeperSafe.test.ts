import { describe, expect, it } from "vitest";
import {
  transformToKeeperSafe,
  validateKeeperSafe,
  makeKeeperSafeOrReport,
} from "@/lib/keeperSafe";

/**
 * PART 10 — Keeper-Safe Transformation Rules
 * Each row of the pack's table is a positive test here.
 */
describe("keeper-safe transformations — Part 10", () => {
  it("Row 1: 'I paid on the app' → 'A payment was made using the parking app.'", () => {
    const { text } = transformToKeeperSafe("I paid on the app.");
    expect(text).toContain("A payment was made using the parking app.");
    expect(text).not.toMatch(/\bI paid\b/i);
  });

  it("Row 2: 'I typed the wrong registration' → keeper-safe VRM wording", () => {
    const { text } = transformToKeeperSafe("I typed the wrong registration.");
    expect(text).toContain(
      "An incorrect vehicle registration was entered during the payment process.",
    );
  });

  it("Row 3: 'I didn\\'t see the sign when I drove in' → keeper-safe signage wording", () => {
    const { text } = transformToKeeperSafe("I didn't see the sign when I drove in.");
    expect(text).toContain(
      "No sufficiently prominent entrance signage was visible on entry.",
    );
  });

  it("Row 4: 'I went to the shop' → 'The vehicle's presence was connected with a genuine customer visit.'", () => {
    const { text } = transformToKeeperSafe("I went to the shop.");
    expect(text).toContain(
      "The vehicle's presence was connected with a genuine customer visit.",
    );
  });

  it("Row 5: 'I came back twice' → 'The vehicle attended the location on more than one separate occasion.'", () => {
    const { text } = transformToKeeperSafe("I came back twice.");
    expect(text).toContain(
      "The vehicle attended the location on more than one separate occasion.",
    );
  });

  it("generic 'I paid' fallback still applies to non-tabulated wording", () => {
    const { text } = transformToKeeperSafe("Also, I paid at the machine.");
    expect(text).not.toMatch(/\bi\s+paid\b/i);
  });
});

describe("keeper-safe validation", () => {
  it("accepts keeper-safe wording", () => {
    const check = validateKeeperSafe(
      "A payment was made in connection with the parking session. The vehicle left the site.",
    );
    expect(check.ok).toBe(true);
  });

  const unsafeCases = [
    "I drove into the car park.",
    "I parked at the top of the site.",
    "I overstayed by a couple of minutes.",
    "I returned to my car after 10 minutes.",
    "I paid the tariff at the machine.",
    "Who was driving the vehicle?",
    "Please provide the driver's name.",
  ];
  for (const s of unsafeCases) {
    it(`rejects unsafe wording: "${s}"`, () => {
      const check = validateKeeperSafe(s);
      expect(check.ok).toBe(false);
      expect(check.violations.length).toBeGreaterThan(0);
    });
  }
});

describe("makeKeeperSafeOrReport", () => {
  it("transforms all Part 10 rows with no residual violations", () => {
    const composed = [
      "I paid on the app.",
      "I typed the wrong registration.",
      "I didn't see the sign when I drove in.",
      "I went to the shop.",
      "I came back twice.",
    ].join(" ");
    const r = makeKeeperSafeOrReport(composed);
    expect(r.residualViolations).toEqual([]);
    expect(r.appliedMappings.length).toBeGreaterThan(0);
  });
});
