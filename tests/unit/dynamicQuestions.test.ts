/**
 * @vitest-environment node
 */
process.env.USE_ADMIN_ISSUE_ENGINE = "0";

import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts, FACT } from "@/lib/facts/facts";
import {
  missingMaterialFacts,
  missingRequirements,
  askedFactKey,
} from "@/lib/facts/missing";
import {
  allRequirements,
  isPermittedFact,
  openRoutes,
  ROUTE_REQUIREMENTS,
  TRIAGE_REQUIREMENTS,
  ALL_REASON_CODES,
} from "@/lib/facts/requirements";
import { validateGeneratedQuestion, similarity } from "@/lib/questions/validateGenerated";
import { nextDynamicQuestion } from "@/lib/questions/dynamicEngine";
import { fallbackQuestionFor } from "@/lib/questions/fallback";
import { applyAnswerToFact } from "@/lib/questions/applyAnswer";
import type { GeneratedQuestion } from "@/lib/questions/generated";
import type { AnswerMap } from "@/lib/facts/types";
import type { QuestionProvider } from "@/services/ai/questions";

/**
 * AI-dynamic question engine.
 *
 * The point of these tests is that NOTHING is a fixed sequence: the same
 * engine produces different questions, and different numbers of them,
 * purely from the facts of each case.
 */

const CONFIRMED: ConfirmedPcn = {
  operator_name: "Op Ltd",
  pcn_number: "PCN123",
  vrm: "AB12CDE",
  parking_location: "Retail Park",
  parking_event_date: "2025-03-01",
  notice_issue_date: "2025-03-10",
  notice_received_date: "2025-03-14",
  notice_route: "POSTAL",
  confirmedAt: "2025-03-15T00:00:00.000Z",
} as ConfirmedPcn;

function facts(answers: AnswerMap = {}, evidenceTypes: string[] = []) {
  return deriveKnownFacts({ confirmed: CONFIRMED, answers, evidenceTypes });
}

/** A stub provider returning a fixed candidate. */
function stubProvider(
  outputs: Array<GeneratedQuestion | null>,
): QuestionProvider {
  let i = 0;
  return {
    id: "stub",
    bespoke: true,
    async generate() {
      const out = outputs[Math.min(i, outputs.length - 1)];
      i += 1;
      return {
        output: out,
        providerId: "stub",
        model: "stub-model",
        promptVersion: "question-v1",
        error: out ? undefined : "stub failure",
      };
    },
  };
}

function candidate(over: Partial<GeneratedQuestion> = {}): GeneratedQuestion {
  return {
    status: "QUESTION_REQUIRED",
    target_fact: FACT.REGISTERED_KEEPER,
    reason_code: "KEEPER_STATUS_UNRESOLVED",
    route: "TRIAGE",
    question: {
      type: "single_choice",
      label: "Is the appellant the registered keeper of the vehicle?",
      options: [
        { value: "YES", label: "Yes" },
        { value: "NO", label: "No" },
        { value: "UNSURE", label: "I'm not sure" },
      ],
    },
    ...over,
  };
}

/* ====================== Fact-requirement map ====================== */

describe("Fact-requirement map", () => {
  it("only references facts from the FACT registry", () => {
    const known = new Set(Object.values(FACT) as string[]);
    for (const r of allRequirements()) {
      expect(known.has(r.fact), `${r.fact} is not a FACT key`).toBe(true);
    }
  });

  it("only uses declared reason codes", () => {
    for (const r of allRequirements()) {
      expect(ALL_REASON_CODES).toContain(r.reasonCode);
    }
  });

  it("contains no customer-facing question wording", () => {
    for (const r of allRequirements()) {
      // Rationale is internal justification, never a question.
      expect(r.rationale.endsWith("?"), r.fact).toBe(false);
    }
  });

  it("covers payment, breakdown and residential as specified", () => {
    expect(ROUTE_REQUIREMENTS.PAYMENT?.map((r) => r.fact)).toEqual([
      FACT.PAYMENT_MADE,
      FACT.PAYMENT_METHOD,
      FACT.PAYMENT_EVIDENCE,
    ]);
    expect(ROUTE_REQUIREMENTS.BREAKDOWN?.map((r) => r.fact)).toContain(
      FACT.BREAKDOWN_PREVENTED_DEPARTURE,
    );
    expect(ROUTE_REQUIREMENTS.RESIDENTIAL?.map((r) => r.fact)).toContain(
      FACT.AGREEMENT_UPLOADED,
    );
  });

  it("cites controlled KB modules for route requirements", () => {
    for (const list of Object.values(ROUTE_REQUIREMENTS)) {
      for (const r of list ?? []) {
        expect(r.kbModules.length, r.fact).toBeGreaterThan(0);
      }
    }
  });

  it("rejects facts outside the map", () => {
    expect(isPermittedFact(FACT.PAYMENT_MADE)).toBe(true);
    expect(isPermittedFact("driver_name")).toBe(false);
    expect(isPermittedFact("household_income")).toBe(false);
  });
});

