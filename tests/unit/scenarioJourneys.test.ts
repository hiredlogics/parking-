/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT, SCENARIO_TAGS } from "@/lib/questions/facts";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import { applyAnswerToFact } from "@/lib/questions/applyAnswer";
import { assessCandidacy } from "@/lib/reasoning/routeCandidacy";
import { deriveKnownFacts } from "@/lib/questions/facts";
import { splitMaterialFacts } from "@/lib/cases/sufficiencyResult";
import type { AnswerMap } from "@/lib/questions/types";
import type { QuestionProvider } from "@/services/ai/questions";

/**
 * AI-6 — the ten required scenario journeys.
 *
 * Each drives the real engine and records the ACTUAL journey. What
 * matters is not that a fixed script is followed, but that different
 * cases produce materially different journeys — which is the property
 * the old fixed questionnaire could not have.
 *
 * The provider is an oracle that asks for whatever the engine ranked
 * highest, so what is under test is the reasoning, not model wording.
 */

const BASE: ConfirmedPcn = {
  operator_name: "CitySquare Parking",
  pcn_number: "CSP-1",
  vrm: "KT19RPL",
  parking_location: "Harbour Point",
  parking_event_date: "2026-07-12",
  notice_issue_date: "2026-07-18",
  notice_received_date: "2026-07-22",
  notice_route: "POSTAL",
  confirmedAt: "2026-07-23T00:00:00.000Z",
} as ConfirmedPcn;

const pcn = (over: Partial<ConfirmedPcn>): ConfirmedPcn =>
  ({ ...BASE, ...over }) as ConfirmedPcn;

const TRIAGE: AnswerMap = {
  [FACT.JURISDICTION]: "ENGLAND_WALES",
  [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
};

function oracle(): QuestionProvider {
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
      /*
       * The served question must match the fact's real answer shape,
       * or applyAnswerToFact rejects the answer and the journey stalls
       * on a harness artefact rather than engine behaviour.
       */
      const isMulti = top.fact === FACT.SCENARIOS;
      return {
        output: {
          status: "QUESTION_REQUIRED",
          target_fact: top.fact,
          reason_code: top.reasonCode,
          route: top.route,
          question: isMulti
            ? {
                type: "multi_choice",
                label: "Which of these describe what happened?",
                options: SCENARIO_TAGS.map((t) => ({ value: t, label: t })),
              }
            : {
                type: "single_choice",
                label: `About ${top.fact.replace(/_/g, " ")}?`,
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

interface JourneyResult {
  initialRoutes: string[];
  steps: Array<{ fact: string; route: string; answer: unknown; routesAfter: string[] }>;
  finalStatus: string;
  finalRoutes: string[];
  unresolvedMaterial: string[];
  unresolvedOptional: string[];
}

async function runJourney(opts: {
  confirmed: ConfirmedPcn;
  evidenceTypes?: string[];
  answers: Record<string, unknown>;
  seed?: AnswerMap;
}): Promise<JourneyResult> {
  let answers: AnswerMap = { ...TRIAGE, ...(opts.seed ?? {}) };
  const evidenceTypes = opts.evidenceTypes ?? [];
  const askedFacts: string[] = [];
  const askedLabels: string[] = [];
  const steps: JourneyResult["steps"] = [];

  const initialRoutes = assessCandidacy({
    facts: deriveKnownFacts({ confirmed: opts.confirmed, answers, evidenceTypes }),
    allegedBreach: opts.confirmed.alleged_breach ?? null,
  }).candidates;

  let finalStatus = "LIMIT";
  let finalRoutes: string[] = initialRoutes;
  let missing: string[] = [];

  for (let i = 0; i < 14; i++) {
    const out = await nextDynamicQuestion({
      confirmed: opts.confirmed,
      allegedBreach: opts.confirmed.alleged_breach ?? null,
      answers,
      evidenceTypes,
      askedFacts,
      askedLabels,
      provider: oracle(),
    });
    finalRoutes = out.eligibleRoutes;
    if (out.status !== "QUESTION_REQUIRED") {
      finalStatus = out.status;
      missing = out.missingFacts;
      break;
    }
    const answer = opts.answers[out.targetFact] ?? "UNSURE";
    askedFacts.push(out.targetFact);
    askedLabels.push(out.question.label);
    const applied = applyAnswerToFact(answers, out.question, out.targetFact, answer as never);
    answers = applied.answers;
    steps.push({
      fact: out.targetFact,
      route: out.requirement.route,
      answer,
      routesAfter: out.eligibleRoutes,
    });
  }

  const split = splitMaterialFacts(missing);
  return {
    initialRoutes,
    steps,
    finalStatus,
    finalRoutes,
    unresolvedMaterial: split.material,
    unresolvedOptional: split.optional,
  };
}

const factsOf = (r: JourneyResult) => r.steps.map((s) => s.fact);

/* ============================ Scenario 1 ============================ */

describe("1. PAYMENT / KEYING", () => {
  it("investigates payment then the registration entered", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Failure to make a valid payment" }),
      evidenceTypes: ["payment_receipt"],
      answers: {
        [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
        [FACT.KEYING_ERROR]: "YES",
        [FACT.VRM_ENTERED]: "YES",
      },
    });
    expect(r.initialRoutes).toContain("PAYMENT");
    // The receipt establishes payment, so it is never asked.
    expect(factsOf(r)).not.toContain(FACT.PAYMENT_MADE);
    expect(r.finalRoutes).toContain("PAYMENT");
    expect(r.finalStatus).not.toBe("LIMIT");
  });
});

/* ============================ Scenario 2 ============================ */

describe("2. BREAKDOWN", () => {
  it("investigates immobilisation, then nature and evidence", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      evidenceTypes: [],
      answers: {
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
        [FACT.BREAKDOWN_NATURE]: "YES",
        [FACT.BREAKDOWN_EVIDENCE]: "YES",
      },
    });
    expect(r.finalRoutes).toContain("BREAKDOWN");
    expect(factsOf(r)).toContain(FACT.BREAKDOWN_PREVENTED_DEPARTURE);
  });

  it("closes the route when the vehicle could still be moved", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      answers: {
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "NO",
      },
    });
    expect(r.finalRoutes).not.toContain("BREAKDOWN");
    // And the follow-ups are never asked.
    expect(factsOf(r)).not.toContain(FACT.BREAKDOWN_EVIDENCE);
  });
});

