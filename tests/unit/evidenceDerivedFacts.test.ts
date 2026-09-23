/**
 * @vitest-environment node
 *
 * Evidence as a fact producer.
 *
 * lib/facts/fromEvidence.ts existed long before this test, but nothing
 * in the analysis pipeline consumed it: `deriveKnownFacts` took
 * `evidenceTypes` and used them only to populate `facts.evidence`, so a
 * customer who uploaded a payment receipt still arrived at the module
 * gates with `payment_made` unset and the payment modules were filtered
 * out. These tests pin the wiring, and — more importantly — pin the
 * safety rules that decide what evidence is allowed to establish.
 */
import { describe, expect, it } from "vitest";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { FACT, deriveKnownFacts } from "@/lib/facts/facts";
import { tagsFromEvidence } from "@/lib/facts/fromEvidence";
import type { ConfirmedPcn } from "@/types";

const notice: ConfirmedPcn = {
  operator_name: "Test Parking Ltd",
  pcn_number: "PCN123456",
  vrm: "AB12 CDE",
  parking_location: "Test Retail Park, Manchester, M1 1AA",
  parking_event_date: "2026-05-01",
  notice_issue_date: "2026-05-10",
  notice_route: "POSTAL",
  charge_amount: 100,
  alleged_breach: "Failure to make a valid payment",
  case_stage: "INITIAL_OPERATOR_APPEAL",
} as ConfirmedPcn;

function retrieve(evidenceTypes: string[], answers = {}) {
  const input = { confirmed: notice, answers, evidenceTypes };
  const analysis = analyseCase(input);
  const facts = factsForCase(input);
  const result = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: notice.parking_event_date,
    evidenceTypes,
  });
  return {
    moduleIds: result.modules.map((m) => m.moduleId).sort(),
    prohibited: analysis.prohibitedClaims,
    facts,
  };
}

describe("evidence establishes facts that reach the module gates", () => {
  it("a payment receipt alone retrieves payment grounds with no customer answers", () => {
    const withoutEvidence = retrieve([]);
    const withReceipt = retrieve(["payment_receipt"]);

    /*
     * The bug this fixes, in its starkest form: with no answers and no
     * evidence this notice retrieves NOTHING. Every module gate keys on
     * a fact only a customer answer could establish, and PoFA is not
     * applicable until keeper status is known, so even the generic
     * KB-POFA-01 fallback is filtered out.
     */
    expect(withoutEvidence.moduleIds).toEqual([]);

    expect(withReceipt.moduleIds).toContain("KB-PAY-01");
    expect(withReceipt.moduleIds.length).toBeGreaterThan(
      withoutEvidence.moduleIds.length,
    );
  });

  it("records the receipt-derived facts with document provenance, not as a customer answer", () => {
    const { facts } = retrieve(["payment_receipt"]);
    expect(facts.values[FACT.PAYMENT_MADE]).toBe("YES");
    expect(facts.provenance[FACT.PAYMENT_MADE]).toBe("document");
    expect(facts.provenance[FACT.PAYMENT_EVIDENCE]).toBe("document");
  });

  it("lifts the payment prohibition only when the evidence supports it", () => {
    expect(retrieve([]).prohibited).toContain("ASSERT_PAYMENT_WAS_MADE");
    expect(retrieve(["payment_receipt"]).prohibited).not.toContain(
      "ASSERT_PAYMENT_WAS_MADE",
    );
  });

  it("a real customer answer outranks the evidence on conflict", () => {
    // The receipt says a payment exists; the customer says it does not.
    // The customer wins, and the fact stays theirs.
    const { facts } = retrieve(["payment_receipt"], {
      [FACT.PAYMENT_MADE]: "NO",
    });
    expect(facts.values[FACT.PAYMENT_MADE]).toBe("NO");
    expect(facts.provenance[FACT.PAYMENT_MADE]).toBe("answer");
  });

  it("never narrows the customer's own scenario selections", () => {
    const facts = deriveKnownFacts({
      confirmed: notice,
      answers: { [FACT.SCENARIOS]: ["resident_parking_rights"] },
      evidenceTypes: ["payment_receipt"],
    });
    expect([...facts.tags].sort()).toEqual([
      "payment_made",
      "resident_parking_rights",
    ]);
    // A tag the customer chose is still attributed to them.
    expect(facts.provenance[FACT.SCENARIOS]).toBe("answer");
  });
});

describe("tag derivation stays inside what the evidence actually proves", () => {
  it("derives a tag only from evidence that establishes the tag's own proposition", () => {
    expect(tagsFromEvidence(["payment_receipt"])).toEqual(["payment_made"]);
    expect(tagsFromEvidence(["signage_photo"])).toEqual(["signage_issue"]);
    expect(tagsFromEvidence(["breakdown_evidence"])).toEqual([
      "breakdown_immobilised",
    ]);
  });

  /*
   * These are the derivations that look obvious and are not safe. A tag
   * does double duty: it opens module gates AND lifts prohibitions in
   * lib/analysis/prohibited.ts. Deriving one of these from an unread
   * upload would remove the only guard keeping an unsupported claim out
   * of the letter, so each is left to the document-understanding layer.
   */
  it("does not claim authorisation from an unread permit upload", () => {
    expect(tagsFromEvidence(["permit"])).not.toContain("authorised_or_permit");
    const { moduleIds, prohibited } = retrieve(["permit"]);
    expect(prohibited).toContain("ASSERT_VALID_PERMIT_HELD");
    expect(moduleIds).not.toContain("KB-AUTH-02");
  });

  it("does not claim the ANPR record is inconsistent from an ANPR upload", () => {
    expect(tagsFromEvidence(["anpr_evidence"])).not.toContain("anpr_disputed");
    expect(retrieve(["anpr_evidence"]).prohibited).toContain(
      "ALLEGE_TIMESTAMP_DISCREPANCY",
    );
  });

  it("does not claim residence from an authorisation document", () => {
    expect(tagsFromEvidence(["authorisation_evidence"])).not.toContain(
      "resident_parking_rights",
    );
    expect(retrieve(["authorisation_evidence"]).prohibited).toContain(
      "ASSERT_QUIET_ENJOYMENT",
    );
  });

  it("a breakdown upload opens no frustration claim without the departure fact", () => {
    const { moduleIds, prohibited } = retrieve(["breakdown_evidence"]);
    expect(prohibited).toContain("ASSERT_FRUSTRATION_OR_IMPOSSIBILITY");
    expect(moduleIds).not.toContain("KB-BREAK-01");
  });
});
