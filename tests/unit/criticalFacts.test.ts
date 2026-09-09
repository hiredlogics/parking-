/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts, FACT } from "@/lib/questions/facts";
import {
  askedFactKey,
  missingMaterialFacts,
  unresolvedCriticalFacts,
} from "@/lib/questions/missing";
import { TRIAGE_REQUIREMENTS } from "@/lib/questions/requirements";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import type { AnswerMap } from "@/lib/questions/types";

/**
 * Critical facts.
 *
 * Regression cover for a live dead end: a customer skipped the optional
 * "what happened" question, questioning completed with no scenario tag,
 * every substantive route in assessRoutes stayed closed, and the case
 * landed in review with nothing to argue.
 */

const CONFIRMED: ConfirmedPcn = {
  operator_name: "CitySquare Parking Management",
  pcn_number: "CSP-120726-73104",
  vrm: "KT19 RPL",
  parking_location: "Harbour Point, Bristol",
  parking_event_date: "2026-07-12",
  notice_route: "POSTAL",
  confirmedAt: "2026-07-20T00:00:00.000Z",
} as ConfirmedPcn;

const TRIAGE_DONE: AnswerMap = {
  [FACT.JURISDICTION]: "ENGLAND_WALES",
  [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
};

const facts = (answers: AnswerMap) =>
  deriveKnownFacts({ confirmed: CONFIRMED, answers });

describe("Critical fact requirements", () => {
  it("marks the grounds question critical", () => {
    const req = TRIAGE_REQUIREMENTS.find((r) => r.fact === FACT.SCENARIOS);
    expect(req?.critical).toBe(true);
  });

  it("marks keeper status critical", () => {
    const req = TRIAGE_REQUIREMENTS.find((r) => r.fact === FACT.REGISTERED_KEEPER);
    expect(req?.critical).toBe(true);
  });

  it("keeps a critical fact outstanding when asked but left empty", () => {
    // The exact live failure: asked, answered with nothing selected.
    const answers = { ...TRIAGE_DONE, [askedFactKey(FACT.SCENARIOS)]: true };
    expect(missingMaterialFacts(facts(answers))).toContain(FACT.SCENARIOS);
  });

  it("still treats a non-critical fact as settled once asked", () => {
    const answers = {
      ...TRIAGE_DONE,
      [FACT.SCENARIOS]: ["resident_parking_rights"],
      [FACT.OCCUPIER_STATUS]: "tenant",
      [FACT.AGREEMENT_UPLOADED]: "YES",
      [FACT.AGREEMENT_PERMIT_CLAUSE]: "NO",
      // A keeper may genuinely not know this; it must not be re-asked.
      [askedFactKey(FACT.BAY_REFERENCE)]: true,
    };
    expect(missingMaterialFacts(facts(answers))).not.toContain(FACT.BAY_REFERENCE);
  });

  it("clears once the grounds are actually given", () => {
    const answers = { ...TRIAGE_DONE, [FACT.SCENARIOS]: ["payment_made"] };
    expect(missingMaterialFacts(facts(answers))).not.toContain(FACT.SCENARIOS);
  });

  it("reports which critical facts are stuck", () => {
    const answers = { ...TRIAGE_DONE, [askedFactKey(FACT.SCENARIOS)]: true };
    const stuck = unresolvedCriticalFacts(facts(answers));
    expect(stuck.map((r) => r.fact)).toEqual([FACT.SCENARIOS]);
  });
});

describe("Dead-end prevention", () => {
  it("routes to review instead of completing with nothing to argue", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: { ...TRIAGE_DONE, [askedFactKey(FACT.SCENARIOS)]: true },
      askedFacts: [FACT.SCENARIOS],
      provider: null,
    });
    // Previously this returned SUFFICIENT_INFORMATION and dead-ended.
    expect(out.status).toBe("MANUAL_REVIEW");
    if (out.status === "MANUAL_REVIEW") {
      expect(out.reason).toBe("CRITICAL_FACT_UNRESOLVED");
    }
  });

  it("does not loop by re-asking the same critical fact", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: { ...TRIAGE_DONE, [askedFactKey(FACT.SCENARIOS)]: true },
      askedFacts: [FACT.SCENARIOS],
      provider: null,
    });
    expect(out.status).not.toBe("QUESTION_REQUIRED");
  });

  it("gives the customer an actionable message, not internal wording", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: { ...TRIAGE_DONE, [askedFactKey(FACT.SCENARIOS)]: true },
      askedFacts: [FACT.SCENARIOS],
      provider: null,
    });
    if (out.status !== "MANUAL_REVIEW") throw new Error("expected review");
    expect(out.detail).not.toMatch(/route|module|confirmed facts/i);
    expect(out.detail.length).toBeGreaterThan(40);
  });

  it("still asks the grounds question when it has not been put yet", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: TRIAGE_DONE,
      provider: null,
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.targetFact).toBe(FACT.SCENARIOS);
    }
  });

  it("proceeds normally once a ground is selected", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: { ...TRIAGE_DONE, [FACT.SCENARIOS]: ["payment_made"] },
      askedFacts: [FACT.SCENARIOS],
      provider: null,
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
  });
});