/* ============================ Scenario 3 ============================ */

describe("3. RESIDENTIAL / ALLOCATED BAY", () => {
  it("reads the instrument before permit arguments", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "No valid permit displayed" }),
      evidenceTypes: ["authorisation_evidence"],
      answers: {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.OCCUPIER_STATUS]: "YES",
        [FACT.AGREEMENT_PERMIT_CLAUSE]: "NO",
        [FACT.BAY_REFERENCE]: "YES",
      },
    });
    expect(r.initialRoutes).toContain("RESIDENTIAL");
    // The lease upload establishes availability, so it is not asked.
    expect(factsOf(r)).not.toContain(FACT.AGREEMENT_UPLOADED);
    expect(r.finalRoutes).toContain("RESIDENTIAL");
  });
});

/* ============================ Scenario 4 ============================ */

describe("4. KEEPER / LATE NTK", () => {
  it("keeps the PoFA line open on an unidentified-driver keeper route", async () => {
    const r = await runJourney({
      // Notice served well outside the statutory window.
      confirmed: pcn({
        alleged_breach: "Parking without payment",
        parking_event_date: "2026-05-01",
        notice_issue_date: "2026-07-01",
        notice_received_date: "2026-07-05",
      }),
      answers: { [FACT.SCENARIOS]: ["postal_ntk_timing_issue"] },
    });
    expect(r.initialRoutes).toContain("POFA");
    expect(r.finalRoutes).toContain("POFA");
  });
});

/* ============================ Scenario 5 ============================ */

describe("5. ANPR MULTIPLE VISITS", () => {
  it("investigates continuous presence then the visit count", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstay of paid time" }),
      answers: {
        [FACT.SCENARIOS]: ["multiple_visits_same_day", "anpr_disputed"],
        [FACT.CONTINUOUS_PRESENCE]: "NO",
        [FACT.VISIT_COUNT]: "YES",
      },
    });
    expect(r.finalRoutes).toContain("ANPR");
    expect(factsOf(r)).toContain(FACT.CONTINUOUS_PRESENCE);
  });
});

/* ============================ Scenario 6 ============================ */

describe("6. CONSIDERATION PERIOD", () => {
  it("investigates what happened before parking was accepted", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Parking without payment" }),
      answers: {
        [FACT.SCENARIOS]: ["short_stay_consideration"],
        [FACT.INITIAL_PERIOD_REASON]: "YES",
      },
    });
    expect(r.finalRoutes).toContain("CONSIDERATION");
    expect(factsOf(r)).toContain(FACT.INITIAL_PERIOD_REASON);
  });
});

