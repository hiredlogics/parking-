/**
 * @vitest-environment node
 */
process.env.USE_ADMIN_ISSUE_ENGINE = "0";

import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts, FACT } from "@/lib/facts/facts";
import {
  askedFactKey,
  missingMaterialFacts,
  unresolvedCriticalFacts,
} from "@/lib/facts/missing";
import { TRIAGE_REQUIREMENTS } from "@/lib/facts/requirements";
import type { AnswerMap } from "@/lib/facts/types";

/**
 * Dead-end prevention.
 *
 * Regression cover for a live failure: a customer skipped the optional
 * "what happened" question, questioning completed with no route open,
 * and the case landed in review with nothing to argue.
 *
 * The guard has MOVED. `scenarios` used to be marked critical, because
 * scenario tags were the only way to open a route. AI-2 opens routes
 * from the notice's allegation, established facts and uploaded evidence
 * as well, so an empty description is no longer fatal — and requiring
 * it was the hidden-tag dependency the client asked us to remove.
 *
 * What still must never happen is completing with NO viable route, so
 * that is what is guarded now.
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
  it("no longer marks the grounds question critical", () => {
    // Routes now open from the allegation, facts and evidence too.
    const req = TRIAGE_REQUIREMENTS.find((r) => r.fact === FACT.SCENARIOS);
    expect(req?.critical).toBeUndefined();
  });

  it("still marks keeper status critical", () => {
    const req = TRIAGE_REQUIREMENTS.find((r) => r.fact === FACT.REGISTERED_KEEPER);
    expect(req?.critical).toBe(true);
  });

  it("keeps keeper status outstanding when asked but left empty", () => {
    const answers = { [askedFactKey(FACT.REGISTERED_KEEPER)]: true };
    expect(missingMaterialFacts(facts(answers))).toContain(
      FACT.REGISTERED_KEEPER,
    );
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
    const answers = { [askedFactKey(FACT.REGISTERED_KEEPER)]: true };
    const stuck = unresolvedCriticalFacts(facts(answers));
    expect(stuck.map((r) => r.fact)).toContain(FACT.REGISTERED_KEEPER);
  });
});

describe("Dead-end prevention", () => {
  it("does NOT dead-end a keeper case just because the description is empty", () => {
    // The PoFA line is always available on an unidentified-driver
    // keeper route, so an empty description is survivable now.
    const answers = { ...TRIAGE_DONE, [askedFactKey(FACT.SCENARIOS)]: true };
    expect(unresolvedCriticalFacts(facts(answers))).toHaveLength(0);
  });

});