/* =================== Missing-fact recalculation =================== */

describe("Missing material facts", () => {
  it("never asks for a fact the confirmed notice already establishes", () => {
    // notice_route = POSTAL came from the PCN, so it must not be asked.
    const missing = missingMaterialFacts(facts());
    expect(missing).not.toContain(FACT.NOTICE_ROUTE);
  });

  it("starts with scope and triage before any route", () => {
    // Location on the notice resolves jurisdiction — next up is hire status.
    const missing = missingMaterialFacts(facts());
    expect(missing[0]).toBe(FACT.VEHICLE_HIRE_STATUS);
    expect(missing).not.toContain(FACT.JURISDICTION);
  });

  it("asks jurisdiction only when the notice has no parking location", () => {
    const missing = missingMaterialFacts(
      deriveKnownFacts({
        confirmed: { ...CONFIRMED, parking_location: undefined },
      }),
    );
    expect(missing[0]).toBe(FACT.JURISDICTION);
  });

  it("opens route requirements only once a route is in play", () => {
    const base = facts({
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
    });
    expect(missingMaterialFacts(base)).not.toContain(FACT.PAYMENT_METHOD);

    const withPayment = facts({
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.SCENARIOS]: ["payment_made"],
    });
    expect(missingMaterialFacts(withPayment)).toContain(FACT.PAYMENT_METHOD);
  });

  it("stops asking payment follow-ups once no payment was made", () => {
    // The explicit example from the brief.
    const noPayment = facts({
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.SCENARIOS]: ["signage_issue"],
      [FACT.PAYMENT_MADE]: "NO",
    });
    const missing = missingMaterialFacts(noPayment);
    expect(missing).not.toContain(FACT.PAYMENT_METHOD);
    expect(missing).not.toContain(FACT.PAYMENT_EVIDENCE);
  });

  it("does not re-raise a fact answered 'not sure'", () => {
    const answers: AnswerMap = {
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.SCENARIOS]: ["breakdown_immobilised"],
      // Asked, but produced no value.
      [askedFactKey(FACT.BREAKDOWN_NATURE)]: true,
    };
    expect(missingMaterialFacts(facts(answers))).not.toContain(
      FACT.BREAKDOWN_NATURE,
    );
  });

  it("suppresses residential follow-ups when no agreement exists", () => {
    const f = facts({
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      [FACT.SCENARIOS]: ["resident_parking_rights"],
      [FACT.OCCUPIER_STATUS]: "tenant",
      [FACT.AGREEMENT_UPLOADED]: "NO",
    });
    const missing = missingMaterialFacts(f);
    expect(missing).not.toContain(FACT.AGREEMENT_PERMIT_CLAUSE);
    expect(missing).not.toContain(FACT.BAY_REFERENCE);
  });

  it("derives different requirements for different cases", () => {
    const common = {
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
    };
    const payment = missingMaterialFacts(
      facts({ ...common, [FACT.SCENARIOS]: ["payment_made"] }),
    );
    const breakdown = missingMaterialFacts(
      facts({ ...common, [FACT.SCENARIOS]: ["breakdown_immobilised"] }),
    );
    expect(payment).not.toEqual(breakdown);
  });
});

/* ====================== Generated validation ====================== */

