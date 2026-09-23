/**
 * @vitest-environment node
 */
process.env.USE_ADMIN_ISSUE_ENGINE = "0";

import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT, deriveKnownFacts } from "@/lib/facts/facts";
import { askedFactKey, missingRequirements } from "@/lib/facts/missing";
import { classifyAllegation, factsImpliedByAllegation } from "@/lib/reasoning/allegation";
import {
  deriveFactsFromEvidence,
  establishedFacts,
  factsNeedingConfirmation,
  routesFromEvidence,
} from "@/lib/facts/fromEvidence";
import { assessCandidacy } from "@/lib/reasoning/routeCandidacy";
import type { AnswerMap } from "@/lib/facts/types";

/**
 * AI-2 — case-driven reasoning.
 *
 * The behaviour these prove is the one the client observed missing: the
 * journey previously could not react to the notice, the evidence, or a
 * changed answer, because routes only opened from hidden scenario tags
 * and questions were ordered by a fixed integer.
 */

function pcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "CitySquare Parking",
    pcn_number: "CSP-1",
    vrm: "KT19RPL",
    parking_location: "Harbour Point",
    parking_event_date: "2026-07-12",
    notice_issue_date: "2026-07-18",
    notice_received_date: "2026-07-22",
    notice_route: "POSTAL",
    confirmedAt: "2026-07-23T00:00:00.000Z",
    ...over,
  } as ConfirmedPcn;
}

