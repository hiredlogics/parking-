import { describe, expect, it } from "vitest";
import { toLegacyAnswers } from "@/lib/questions/toLegacyAnswers";
import { FACT } from "@/lib/questions/facts";
import { evaluate } from "@/rules";
import type { ConfirmedPcn } from "@/types";

/**
 * The adaptive engine must keep the deterministic rules engine working
 * as a guardrail (V2 Part 14: "Rules/validators act as guardrails and
 * hard checks"). These tests prove the bridge feeds it correctly.
 */

const pcn: ConfirmedPcn = {
  operator_name: "Euro Car Parks",
  pcn_number: "ECP123456",
  vrm: "AB12CDE",
  parking_location: "Retail Park",
  parking_event_date: "2026-05-02",
  notice_issue_date: "2026-05-10",
  notice_route: "POSTAL",
  charge_amount: 100,
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: new Date().toISOString(),
};

describe("Adaptive → legacy answer bridge", () => {
  it("maps keeper triage onto core answers", () => {
    const legacy = toLegacyAnswers({
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.NOTICE_ROUTE]: "POSTAL",
    });
    expect(legacy.core.registered_keeper).toBe("YES");
    expect(legacy.core.driver_identified).toBe("NO");
    expect(legacy.core.notice_route).toBe("POSTAL");
    expect(legacy.branch.keeper).toBeDefined();
  });

  it("only keeps scenario tags the legacy engine understands", () => {
    const legacy = toLegacyAnswers({
      [FACT.SCENARIOS]: [
        "payment_made",
        "breakdown_immobilised",
        "resident_parking_rights",
        // Unknown tags must be dropped, not crash.
        "hospital_attendance",
      ],
    });
    expect(legacy.core.scenarios).toEqual([
      "payment_made",
      "breakdown_immobilised",
      "resident_parking_rights",
    ]);
  });

  it("maps a payment + keying case into the branch shape", () => {
    const legacy = toLegacyAnswers({
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "app",
      [FACT.PAYMENT_EVIDENCE]: "YES",
      [FACT.VRM_ENTERED]: "AB12CDF",
    });
    expect(legacy.branch.payment?.parking_payment_made).toBe("YES");
    expect(legacy.branch.payment?.payment_method).toBe("APP");
    expect(legacy.branch.payment?.payment_evidence_uploaded).toBe("YES");
    expect(legacy.branch.keying?.vrm_error).toBe("YES");
    expect(legacy.branch.keying?.entered_vrm).toBe("AB12CDF");
  });

  it("produces answers the rules engine can evaluate without warnings", () => {
    const legacy = toLegacyAnswers({
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.NOTICE_ROUTE]: "POSTAL",
      [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "machine",
      [FACT.PAYMENT_EVIDENCE]: "YES",
      [FACT.VRM_ENTERED]: "AB12CDF",
    });
    const evaluation = evaluate({ pcn, answers: legacy, evidence: [] });
    expect(evaluation.matchedParagraphIds.length).toBeGreaterThan(0);
    // The keeper intro must always fire on a registered-keeper route.
    expect(evaluation.matchedParagraphIds).toContain("PP-INTRO-001");
  });

  it("maps signage basis selections onto the signage branch", () => {
    const legacy = toLegacyAnswers({
      [FACT.SCENARIOS]: ["signage_issue"],
      [FACT.SIGNAGE_ISSUE_BASIS]: ["no_entrance_sign", "conflicting_signs"],
    });
    expect(legacy.branch.signage?.entrance_sign_visible).toBe("NO");
    expect(legacy.branch.signage?.conflicting_signage).toBe("YES");
    expect(legacy.branch.signage?.parking_charge_not_prominent).toBeUndefined();
  });

  it("treats a resident case as resident authorisation for the legacy engine", () => {
    const legacy = toLegacyAnswers({
      [FACT.SCENARIOS]: ["resident_parking_rights"],
      [FACT.OCCUPIER_STATUS]: "tenant",
      [FACT.AGREEMENT_UPLOADED]: "YES",
    });
    expect(legacy.branch.authorisation?.permit_type).toBe("RESIDENT");
    expect(legacy.branch.authorisation?.parking_authorised).toBe("YES");
  });

  it("does not invent grace branch facts from the situation tag alone", () => {
    const legacy = toLegacyAnswers({
      [FACT.SCENARIOS]: ["grace_or_exit"],
    });
    expect(legacy.branch.grace).toBeUndefined();
  });

  it("maps grace only when exit-delay facts were answered", () => {
    const legacy = toLegacyAnswers({
      [FACT.SCENARIOS]: ["grace_or_exit"],
      [FACT.EXIT_DELAY_REASON]: "Queue at the barrier",
    });
    expect(legacy.branch.grace?.additional_exit_time_required).toBe("YES");
  });

  it("returns an empty-but-valid shape for no answers", () => {
    const legacy = toLegacyAnswers({});
    expect(legacy.core.scenarios).toEqual([]);
    expect(legacy.branch).toEqual({});
    expect(() => evaluate({ pcn, answers: legacy, evidence: [] })).not.toThrow();
  });
});