describe("Generated question validation", () => {
  /** Facts with no location so jurisdiction stays outstanding for these tests. */
  const base = () => {
    const f = deriveKnownFacts({
      confirmed: { ...CONFIRMED, parking_location: undefined },
    });
    return { facts: f, missing: missingRequirements(f) };
  };

  it("accepts a well-formed keeper-safe question", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "JURISDICTION_UNRESOLVED",
        route: "SCOPE",
        question: {
          type: "single_choice",
          label: "Where is the car park located?",
          options: [
            { value: "ENGLAND_WALES", label: "England or Wales" },
            { value: "SCOTLAND", label: "Scotland" },
          ],
        },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects an invented fact", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({ target_fact: "driver_name" }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("UNKNOWN_FACT");
  });

  it("rejects 'who was driving' outright", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.DRIVER_IDENTIFIED,
        reason_code: "DRIVER_NOTIFICATION_STATUS_UNRESOLVED",
        route: "TRIAGE",
        question: { type: "short_text", label: "Who was driving the vehicle?" },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("KEEPER_SAFETY");
  });

  it("rejects 'were you driving'", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        question: { type: "boolean", label: "Were you driving at the time?" },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("KEEPER_SAFETY");
  });

  it("permits the keeper-safe driver-notification wording", () => {
    const f = facts({
      [FACT.JURISDICTION]: "ENGLAND_WALES",
      [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
      [FACT.REGISTERED_KEEPER]: "YES",
    });
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.DRIVER_IDENTIFIED,
        reason_code: "DRIVER_NOTIFICATION_STATUS_UNRESOLVED",
        route: "TRIAGE",
        question: {
          type: "single_choice",
          label:
            "Has the parking company already been given the driver's name and address?",
          options: [
            { value: "YES", label: "Yes" },
            { value: "NO", label: "No" },
          ],
        },
      }),
      facts: f,
      missing: missingRequirements(f),
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(true);
  });

  it("rejects requests for irrelevant personal information", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "JURISDICTION_UNRESOLVED",
        route: "SCOPE",
        question: { type: "short_text", label: "What is your date of birth?" },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("KEEPER_SAFETY");
  });

  it("rejects an unsupported legal assertion", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "JURISDICTION_UNRESOLVED",
        route: "SCOPE",
        question: {
          type: "boolean",
          label: "The law requires the operator to sign properly — was the car park in England?",
        },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("LEGAL_ASSERTION");
  });

  it("rejects a fact already established from the notice", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.NOTICE_ROUTE,
        reason_code: "NOTICE_ROUTE_UNRESOLVED",
        route: "POFA",
        question: { type: "boolean", label: "Did the notice arrive by post?" },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.failures.map((x) => x.rule)).toContain("ALREADY_KNOWN");
    }
  });

  it("rejects a semantic repeat of an earlier question", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "JURISDICTION_UNRESOLVED",
        route: "SCOPE",
        question: { type: "short_text", label: "Where is the car park located?" },
      }),
      facts: f,
      missing,
      askedLabels: ["Where is the car park located?"],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("SEMANTIC_REPEAT");
  });

  it("rejects more than one question in a label", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "JURISDICTION_UNRESOLVED",
        route: "SCOPE",
        question: {
          type: "short_text",
          label: "Where is the car park? And what time did the vehicle arrive?",
        },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("ONE_QUESTION");
  });

  it("rejects a mismatched reason code", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "PAYMENT_STATUS_UNRESOLVED",
        route: "SCOPE",
        question: { type: "short_text", label: "Which country is the car park in?" },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("REASON_MISMATCH");
  });

  it("rejects a fact that is not outstanding for this case", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.BREAKDOWN_NATURE,
        reason_code: "BREAKDOWN_NATURE_UNRESOLVED",
        route: "BREAKDOWN",
        question: { type: "short_text", label: "What stopped the vehicle moving?" },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.failures.map((x) => x.rule)).toContain("NOT_OUTSTANDING");
  });

  it("rejects a choice question with too few options", () => {
    const { facts: f, missing } = base();
    const res = validateGeneratedQuestion({
      candidate: candidate({
        target_fact: FACT.JURISDICTION,
        reason_code: "JURISDICTION_UNRESOLVED",
        route: "SCOPE",
        question: {
          type: "single_choice",
          label: "Which country?",
          options: [{ value: "ENGLAND_WALES", label: "England or Wales" }],
        },
      }),
      facts: f,
      missing,
      askedLabels: [],
      askedFacts: [],
    });
    expect(res.ok).toBe(false);
  });

  it("scores near-duplicate wording as similar", () => {
    expect(
      similarity(
        "Was a payment made for this parking event?",
        "Was a payment made for the parking event?",
      ),
    ).toBeGreaterThanOrEqual(0.8);
    expect(
      similarity("Where is the car park?", "What stopped the vehicle moving?"),
    ).toBeLessThan(0.5);
  });
});