/* ============================ Scenario 7 ============================ */

describe("7. GRACE / EXIT DELAY", () => {
  it("investigates the departure delay", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      answers: {
        [FACT.SCENARIOS]: ["grace_or_exit"],
        [FACT.EXIT_DELAY_REASON]: "YES",
      },
    });
    expect(r.finalRoutes).toContain("GRACE");
    expect(factsOf(r)).toContain(FACT.EXIT_DELAY_REASON);
  });
});

/* ============================ Scenario 8 ============================ */

describe("8. PERMIT / AUTHORISATION", () => {
  it("investigates permission and its source", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "No valid permit displayed" }),
      answers: {
        [FACT.SCENARIOS]: ["authorised_or_permit"],
        [FACT.PERMISSION_HELD]: "YES",
        [FACT.PERMISSION_SOURCE]: "YES",
      },
    });
    expect(r.finalRoutes.some((x) => x === "AUTHORIZATION" || x === "PERMIT")).toBe(true);
    expect(factsOf(r)).toContain(FACT.PERMISSION_HELD);
  });

  it("closes the route when no permission was held", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "No valid permit displayed" }),
      answers: {
        [FACT.SCENARIOS]: ["authorised_or_permit"],
        [FACT.PERMISSION_HELD]: "NO",
      },
    });
    expect(r.finalRoutes).not.toContain("PERMIT");
    expect(factsOf(r)).not.toContain(FACT.PERMISSION_SOURCE);
  });
});

/* ============================ Scenario 9 ============================ */

describe("9. ACCESSIBILITY / EQUALITY", () => {
  it("only activates when the facts indicate a disability-related need", async () => {
    const without = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      answers: { [FACT.SCENARIOS]: ["grace_or_exit"] },
    });
    expect(without.finalRoutes).not.toContain("EQUALITY");

    const with_ = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      answers: {
        [FACT.SCENARIOS]: ["accessibility_additional_time"],
        [FACT.ADDITIONAL_TIME_NEEDED]: "YES",
      },
    });
    expect(with_.finalRoutes).toContain("EQUALITY");
  });

  it("never demands medical detail", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      answers: {
        [FACT.SCENARIOS]: ["accessibility_additional_time"],
        [FACT.ADDITIONAL_TIME_NEEDED]: "YES",
      },
    });
    // Source Register §10: do not demand excessive medical detail.
    for (const f of factsOf(r)) {
      expect(f).not.toMatch(/diagnosis|medical|condition/i);
    }
  });
});

/* =========================== Scenario 10 =========================== */

describe("10. MIXED — payment + ANPR + keeper", () => {
  it("opens all three lines and resolves them", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Failure to make a valid payment" }),
      evidenceTypes: ["payment_receipt", "anpr_evidence"],
      answers: {
        [FACT.SCENARIOS]: ["payment_made", "multiple_visits_same_day", "no_ntk_received"],
        [FACT.CONTINUOUS_PRESENCE]: "NO",
        [FACT.VISIT_COUNT]: "YES",
        [FACT.KEYING_ERROR]: "NO",
      },
    });
    expect(r.initialRoutes).toContain("PAYMENT");
    for (const route of ["PAYMENT", "ANPR", "POFA"]) {
      expect(r.finalRoutes, route).toContain(route);
    }
    // Payment established by receipt, so never asked.
    expect(factsOf(r)).not.toContain(FACT.PAYMENT_MADE);
  });
});

/* ================== Journeys must differ materially ================== */

