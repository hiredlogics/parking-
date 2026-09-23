import { describe, expect, it } from "vitest";
import {
  assessDocumentDeterministic,
  mergeTriageResults,
} from "@/lib/triage/deterministic";
import { triageBlocksAppealJourney } from "@/types/triage";
import { filterMissingFactsByCircumstances } from "@/lib/questions/caseAssessment";
import { deriveKnownFacts, FACT } from "@/lib/facts/facts";
import type { FactRequirement } from "@/lib/facts/requirements";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";

describe("document triage — Debt Recovery Plus", () => {
  it("classifies DRP letter as wrong-stage debt recovery", () => {
    const triage = assessDocumentDeterministic({
      operatorName: "Debt Recovery Plus Ltd",
      allegedBreach:
        "PARKING IN DISABLED BAY WITHOUT CLEARLY DISPLAYING A VALID DISABLED BADGE",
      parkingLocation: "SEARS RETAIL PARK, SHIRLEY",
      extraText:
        "Urgent Reminder — Legal Action: Imminent. Instructed to recover charge. paydrp.co.uk",
    });

    expect(triage.documentKind).toBe("DEBT_RECOVERY");
    expect(triage.caseStage).toBe("DEBT_RECOVERY");
    expect(triage.senderName).toMatch(/Debt Recovery Plus/i);
    expect(triage.serviceDecision).toBe("NOT_SUPPORTED");
    expect(triageBlocksAppealJourney(triage)).toBe(true);
    expect(triage.detail).toMatch(/later stage|not suitable/i);
  });

  it("allows a normal operator PCN", () => {
    const triage = assessDocumentDeterministic({
      operatorName: "ParkingEye Ltd",
      allegedBreach: "Failure to pay",
      parkingLocation: "Retail Park Birmingham",
    });
    expect(triage.serviceDecision).toBe(
      "PRIVATE_PARKING_INITIAL_APPEAL_OK",
    );
    expect(triageBlocksAppealJourney(triage)).toBe(false);
  });

  it("deterministic not-supported overrides AI saying OK", () => {
    const det = assessDocumentDeterministic({
      operatorName: "Debt Recovery Plus Ltd",
    });
    const merged = mergeTriageResults(
      {
        ...det,
        serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
        documentKind: "INITIAL_OPERATOR_PCN",
        caseStage: "INITIAL_OPERATOR_APPEAL",
        reasonCode: "AI_WRONG",
        detail: "Looks fine",
        providerId: "ai",
        signals: ["ai"],
      },
      det,
    );
    expect(merged.serviceDecision).toBe("NOT_SUPPORTED");
  });
});

describe("circumstance assessment filter — grace only", () => {
  it("drops permission/residential facts when only grace was selected", () => {
    const facts = deriveKnownFacts({
      confirmed: {
        operator_name: "Euro Car Parks",
        alleged_breach: "Unauthorised parking",
        parking_location: "Hospital car park",
        case_stage: "INITIAL_OPERATOR_APPEAL",
        confirmedAt: new Date().toISOString(),
      },
      answers: {
        [FACT.SCENARIOS]: ["grace_or_exit"],
        [FACT.REGISTERED_KEEPER]: "YES",
        [FACT.DRIVER_IDENTIFIED]: "NO",
      },
    });

    const missing: FactRequirement[] = [
      {
        fact: FACT.PERMISSION_HELD,
        reasonCode: "PERMISSION_STATUS_UNRESOLVED",
        route: "AUTHORIZATION",
        priority: 10,
        rationale: "test",
        kbModules: [],
        when: () => true,
      },
      {
        fact: FACT.OCCUPIER_STATUS,
        reasonCode: "OCCUPIER_STATUS_UNRESOLVED",
        route: "RESIDENTIAL",
        priority: 20,
        rationale: "test",
        kbModules: [],
        when: () => true,
      },
      {
        fact: FACT.AGREEMENT_UPLOADED,
        reasonCode: "AGREEMENT_EVIDENCE_UNRESOLVED",
        route: "RESIDENTIAL",
        priority: 30,
        rationale: "test",
        kbModules: [],
        when: () => true,
      },
      {
        fact: FACT.PERMISSION_SOURCE,
        reasonCode: "PERMISSION_SOURCE_UNRESOLVED",
        route: "AUTHORIZATION",
        priority: 40,
        rationale: "test",
        kbModules: [],
        when: () => true,
      },
      {
        fact: FACT.EXIT_DELAY_REASON,
        reasonCode: "GRACE_PERIOD_UNRESOLVED",
        route: "GRACE",
        priority: 5,
        rationale: "test",
        kbModules: [],
        when: () => true,
      },
    ];

    const filtered = filterMissingFactsByCircumstances(missing, facts);
    expect(filtered.map((f) => f.fact)).toEqual([FACT.EXIT_DELAY_REASON]);
  });
});

describe("dynamicEngine + triage gate", () => {
  it("stops questioning when triage says wrong stage", async () => {
    const out = await nextDynamicQuestion({
      confirmed: {
        operator_name: "Debt Recovery Plus Ltd",
        pcn_number: "3438817",
        vrm: "KJ24FRV",
        parking_location: "SEARS RETAIL PARK",
        parking_event_date: "2026-05-04",
        charge_amount: 170,
        case_stage: "INITIAL_OPERATOR_APPEAL",
        confirmedAt: new Date().toISOString(),
      },
      answers: {},
      provider: null,
      triage: assessDocumentDeterministic({
        operatorName: "Debt Recovery Plus Ltd",
      }),
    });
    expect(out.status).toBe("OUT_OF_SCOPE");
    if (out.status === "OUT_OF_SCOPE") {
      expect(out.scope.detail).toMatch(/not suitable|later stage/i);
    }
  });
});