/* ================= Regeneration and fallback ================= */

describe("Regeneration and fallback", () => {
  const noLocation = { ...CONFIRMED, parking_location: undefined };

  it("serves a valid AI question on the first attempt", async () => {
    const out = await nextDynamicQuestion({
      confirmed: noLocation,
      provider: stubProvider([
        candidate({
          target_fact: FACT.JURISDICTION,
          reason_code: "JURISDICTION_UNRESOLVED",
          route: "SCOPE",
          question: {
            type: "single_choice",
            label: "Whereabouts in the UK is the car park?",
            options: [
              { value: "ENGLAND_WALES", label: "England or Wales" },
              { value: "SCOTLAND", label: "Scotland" },
            ],
          },
        }),
      ]),
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.provenance.origin).toBe("AI");
    }
  });

  it("regenerates once, then accepts", async () => {
    const out = await nextDynamicQuestion({
      confirmed: noLocation,
      provider: stubProvider([
        // First attempt is keeper-unsafe.
        candidate({
          target_fact: FACT.JURISDICTION,
          reason_code: "JURISDICTION_UNRESOLVED",
          route: "SCOPE",
          question: { type: "short_text", label: "Who was driving that day?" },
        }),
        candidate({
          target_fact: FACT.JURISDICTION,
          reason_code: "JURISDICTION_UNRESOLVED",
          route: "SCOPE",
          question: {
            type: "single_choice",
            label: "Whereabouts in the UK is the car park?",
            options: [
              { value: "ENGLAND_WALES", label: "England or Wales" },
              { value: "SCOTLAND", label: "Scotland" },
            ],
          },
        }),
      ]),
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.provenance.origin).toBe("AI_REGENERATED");
      expect(out.provenance.rejections.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the bank after two invalid attempts", async () => {
    const bad = candidate({
      target_fact: FACT.JURISDICTION,
      reason_code: "JURISDICTION_UNRESOLVED",
      route: "SCOPE",
      question: { type: "short_text", label: "Who was driving?" },
    });
    const out = await nextDynamicQuestion({
      confirmed: noLocation,
      provider: stubProvider([bad, bad]),
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.provenance.origin).toBe("BANK_FALLBACK");
    }
  });

  it("falls back to the bank when no AI is configured", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      provider: null,
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.provenance.origin).toBe("BANK_FALLBACK");
    }
  });

  it("falls back when the provider errors", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      provider: stubProvider([null]),
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.provenance.origin).toBe("BANK_FALLBACK");
    }
  });

  it("NEVER marks a case sufficient just because the AI failed", async () => {
    // The model wrongly claims completion while facts remain.
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      provider: {
        id: "liar",
        bespoke: true,
        async generate() {
          return {
            output: {
              status: "SUFFICIENT_INFORMATION",
              missing_material_facts: [],
              ready_for_next_stage: true,
            },
            providerId: "liar",
            model: null,
            promptVersion: null,
          };
        },
      },
    });
    expect(out.status).not.toBe("SUFFICIENT_INFORMATION");
  });

  it("reaches SUFFICIENT_INFORMATION when every requirement is met", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: {
        [FACT.JURISDICTION]: "ENGLAND_WALES",
        [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
        [FACT.REGISTERED_KEEPER]: "YES",
        [FACT.DRIVER_IDENTIFIED]: "NO",
        // The tag implies payment_made, so it is not asked again.
        [FACT.SCENARIOS]: ["payment_made"],
        [FACT.PAYMENT_METHOD]: "machine",
        [FACT.PAYMENT_EVIDENCE]: "YES",
      },
      provider: null,
    });
    expect(out.status).toBe("SUFFICIENT_INFORMATION");
  });

  it("asks payment status when keying opens payment without a paid tag", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: {
        [FACT.JURISDICTION]: "ENGLAND_WALES",
        [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
        [FACT.REGISTERED_KEEPER]: "YES",
        [FACT.DRIVER_IDENTIFIED]: "NO",
        [FACT.SCENARIOS]: ["vrm_error"],
        [FACT.VRM_ENTERED]: "AB12CDE",
      },
      provider: null,
    });
    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.targetFact).toBe(FACT.PAYMENT_MADE);
    }
  });

  it("stops at the safety limit rather than looping", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      askedFacts: Array.from({ length: 40 }, (_, i) => `f${i}`),
      provider: null,
    });
    expect(out.status).toBe("MANUAL_REVIEW");
    if (out.status === "MANUAL_REVIEW") {
      expect(out.reason).toBe("QUESTION_LIMIT_REACHED");
    }
  });

  it("reports out of scope before asking anything further", async () => {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers: { [FACT.JURISDICTION]: "SCOTLAND" },
      provider: null,
    });
    expect(out.status).toBe("OUT_OF_SCOPE");
  });
});