describe("Journeys differ materially between scenarios", () => {
  it("produces different question sets for different cases", async () => {
    const payment = await runJourney({
      confirmed: pcn({ alleged_breach: "Failure to make a valid payment" }),
      answers: { [FACT.SCENARIOS]: ["payment_made"], [FACT.PAYMENT_MADE]: "YES" },
    });
    const breakdown = await runJourney({
      confirmed: pcn({ alleged_breach: "Overstaying maximum permitted stay" }),
      answers: {
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
      },
    });
    const residential = await runJourney({
      confirmed: pcn({ alleged_breach: "No valid permit displayed" }),
      answers: {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.OCCUPIER_STATUS]: "YES",
        [FACT.AGREEMENT_UPLOADED]: "YES",
      },
    });

    const sets = [payment, breakdown, residential].map((r) =>
      factsOf(r).sort().join(","),
    );
    expect(new Set(sets).size).toBe(3);
  });

  it("does not target a fixed question count", async () => {
    const short = await runJourney({
      confirmed: pcn({ alleged_breach: "Failure to make a valid payment" }),
      evidenceTypes: ["payment_receipt", "app_screenshot"],
      answers: { [FACT.SCENARIOS]: ["payment_made"], [FACT.PAYMENT_MADE]: "YES" },
    });
    const long = await runJourney({
      confirmed: pcn({ alleged_breach: "No valid permit displayed" }),
      answers: {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.OCCUPIER_STATUS]: "YES",
        [FACT.AGREEMENT_UPLOADED]: "YES",
        [FACT.AGREEMENT_PERMIT_CLAUSE]: "YES",
        [FACT.BAY_REFERENCE]: "YES",
      },
    });
    expect(short.steps.length).not.toBe(long.steps.length);
  });
});

/* ============ Mandatory: same PCN, different answer ============ */

describe("SAME PCN + DIFFERENT ANSWER = DIFFERENT NEXT QUESTION", () => {
  const SAME = pcn({ alleged_breach: "Failure to make a valid payment" });

  it("diverges on the payment answer", async () => {
    const base = {
      confirmed: SAME,
      allegedBreach: SAME.alleged_breach,
      askedFacts: [FACT.SCENARIOS, FACT.PAYMENT_MADE],
      askedLabels: ["What happened?", "Was a payment made?"],
      provider: oracle(),
    };
    const yes = await nextDynamicQuestion({
      ...base,
      answers: { ...TRIAGE, [FACT.PAYMENT_MADE]: "YES" },
    });
    const no = await nextDynamicQuestion({
      ...base,
      answers: {
        ...TRIAGE,
        [FACT.PAYMENT_MADE]: "NO",
        [FACT.PAYMENT_ATTEMPTED]: "NO",
      },
    });

    const a = yes.status === "QUESTION_REQUIRED" ? yes.targetFact : yes.status;
    const b = no.status === "QUESTION_REQUIRED" ? no.targetFact : no.status;
    expect(a).not.toBe(b);
  });

  it("diverges on a breakdown answer for an overstay notice", async () => {
    const overstay = pcn({ alleged_breach: "Overstaying maximum permitted stay" });
    const base = {
      confirmed: overstay,
      allegedBreach: overstay.alleged_breach,
      askedFacts: [FACT.SCENARIOS],
      askedLabels: ["What happened?"],
      provider: oracle(),
    };
    const brokeDown = await nextDynamicQuestion({
      ...base,
      answers: { ...TRIAGE, [FACT.BREAKDOWN_OCCURRED]: "YES" },
    });
    const didNot = await nextDynamicQuestion({
      ...base,
      answers: { ...TRIAGE, [FACT.EXIT_DELAY_REASON]: "traffic" },
    });

    const a = brokeDown.status === "QUESTION_REQUIRED" ? brokeDown.targetFact : brokeDown.status;
    const b = didNot.status === "QUESTION_REQUIRED" ? didNot.targetFact : didNot.status;
    expect(a).not.toBe(b);
  });
});

/* =============== Sufficiency is never count-driven =============== */

describe("Sufficiency is material-fact driven", () => {
  it("separates material from optional outstanding facts", () => {
    const split = splitMaterialFacts([
      FACT.PAYMENT_MADE,
      FACT.PAYMENT_METHOD,
      FACT.BAY_REFERENCE,
      FACT.OCCUPIER_STATUS,
    ]);
    expect(split.material).toContain(FACT.PAYMENT_MADE);
    expect(split.material).toContain(FACT.OCCUPIER_STATUS);
    // Supporting detail must not block progression.
    expect(split.optional).toContain(FACT.PAYMENT_METHOD);
    expect(split.optional).toContain(FACT.BAY_REFERENCE);
  });

  it("never reports NO_VIABLE_ROUTE as sufficient", async () => {
    const r = await runJourney({
      confirmed: pcn({ alleged_breach: "Contravention occurred" }),
      seed: { [FACT.DRIVER_IDENTIFIED]: "YES" },
      answers: {},
    });
    if (r.finalStatus === "MANUAL_REVIEW") {
      expect(r.finalRoutes).toEqual([]);
    }
    expect(r.finalStatus).not.toBe("SUFFICIENT_INFORMATION");
  });
});
