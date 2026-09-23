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
import { scoreInformationGain } from "@/lib/reasoning/informationGain";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import { applyAnswerToFact } from "@/lib/questions/applyAnswer";
import type { AnswerMap } from "@/lib/facts/types";
import type { QuestionProvider } from "@/services/ai/questions";

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

/**
 * A provider that always asks for whatever the engine ranked highest.
 *
 * This isolates the reasoning layer: the question wording is trivial,
 * so what is under test is WHICH fact the engine chose, not how the
 * model phrased it.
 */
function oracleProvider(): QuestionProvider {
  return {
    id: "oracle",
    bespoke: true,
    async generate(ctx) {
      const top = ctx.missing[0];
      if (!top) {
        return {
          output: {
            status: "SUFFICIENT_INFORMATION",
            missing_material_facts: [],
            ready_for_next_stage: true,
          },
          providerId: "oracle", model: null, promptVersion: null,
        };
      }
      return {
        output: {
          status: "QUESTION_REQUIRED",
          target_fact: top.fact,
          reason_code: top.reasonCode,
          route: top.route,
          question: {
            type: "single_choice",
            label: `Please tell us about ${top.fact.replace(/_/g, " ")}.`,
            options: [
              { value: "YES", label: "Yes" },
              { value: "NO", label: "No" },
              { value: "UNSURE", label: "I'm not sure" },
            ],
          },
        },
        providerId: "oracle", model: null, promptVersion: null,
      };
    },
  };
}

/** Drive a journey, answering each target fact from a script. */
async function journey(opts: {
  confirmed: ConfirmedPcn;
  seed?: AnswerMap;
  evidenceTypes?: string[];
  answerFor: (fact: string) => unknown;
  maxSteps?: number;
}) {
  let answers: AnswerMap = { ...(opts.seed ?? {}) };
  const askedFacts: string[] = [];
  const askedLabels: string[] = [];
  const steps: Array<{ fact: string; route: string }> = [];
  let final = "LIMIT";
  let routes: string[] = [];

  for (let i = 0; i < (opts.maxSteps ?? 12); i++) {
    const out = await nextDynamicQuestion({
      confirmed: opts.confirmed,
      answers,
      evidenceTypes: opts.evidenceTypes ?? [],
      allegedBreach: opts.confirmed.alleged_breach ?? null,
      askedFacts,
      askedLabels,
      provider: oracleProvider(),
    });
    routes = out.eligibleRoutes;
    if (out.status !== "QUESTION_REQUIRED") {
      final = out.status;
      break;
    }
    steps.push({ fact: out.targetFact, route: out.requirement.route });
    askedFacts.push(out.targetFact);
    askedLabels.push(out.question.label);
    const applied = applyAnswerToFact(
      answers, out.question, out.targetFact,
      opts.answerFor(out.targetFact) as never,
    );
    answers = applied.answers;
  }
  return { steps, final, routes, answers };
}

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

describe("Information-gain ranking", () => {
  it("puts a route-deciding fact above supporting detail", () => {
    const f = facts({ ...TRIAGE, [FACT.SCENARIOS]: ["breakdown_immobilised"] });
    const routes = assessCandidacy({ facts: f, allegedBreach: "Overstay" }).candidates;
    const ranked = scoreInformationGain({
      facts: f,
      candidateRoutes: routes,
      missing: missingRequirements(f, routes),
      allegationCategory: "OVERSTAY",
    });
    const order = ranked.map((r) => r.requirement.fact);
    // Whether the vehicle could be moved decides the route; the nature
    // of the fault is colour.
    expect(order.indexOf(FACT.BREAKDOWN_PREVENTED_DEPARTURE)).toBeLessThan(
      order.indexOf(FACT.BREAKDOWN_NATURE),
    );
  });

  it("EXCLUDES a fact already established from evidence", () => {
    const f = facts({ ...TRIAGE }, ["payment_receipt"]);
    const routes = assessCandidacy({
      facts: f, allegedBreach: "Failure to make payment",
    }).candidates;
    const ranked = scoreInformationGain({
      facts: f,
      candidateRoutes: routes,
      missing: missingRequirements(f, routes),
      allegationCategory: "NO_PAYMENT",
      establishedFromEvidence: [FACT.PAYMENT_MADE],
    });
    // Excluded outright rather than scored low — a score can be
    // outvoted, and asking this is the failure we are preventing.
    expect(ranked.map((r) => r.requirement.fact)).not.toContain(
      FACT.PAYMENT_MADE,
    );
  });

  it("ranks a fact on a strong route above one on a weak route", () => {
    // Overstay opens ANPR; the breakdown answer opens BREAKDOWN, which
    // V2 Part 5 ranks far higher.
    const f = facts({ ...TRIAGE, [FACT.BREAKDOWN_OCCURRED]: "YES" });
    const candidacy = assessCandidacy({
      facts: f, allegedBreach: "Overstaying maximum permitted stay",
    });
    const routes = candidacy.candidates;
    const ranked = scoreInformationGain({
      facts: f,
      candidateRoutes: routes,
      missing: missingRequirements(f, routes),
      allegationCategory: "OVERSTAY",
      routeProvenance: candidacy.provenance,
    });
    const order = ranked.map((r) => r.requirement.fact);
    expect(order.indexOf(FACT.BREAKDOWN_PREVENTED_DEPARTURE)).toBeLessThan(
      order.indexOf(FACT.CONTINUOUS_PRESENCE),
    );
  });

  it("explains why each fact scored as it did", () => {
    const f = facts(TRIAGE);
    const routes = assessCandidacy({ facts: f, allegedBreach: null }).candidates;
    const ranked = scoreInformationGain({
      facts: f,
      candidateRoutes: routes,
      missing: missingRequirements(f, routes),
      allegationCategory: "UNKNOWN",
    });
    expect(ranked[0].reasons.length).toBeGreaterThan(0);
  });
});