/* ======================= Example journeys ======================= */

/**
 * Drive a whole journey with a scripted answerer and a bank-only
 * provider, so the sequence is produced entirely by re-analysis.
 */
async function runJourney(answerFor: (fact: string) => unknown) {
  let answers: AnswerMap = {};
  const askedFacts: string[] = [];
  const askedLabels: string[] = [];
  const asked: Array<{ fact: string; label: string }> = [];

  for (let i = 0; i < 20; i++) {
    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      answers,
      askedFacts,
      askedLabels,
      provider: null,
    });
    if (out.status !== "QUESTION_REQUIRED") {
      return { asked, final: out.status, answers };
    }
    asked.push({ fact: out.targetFact, label: out.question.label });
    askedFacts.push(out.targetFact);
    askedLabels.push(out.question.label);

    const applied = applyAnswerToFact(
      answers,
      out.question,
      out.targetFact,
      answerFor(out.targetFact) as never,
    );
    answers = applied.answers;
  }
  return { asked, final: "LIMIT", answers };
}

describe("Example journeys", () => {
  const triage = (fact: string) => {
    if (fact === FACT.JURISDICTION) return "ENGLAND_WALES";
    if (fact === FACT.VEHICLE_HIRE_STATUS) return "PRIVATE";
    if (fact === FACT.REGISTERED_KEEPER) return "YES";
    if (fact === FACT.DRIVER_IDENTIFIED) return "NO";
    return null;
  };

  it("payment case asks payment facts and not breakdown or residential ones", async () => {
    const { asked, final } = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["payment_made"];
      if (fact === FACT.PAYMENT_MADE) return "YES";
      if (fact === FACT.PAYMENT_METHOD) return "machine";
      if (fact === FACT.PAYMENT_EVIDENCE) return "YES";
      return null;
    });
    const facts_ = asked.map((a) => a.fact);
    const paymentFacts = new Set<string>([
      FACT.PAYMENT_METHOD,
      FACT.PAYMENT_EVIDENCE,
      FACT.PAYMENT_MADE,
    ]);
    const askedPayment = facts_.some((f) => paymentFacts.has(f));
    expect(askedPayment).toBe(true);
    expect(facts_).not.toContain(FACT.BREAKDOWN_NATURE);
    expect(facts_).not.toContain(FACT.OCCUPIER_STATUS);
    expect(final).not.toBe("LIMIT");
  });

  it("breakdown case asks breakdown facts and not payment ones", async () => {
    const { asked } = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["breakdown_immobilised"];
      if (fact === FACT.BREAKDOWN_PREVENTED_DEPARTURE) return "YES";
      if (fact === FACT.BREAKDOWN_NATURE) return "mechanical_failure";
      if (fact === FACT.BREAKDOWN_EVIDENCE) return ["recovery_report"];
      return null;
    });
    const facts_ = asked.map((a) => a.fact);
    expect(facts_).toContain(FACT.BREAKDOWN_NATURE);
    expect(facts_).toContain(FACT.BREAKDOWN_EVIDENCE);
    expect(facts_).not.toContain(FACT.PAYMENT_METHOD);
  });

  it("residential case asks agreement facts and skips bay when no agreement", async () => {
    const { asked } = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["resident_parking_rights"];
      if (fact === FACT.OCCUPIER_STATUS) return "tenant";
      if (fact === FACT.AGREEMENT_UPLOADED) return "NO";
      return null;
    });
    const facts_ = asked.map((a) => a.fact);
    expect(facts_).toContain(FACT.OCCUPIER_STATUS);
    expect(facts_).toContain(FACT.AGREEMENT_UPLOADED);
    // No agreement, so the clause and bay questions never arise.
    expect(facts_).not.toContain(FACT.AGREEMENT_PERMIT_CLAUSE);
    expect(facts_).not.toContain(FACT.BAY_REFERENCE);
  });

  it("produces a different number of questions for different cases", async () => {
    const payment = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["payment_made"];
      if (fact === FACT.PAYMENT_METHOD) return "machine";
      if (fact === FACT.PAYMENT_EVIDENCE) return "YES";
      return null;
    });
    const residential = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["resident_parking_rights"];
      if (fact === FACT.OCCUPIER_STATUS) return "tenant";
      if (fact === FACT.AGREEMENT_UPLOADED) return "YES";
      if (fact === FACT.AGREEMENT_PERMIT_CLAUSE) return "NO";
      if (fact === FACT.BAY_REFERENCE) return "Bay 14";
      return null;
    });
    // Not a fixed sequence: the journeys differ in length.
    expect(payment.asked.length).not.toBe(residential.asked.length);
  });

  it("never asks how the notice arrived when the PCN established it", async () => {
    const { asked } = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["signage_issue"];
      if (fact === FACT.SIGNAGE_ISSUE_BASIS) return "not_visible";
      return null;
    });
    expect(asked.map((a) => a.fact)).not.toContain(FACT.NOTICE_ROUTE);
  });

  it("keeps every served question keeper-safe across all journeys", async () => {
    const { asked } = await runJourney((fact) => {
      const t = triage(fact);
      if (t !== null) return t;
      if (fact === FACT.SCENARIOS) return ["payment_made", "breakdown_immobilised"];
      return null;
    });
    for (const a of asked) {
      expect(a.label).not.toMatch(/who\s+(was|were)\s+driv/i);
      expect(a.label).not.toMatch(/were\s+you\s+driv/i);
      expect(a.label).not.toMatch(/driver'?s?\s+name/i);
    }
  });
});