const TRIAGE: AnswerMap = {
  [FACT.JURISDICTION]: "ENGLAND_WALES",
  [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
};

const facts = (answers: AnswerMap = {}, evidenceTypes: string[] = []) =>
  deriveKnownFacts({ confirmed: pcn(), answers, evidenceTypes });

/* ==================== Allegation classification ==================== */

describe("Allegation opens routes", () => {
  it("classifies non-payment and opens PAYMENT without any tag", () => {
    const c = classifyAllegation("Failure to make a valid payment");
    expect(c.category).toBe("NO_PAYMENT");
    expect(c.routes).toContain("PAYMENT");
    expect(c.routes).toContain("KEYING");
  });

  it("classifies no-permit without inferring a residential tenancy", () => {
    const c = classifyAllegation("No valid permit displayed");
    expect(c.category).toBe("NO_PERMIT");
    expect(c.routes).toContain("PERMIT");
    expect(c.routes).toContain("AUTHORIZATION");
    /*
     * The wording of the allegation cannot tell us the customer is an
     * occupier of the site. Opening RESIDENTIAL here is what used to
     * drag every permit case through "what is your connection to the
     * property?" — the route now waits for occupier facts.
     */
    expect(c.routes).not.toContain("RESIDENTIAL");
  });

  it("classifies overstay as a duration allegation", () => {
    const c = classifyAllegation("Overstaying maximum permitted stay");
    expect(c.category).toBe("OVERSTAY");
    expect(c.routes).toContain("GRACE");
    expect(c.routes).toContain("ANPR");
  });

  it("returns UNKNOWN rather than guessing", () => {
    expect(classifyAllegation("Something unusual").category).toBe("UNKNOWN");
    expect(classifyAllegation(null).routes).toEqual([]);
  });

  it("names the facts the allegation makes material", () => {
    expect(factsImpliedByAllegation("NO_PAYMENT")).toContain("payment_made");
    expect(factsImpliedByAllegation("NO_PERMIT")).toContain("permission_held");
  });

  it("opens PAYMENT from the notice alone, with no scenario tag", () => {
    // The exact defect: this used to require a hidden tag.
    const c = assessCandidacy({
      facts: facts(TRIAGE),
      allegedBreach: "Failure to make payment",
    });
    expect(c.candidates).toContain("PAYMENT");
    expect(c.provenance.PAYMENT?.[0]).toMatch(/notice alleges/);
  });
});

/* ===================== Evidence-derived facts ===================== */

describe("Evidence reduces questions", () => {
  it("treats a payment receipt as establishing payment", () => {
    const derived = deriveFactsFromEvidence(["payment_receipt"]);
    expect(establishedFacts(derived)[FACT.PAYMENT_MADE]).toBe("YES");
  });

  it("does NOT ask whether payment was made once a receipt exists", () => {
    // The client's headline example.
    const withReceipt = facts(
      { ...TRIAGE, [FACT.PAYMENT_MADE]: "YES" },
      ["payment_receipt"],
    );
    const missing = missingRequirements(
      withReceipt,
      assessCandidacy({
        facts: withReceipt,
        allegedBreach: "Failure to make payment",
      }).candidates,
    ).map((m) => m.fact);
    expect(missing).not.toContain(FACT.PAYMENT_MADE);
  });

  it("asks for confirmation where the inference is not safe", () => {
    // An app screenshot may show an attempt, not a completed payment.
    const derived = deriveFactsFromEvidence(["app_screenshot"]);
    expect(factsNeedingConfirmation(derived)).toContain(FACT.PAYMENT_MADE);
    expect(establishedFacts(derived)[FACT.PAYMENT_MADE]).toBeUndefined();
  });

  it("never assumes lease wording from a lease upload", () => {
    // Source Register §7: rights come from the instrument's wording.
    const derived = deriveFactsFromEvidence(["authorisation_evidence"]);
    expect(establishedFacts(derived)[FACT.AGREEMENT_UPLOADED]).toBe("YES");
    expect(factsNeedingConfirmation(derived)).toContain(
      FACT.AGREEMENT_PERMIT_CLAUSE,
    );
  });

  it("opens routes from evidence alone", () => {
    expect(routesFromEvidence(deriveFactsFromEvidence(["payment_receipt"])))
      .toContain("PAYMENT");
    expect(routesFromEvidence(deriveFactsFromEvidence(["authorisation_evidence"])))
      .toContain("RESIDENTIAL");
  });
});

/* ======================= Route exclusion ======================= */

describe("Contradicted routes are excluded", () => {
  it("closes PAYMENT once no payment was made or attempted", () => {
    const c = assessCandidacy({
      facts: facts({ ...TRIAGE, [FACT.PAYMENT_MADE]: "NO" }),
      allegedBreach: "Failure to make payment",
    });
    expect(c.candidates).not.toContain("PAYMENT");
    expect(c.excluded.map((e) => e.route)).toContain("PAYMENT");
  });

  it("closes KEYING too, since it presupposes a payment attempt", () => {
    const c = assessCandidacy({
      facts: facts({ ...TRIAGE, [FACT.PAYMENT_MADE]: "NO" }),
      allegedBreach: "Failure to make payment",
    });
    expect(c.candidates).not.toContain("KEYING");
  });

  it("keeps PAYMENT open when a payment was attempted but failed", () => {
    const c = assessCandidacy({
      facts: facts({
        ...TRIAGE,
        [FACT.PAYMENT_MADE]: "NO",
        [FACT.PAYMENT_ATTEMPTED]: "YES",
      }),
      allegedBreach: "Failure to make payment",
    });
    expect(c.candidates).toContain("PAYMENT");
  });

  it("closes BREAKDOWN when the vehicle could still be moved", () => {
    const c = assessCandidacy({
      facts: facts({
        ...TRIAGE,
        [FACT.BREAKDOWN_OCCURRED]: "YES",
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "NO",
      }),
      allegedBreach: "Overstay",
    });
    expect(c.candidates).not.toContain("BREAKDOWN");
  });
});

/* ===================== Information gain ===================== */

/* ============ Mandatory same-PCN / different-answer ============ */

/* =================== Recalculation after answers =================== */

describe("Recalculation after every answer", () => {
  it("changes the candidate route set as answers arrive", async () => {
    const overstay = pcn({ alleged_breach: "Overstaying maximum permitted stay" });
    const before = assessCandidacy({
      facts: facts(TRIAGE),
      allegedBreach: overstay.alleged_breach,
    });
    const after = assessCandidacy({
      facts: facts({ ...TRIAGE, [FACT.BREAKDOWN_OCCURRED]: "YES" }),
      allegedBreach: overstay.alleged_breach,
    });
    expect(before.candidates).not.toContain("BREAKDOWN");
    expect(after.candidates).toContain("BREAKDOWN");
  });

  it("never re-asks a fact already put to the customer", async () => {
    const f = facts({
      ...TRIAGE,
      [askedFactKey(FACT.PAYMENT_METHOD)]: true,
      [FACT.PAYMENT_MADE]: "YES",
    });
    const routes = assessCandidacy({
      facts: f, allegedBreach: "Failure to make payment",
    }).candidates;
    expect(missingRequirements(f, routes).map((m) => m.fact)).not.toContain(
      FACT.PAYMENT_METHOD,
    );
  });
});