/* ============ Mandatory same-PCN / different-answer ============ */

describe("CASE A vs CASE B — same PCN, different answer", () => {
  const NO_PAYMENT_PCN = pcn({ alleged_breach: "Failure to make a valid payment" });

  it("A: answering YES continues into the payment facts", async () => {
    const run = await journey({
      confirmed: NO_PAYMENT_PCN,
      seed: TRIAGE,
      // The oracle serves YES/NO/UNSURE, so answers must come from that
      // set or applyAnswerToFact rejects them.
      answerFor: (fact) => {
        if (fact === FACT.PAYMENT_MADE) return "YES";
        if (fact === FACT.SCENARIOS) return ["payment_made"];
        return "YES";
      },
    });
    const asked = run.steps.map((s) => s.fact);
    expect(asked).toContain(FACT.PAYMENT_MADE);
    // Payment stays live, so its follow-ups are reached.
    expect(asked).toContain(FACT.PAYMENT_EVIDENCE);
  });

  it("B: answering NO must NOT continue through method and receipt", async () => {
    const run = await journey({
      confirmed: NO_PAYMENT_PCN,
      seed: TRIAGE,
      answerFor: (fact) => {
        if (fact === FACT.PAYMENT_MADE) return "NO";
        if (fact === FACT.PAYMENT_ATTEMPTED) return "NO";
        if (fact === FACT.SCENARIOS) return ["signage_issue"];
        return "UNSURE";
      },
    });
    const asked = run.steps.map((s) => s.fact);
    expect(asked).toContain(FACT.PAYMENT_MADE);
    // The client's explicit requirement.
    expect(asked).not.toContain(FACT.PAYMENT_METHOD);
    expect(asked).not.toContain(FACT.PAYMENT_EVIDENCE);
  });

  it("produces a DIFFERENT next question for the same PCN", async () => {
    // Compared once triage and the description are settled, so the
    // divergence being measured is the payment answer itself.
    const base = {
      confirmed: NO_PAYMENT_PCN,
      askedFacts: [FACT.SCENARIOS, FACT.PAYMENT_MADE],
      askedLabels: ["What happened?", "Was a payment made?"],
      provider: oracleProvider(),
    };
    const yes = await nextDynamicQuestion({
      ...base,
      answers: { ...TRIAGE, [FACT.PAYMENT_MADE]: "YES" },
      allegedBreach: NO_PAYMENT_PCN.alleged_breach,
    });
    const no = await nextDynamicQuestion({
      ...base,
      answers: {
        ...TRIAGE,
        [FACT.PAYMENT_MADE]: "NO",
        [FACT.PAYMENT_ATTEMPTED]: "NO",
      },
      allegedBreach: NO_PAYMENT_PCN.alleged_breach,
    });

    const yesFact = yes.status === "QUESTION_REQUIRED" ? yes.targetFact : yes.status;
    const noFact = no.status === "QUESTION_REQUIRED" ? no.targetFact : no.status;
    expect(yesFact).not.toBe(noFact);
  });
});

describe("CASE C — overstay PCN, customer reports a breakdown", () => {
  it("pivots to the breakdown facts instead of continuing on overstay", async () => {
    const overstay = pcn({ alleged_breach: "Overstaying maximum permitted stay" });
    const out = await nextDynamicQuestion({
      confirmed: overstay,
      allegedBreach: overstay.alleged_breach,
      answers: { ...TRIAGE, [FACT.BREAKDOWN_OCCURRED]: "YES" },
      askedFacts: [FACT.SCENARIOS],
      provider: oracleProvider(),
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status !== "QUESTION_REQUIRED") return;
    expect(out.eligibleRoutes).toContain("BREAKDOWN");
    expect(out.targetFact).toBe(FACT.BREAKDOWN_PREVENTED_DEPARTURE);
  });
});

describe("CASE D — no-permit PCN, customer is a resident", () => {
  it("elevates residential rights rather than generic permit questions", async () => {
    const noPermit = pcn({ alleged_breach: "No valid permit displayed" });
    const out = await nextDynamicQuestion({
      confirmed: noPermit,
      allegedBreach: noPermit.alleged_breach,
      answers: {
        ...TRIAGE,
        [FACT.OCCUPIER_STATUS]: "tenant",
        [FACT.BAY_REFERENCE]: "Bay 14",
      },
      askedFacts: [FACT.SCENARIOS, FACT.OCCUPIER_STATUS],
      provider: oracleProvider(),
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status !== "QUESTION_REQUIRED") return;
    expect(out.eligibleRoutes).toContain("RESIDENTIAL");
    // The instrument is what matters, per Source Register §7.
    expect(out.targetFact).toBe(FACT.AGREEMENT_UPLOADED);
  });
});

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