/* ========================= Bank fallback ========================= */

describe("Bank fallback", () => {
  it("finds a bank question for a fact the bank covers", () => {
    const f = facts();
    const req = TRIAGE_REQUIREMENTS.find((r) => r.fact === FACT.REGISTERED_KEEPER)!;
    expect(fallbackQuestionFor(req, f)).not.toBeNull();
  });

  it("returns null for a fact the bank does not cover", () => {
    const f = facts();
    const req = ROUTE_REQUIREMENTS.PAYMENT!.find(
      (r) => r.fact === FACT.PAYMENT_MADE,
    )!;
    // payment_made is only reachable via the AI or the scenario tag.
    expect(fallbackQuestionFor(req, f)).toBeNull();
  });
});

/* ======================= Answer application ======================= */

describe("Answer application", () => {
  it("writes the target fact and marks it asked", () => {
    const res = applyAnswerToFact(
      {},
      {
        questionId: "gen:x",
        type: "single_choice",
        label: "Which country?",
        required: true,
        options: [{ value: "ENGLAND_WALES", label: "England or Wales" }],
      },
      FACT.JURISDICTION,
      "ENGLAND_WALES",
    );
    expect(res.ok).toBe(true);
    expect(res.answers[FACT.JURISDICTION]).toBe("ENGLAND_WALES");
    expect(res.answers[askedFactKey(FACT.JURISDICTION)]).toBe(true);
  });

  it("rejects a value outside the served options", () => {
    const res = applyAnswerToFact(
      {},
      {
        questionId: "gen:x",
        type: "single_choice",
        label: "Which country?",
        required: true,
        options: [{ value: "ENGLAND_WALES", label: "England or Wales" }],
      },
      FACT.JURISDICTION,
      "NARNIA",
    );
    expect(res.ok).toBe(false);
  });

  it("marks a fact asked even when the answer is empty", () => {
    const res = applyAnswerToFact(
      {},
      { questionId: "gen:x", type: "short_text", label: "Bay number?", required: false },
      FACT.BAY_REFERENCE,
      null,
    );
    expect(res.ok).toBe(true);
    // Otherwise "I don't know" would loop forever.
    expect(res.answers[askedFactKey(FACT.BAY_REFERENCE)]).toBe(true);
  });
});
