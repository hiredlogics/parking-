import { describe, expect, it } from "vitest";
import {
  assessNoticeScope,
  detectOutOfScope,
  isHardOutOfScope,
} from "@/lib/facts/scope";
import { deriveKnownFacts, FACT } from "@/lib/facts/facts";

describe("assessNoticeScope — debt recovery / court", () => {
  it("blocks Debt Recovery Plus Ltd as past appeal stage", () => {
    const scope = assessNoticeScope({
      operatorName: "Debt Recovery Plus Ltd",
      allegedBreach:
        "PARKING IN DISABLED BAY WITHOUT CLEARLY DISPLAYING A VALID DISABLED BADGE",
      parkingLocation:
        "SEARS RETAIL PARK, SHIRLEY (PATROL) - SEARS RETAIL PARK, OAKENSHAW ROAD, SHIRLEY, SOLIHULL, B90 4QY",
    });

    expect(scope).not.toBeNull();
    expect(scope?.reason).toBe("DEBT_RECOVERY_STAGE");
    expect(scope?.action).toBe("OUT_OF_SCOPE");
    expect(isHardOutOfScope(scope)).toBe(true);
    expect(scope?.detail).toMatch(/debt recovery/i);
    expect(scope?.detail).toMatch(/Expert Help/i);
  });

  it("blocks letter-of-claim wording even if the sender is unfamiliar", () => {
    const scope = assessNoticeScope({
      operatorName: "Some Collections Agency",
      extraText:
        "This is a Letter of Claim under the Pre-Action Protocol for Debt Claims.",
    });
    expect(scope?.reason).toBe("DEBT_RECOVERY_STAGE");
  });

  it("blocks County Court / enforcement paperwork", () => {
    const scope = assessNoticeScope({
      operatorName: "HM Courts & Tribunals Service",
      extraText: "Claim Form N1 — County Court Business Centre",
    });
    expect(scope?.reason).toBe("COURT_OR_ENFORCEMENT_STAGE");
    expect(isHardOutOfScope(scope)).toBe(true);
  });

  it("allows a normal private parking operator PCN", () => {
    const scope = assessNoticeScope({
      operatorName: "ParkingEye Ltd",
      allegedBreach: "Failure to pay",
      parkingLocation: "Retail Park, Birmingham",
    });
    expect(scope).toBeNull();
  });
});

describe("detectOutOfScope via known facts", () => {
  it("flags DRP from confirmed notice facts before any answers", () => {
    const facts = deriveKnownFacts({
      confirmed: {
        operator_name: "Debt Recovery Plus Ltd",
        pcn_number: "3438817",
        vrm: "KJ24FRV",
        parking_location: "SEARS RETAIL PARK, SHIRLEY",
        parking_event_date: "2026-05-04",
        charge_amount: 170,
        alleged_breach:
          "PARKING IN DISABLED BAY WITHOUT CLEARLY DISPLAYING A VALID DISABLED BADGE",
        case_stage: "INITIAL_OPERATOR_APPEAL",
        confirmedAt: new Date().toISOString(),
      },
    });

    const scope = detectOutOfScope(facts);
    expect(scope?.reason).toBe("DEBT_RECOVERY_STAGE");
    expect(factStrOperator(facts)).toMatch(/Debt Recovery/i);
  });
});

function factStrOperator(facts: ReturnType<typeof deriveKnownFacts>): string {
  const v = facts.values[FACT.OPERATOR_NAME];
  return typeof v === "string" ? v : "";
}
