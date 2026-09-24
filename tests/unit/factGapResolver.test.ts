// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/facts/types";
import { FACT, PROFILE, deriveKnownFacts } from "@/lib/facts/facts";
import { analyseCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { loadKbCatalog } from "@/lib/kb/catalog";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import {
  applyFactAnswer,
  NEVER_ASK,
  QUESTION_BUDGET,
  resolveFactGap,
  validateFactAnswer,
} from "@/lib/facts/gapResolver";
import { deterministicQuestion } from "@/lib/facts/factQuestion";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { ASSERTABLE_PROVENANCE } from "@/lib/facts/types";

/**
 * The fact lifecycle, end to end, without a model.
 *
 * This walks the loop the customer walks — resolve a gap, answer it,
 * recalculate, resolve again — and then retrieves, so it measures the
 * thing that actually matters: how many modules a real case ends up
 * able to argue, and how many questions that cost.
 *
 * Wording generation is deliberately not exercised here. It decides
 * nothing (see lib/facts/factQuestion.ts), and a suite that needed an
 * API key to prove the fact lifecycle works would stop being run.
 */
process.env.FACT_QUESTIONS = "deterministic";

const notice = (over: Partial<ConfirmedPcn>): ConfirmedPcn =>
  ({
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    ...over,
  }) as ConfirmedPcn;

interface Scenario {
  id: string;
  confirmed: ConfirmedPcn;
  /**
   * What the customer would say, unprompted, in the "anything else we
   * should know" box. This is the only channel for a circumstance the
   * notice cannot state — no appeal-reason checklist exists any more.
   */
  narrative?: string;
  /**
   * The truth of this case. The simulated customer answers only from
   * here, and declines anything absent — which is what lets the suite
   * assert that irrelevant facts are never asked.
   */
  truth: Record<string, unknown>;
  evidenceTypes?: string[];
}

const SCENARIOS: Scenario[] = [
  {
    id: "smart-parking-pofa",
    confirmed: notice({
      operator_name: "Smart Parking Ltd", pcn_number: "SP62712518", vrm: "FD18BOF",
      parking_location: "B&M Chatham", parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27", entry_time: "19:06", exit_time: "20:41",
      total_recorded_duration: 95, charge_amount: 90,
      alleged_breach: "Parked without payment recorded by ANPR",
    }),
    truth: {},
  },
  {
    id: "payment-keying",
    confirmed: notice({
      operator_name: "Excel Parking Services", pcn_number: "EX4410882", vrm: "YD17 KKX",
      parking_location: "Queens Road, Sheffield", parking_event_date: "2026-06-15",
      notice_issue_date: "2026-06-20", entry_time: "14:00", exit_time: "15:07",
      total_recorded_duration: 67, charge_amount: 100,
      alleged_breach: "Parking without payment",
    }),
    narrative: "I paid at the machine but I typed in the wrong registration by one letter.",
    truth: {
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "machine",
      [FACT.VRM_ENTERED]: "YD17 KXX",
      [FACT.KEYING_ERROR]: "One letter of the registration was mistyped.",
      [FACT.PAYMENT_EVIDENCE]: "YES",
    },
    evidenceTypes: ["payment_receipt"],
  },
  {
    id: "breakdown",
    confirmed: notice({
      operator_name: "Horizon Parking Ltd", pcn_number: "HP-5521904", vrm: "RK18 UYT",
      parking_location: "Garden Centre, Norwich", parking_event_date: "2026-05-01",
      notice_issue_date: "2026-05-08", entry_time: "10:11", exit_time: "14:40",
      total_recorded_duration: 269, charge_amount: 100,
      alleged_breach: "Exceeded maximum stay",
    }),
    narrative: "My car broke down in the car park and the AA had to recover it.",
    truth: {
      [FACT.BREAKDOWN_NATURE]: "mechanical_failure",
      [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
      [FACT.RECOVERY_ATTENDANCE]: "The AA attended and recovered the vehicle.",
      [FACT.BREAKDOWN_EVIDENCE]: ["recovery_report"],
    },
    // A customer arguing a breakdown has the recovery paperwork, and the
    // modules that cite it are correctly withheld until it is uploaded.
    // Note the value is the UPLOAD tile, not the KB's own "recovery_report":
    // types/evidence.ts maps one to the other, and a fixture written in
    // the KB vocabulary describes an upload the product cannot produce.
    evidenceTypes: ["breakdown_evidence"],
  },
  {
    id: "residential",
    confirmed: notice({
      operator_name: "UK Parking Control", pcn_number: "UKPC7781203", vrm: "BV65 WNO",
      parking_location: "Elmfield Court", parking_event_date: "2026-08-02",
      notice_issue_date: "2026-08-02", notice_route: "WINDSCREEN",
      charge_amount: 100, alleged_breach: "No valid permit displayed",
    }),
    narrative: "I live in this block and my lease gives me the allocated bay I parked in.",
    truth: {
      [FACT.OCCUPIER_STATUS]: "leaseholder",
      [FACT.AGREEMENT_UPLOADED]: "YES",
      [FACT.PERMISSION_HELD]: "The lease grants the allocated bay.",
      [FACT.PERMISSION_SOURCE]: "resident_permit",
    },
    evidenceTypes: ["authorisation_evidence"],
  },
  {
    id: "anpr-double-visit",
    confirmed: notice({
      operator_name: "MET Parking Services", pcn_number: "MET3390127", vrm: "GX16 PLD",
      parking_location: "Retail Park, Luton", parking_event_date: "2026-07-20",
      notice_issue_date: "2026-07-25", entry_time: "08:40", exit_time: "16:05",
      total_recorded_duration: 445, charge_amount: 100,
      alleged_breach: "Overstay of maximum stay recorded by ANPR camera",
    }),
    narrative: "I made two separate visits that day, I left and came back later.",
    truth: {
      [FACT.CONTINUOUS_PRESENCE]: "NO",
      [FACT.VISIT_COUNT]: 2,
      [FACT.ANPR_IMAGES_ON_NOTICE]: "ANPR",
      [FACT.TIMESTAMP_DISCREPANCY]: "NO",
      [FACT.VEHICLE_LEFT_SITE_EVIDENCE]: "YES",
      [FACT.ANPR_DISPUTE_DETAIL]: "Two separate visits were merged into one stay.",
    },
  },
];

interface RunResult {
  asked: string[];
  answers: AnswerMap;
  issues: string[];
  moduleIds: string[];
  outstandingAfter: number;
  /** Every required fact the active issues named, across the whole run. */
  requiredSeen: Set<string>;
  provenance: Record<string, string | undefined>;
}

/** Walk the resolve → answer → recalculate loop to completion. */
async function runScenario(s: Scenario): Promise<RunResult> {
  let answers: AnswerMap = {};
  if (s.narrative) answers[PROFILE.SITUATION_OTHER] = s.narrative;
  const evidenceTypes = s.evidenceTypes ?? [];
  const asked: string[] = [];
  const requiredSeen = new Set<string>();

  let guard = 0;
  let resolution = await resolveFactGap({
    facts: deriveKnownFacts({ confirmed: s.confirmed, answers, evidenceTypes }),
    evidenceTypes,
  });

  while (resolution.gap && guard++ < 20) {
    for (const m of resolution.outstanding) requiredSeen.add(m.factKey);
    const gap = resolution.gap;
    asked.push(gap.factKey);

    // The customer answers only what is true for them, and declines
    // anything they have no answer to.
    const raw = s.truth[gap.factKey];
    const validated = await validateFactAnswer(gap.factKey, raw ?? null);
    expect(validated.ok, `${s.id}: ${gap.factKey} rejected its own truth value`).toBe(true);
    answers = applyFactAnswer(answers, gap.factKey, validated.value ?? null);

    resolution = await resolveFactGap({
      facts: deriveKnownFacts({ confirmed: s.confirmed, answers, evidenceTypes }),
      evidenceTypes,
    });
  }

  /*
   * Mirror what generation does before it drafts: fill the remaining
   * gaps from the configured safe defaults, carrying their provenance
   * so a default is never mistaken for something the customer said.
   *
   * This step is not optional dressing. The issue engine applies
   * defaults internally, but `analyseCase` and `retrieveKnowledge` do
   * not — so a harness that skips it sees no registered keeper, no
   * PoFA route, and the ROUTE filter then rejects every module. That
   * is exactly what this test measured on its first run, and it was
   * the harness that was wrong, not the engine.
   */
  const { answers: draftingAnswers, answerProvenance } =
    resolveAnswersWithDefaults(s.confirmed, answers, evidenceTypes);

  const facts = deriveKnownFacts({
    confirmed: s.confirmed,
    answers: draftingAnswers,
    evidenceTypes,
    answerProvenance,
  });
  const catalog = await loadKbCatalog();
  const analysis = await analyseCase({
    confirmed: s.confirmed,
    answers: draftingAnswers,
    evidenceTypes,
    evidenceRefs: [],
    pofaConfig: await loadPofaConfig(),
  });
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: s.confirmed.parking_event_date,
    evidenceTypes,
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });

  return {
    asked,
    answers,
    issues: resolution.activeIssues.map((i) => i.code),
    moduleIds: retrieval.modules.map((m) => m.moduleId),
    outstandingAfter: resolution.outstanding.length,
    requiredSeen,
    provenance: facts.provenance as Record<string, string | undefined>,
  };
}

const results = new Map<string, RunResult>();

describe("fact gap resolver", () => {
  beforeAll(async () => {
    for (const s of SCENARIOS) results.set(s.id, await runScenario(s));
  }, 180_000);

  it("never asks which appeal reason applies", () => {
    for (const [id, r] of results) {
      for (const fact of r.asked) {
        expect(NEVER_ASK.has(fact), `${id} asked forbidden fact ${fact}`).toBe(false);
      }
      expect(r.asked, `${id} asked the appeal-reason menu`).not.toContain(
        FACT.SCENARIOS,
      );
    }
  });

  it("refuses to collect the appeal-reason fact even if asked to", async () => {
    const v = await validateFactAnswer(FACT.SCENARIOS, ["payment_made"]);
    expect(v.ok).toBe(false);
  });

  /*
   * Only facts the customer can actually supply are ever put to them.
   * A NOTICE or COMPUTED fact reaching a question would be inviting a
   * guess at something the letter then asserts as established.
   */
  it("only asks facts whose registry source is ANSWER", async () => {
    const { loadFactRegistry } = await import("@/lib/config/factRegistry");
    const registry = await loadFactRegistry();
    for (const [id, r] of results) {
      for (const fact of r.asked) {
        expect(registry.get(fact)?.source, `${id}: ${fact}`).toBe("ANSWER");
      }
    }
  });

  it("asks each fact at most once", () => {
    for (const [id, r] of results) {
      expect(new Set(r.asked).size, `${id} repeated a question`).toBe(
        r.asked.length,
      );
    }
  });

  it("respects the question budget", () => {
    for (const [id, r] of results) {
      expect(r.asked.length, `${id} exceeded the budget`).toBeLessThanOrEqual(
        QUESTION_BUDGET,
      );
    }
  });

  /* ---------------- Acceptance: the five named cases ---------------- */

  /*
   * The notice is seven days outside the 14-day postal window, so the
   * keeper-liability grounds are decided by arithmetic on dates the
   * notice itself carries. No question may be needed to reach them —
   * that is what "without unnecessary questions" means here. The case
   * may still be asked about the payment allegation, because the
   * operator has alleged non-payment and the answer opens real grounds;
   * what it must not do is interrogate the customer to establish PoFA.
   */
  it("Smart Parking: reaches keeper liability without asking for it", () => {
    const r = results.get("smart-parking-pofa")!;
    expect(r.issues).toContain("POFA");
    expect(r.moduleIds).toContain("KB-POFA-02");
    expect(r.moduleIds.length).toBeGreaterThan(1);
    expect(r.asked).not.toContain(FACT.REGISTERED_KEEPER);
    expect(r.asked).not.toContain(FACT.DRIVER_IDENTIFIED);
    expect(r.asked).not.toContain(FACT.JURISDICTION);
    expect(r.asked).not.toContain(FACT.VEHICLE_HIRE_STATUS);
  });

  it("payment/keying: asks payment facts, then argues the keying grounds", () => {
    const r = results.get("payment-keying")!;
    expect(r.issues).toContain("PAYMENT_KEYING");
    for (const fact of r.asked) {
      expect(
        [
          FACT.PAYMENT_MADE, FACT.PAYMENT_METHOD, FACT.VRM_ENTERED,
          FACT.KEYING_ERROR, FACT.PAYMENT_EVIDENCE,
        ],
        `asked unrelated fact ${fact}`,
      ).toContain(fact);
    }
    expect(r.moduleIds.some((m) => m.startsWith("KB-KEY") || m.startsWith("KB-PAY"))).toBe(true);
  });

  it("breakdown: asks the breakdown and recovery facts", () => {
    const r = results.get("breakdown")!;
    expect(r.issues).toContain("BREAKDOWN");
    expect(r.asked).toContain(FACT.BREAKDOWN_PREVENTED_DEPARTURE);
    expect(r.moduleIds.some((m) => m.startsWith("KB-BREAK"))).toBe(true);
  });

  it("residential: asks occupier status and the agreement", () => {
    const r = results.get("residential")!;
    expect(r.issues).toContain("RESIDENTIAL");
    expect(r.asked).toContain(FACT.OCCUPIER_STATUS);
    expect(r.moduleIds.some((m) => m.startsWith("KB-RES"))).toBe(true);
  });

  it("ANPR: asks the visit and presence facts", () => {
    const r = results.get("anpr-double-visit")!;
    expect(r.issues).toContain("ANPR");
    expect(
      r.asked.some((f) =>
        [FACT.CONTINUOUS_PRESENCE, FACT.VISIT_COUNT, FACT.ANPR_IMAGES_ON_NOTICE].includes(
          f as never,
        ),
      ),
    ).toBe(true);
    expect(r.moduleIds.some((m) => m.startsWith("KB-ANPR"))).toBe(true);
  });

  /* -------------------------- Measurement -------------------------- */

  it("reports the fact lifecycle metrics", () => {
    const rows = [...results.entries()];
    const questions = rows.map(([, r]) => r.asked.length);
    const avg = questions.reduce((a, b) => a + b, 0) / questions.length;
    const zero = questions.filter((n) => n === 0).length;
    /*
     * Fact completion: of the required facts the active issues named,
     * how many the case actually established. Not "did every case run
     * its requirement list to zero" — the question budget deliberately
     * stops short of that, and a case that drafts on four good answers
     * instead of seven is the intended outcome, not a failure.
     */
    const completion =
      rows.reduce((acc, [, r]) => {
        const seen = [...r.requiredSeen];
        if (seen.length === 0) return acc + 1;
        const resolved = seen.filter(
          (f) => r.answers[f] !== undefined || r.provenance[f] !== undefined,
        ).length;
        return acc + resolved / seen.length;
      }, 0) / rows.length;

    console.log("\n  fact lifecycle metrics");
    console.log("  ----------------------");
    for (const [id, r] of rows) {
      console.log(
        `  ${id.padEnd(22)} questions=${String(r.asked.length).padEnd(2)} ` +
          `modules=${String(r.moduleIds.length).padEnd(2)} ` +
          `issues=${(r.issues.join(",") || "-").padEnd(40)} ` +
          `asked=[${r.asked.join(" ")}]`,
      );
    }
    console.log(`  average questions per case : ${avg.toFixed(2)}`);
    console.log(`  zero-question cases        : ${zero}/${rows.length}`);
    console.log(`  fact completion rate       : ${(completion * 100).toFixed(0)}%`);
    console.log(
      `  modules retrieved (min/max): ${Math.min(
        ...rows.map(([, r]) => r.moduleIds.length),
      )}/${Math.max(...rows.map(([, r]) => r.moduleIds.length))}`,
    );

    // Guard rails, not vanity numbers: the journey must stay short and
    // every case must finish with something to argue.
    expect(avg).toBeLessThanOrEqual(QUESTION_BUDGET);
    expect(completion).toBeGreaterThan(0.5);
    for (const [id, r] of rows) {
      expect(r.moduleIds.length, `${id} retrieved nothing`).toBeGreaterThan(0);
    }
  });

  /*
   * Requirement that outranks every metric above: an AI-guessed fact
   * must never become assertable. A customer answer is; a system
   * default and anything read out of prose are not.
   */
  it("keeps guessed and defaulted facts out of assertable provenance", () => {
    for (const [id, r] of results) {
      for (const fact of r.asked) {
        if (r.answers[fact] === undefined) continue;
        expect(r.provenance[fact], `${id}: ${fact}`).toBe("answer");
        expect(ASSERTABLE_PROVENANCE.has("answer")).toBe(true);
      }
      // Defaults fill gaps but may never be stated as established fact.
      for (const fact of [FACT.REGISTERED_KEEPER, FACT.VEHICLE_HIRE_STATUS]) {
        const p = r.provenance[fact];
        if (p === "system_default") {
          expect(ASSERTABLE_PROVENANCE.has("system_default")).toBe(false);
        }
      }
      // Tags read out of the customer's prose are never assertable.
      if (r.provenance[FACT.SCENARIOS] === "inferred") {
        expect(ASSERTABLE_PROVENANCE.has("inferred")).toBe(false);
      }
    }
  });

  it("wording is usable with no model configured", () => {
    const q = deterministicQuestion({
      factKey: FACT.PAYMENT_MADE,
      issueCode: "PAYMENT_KEYING",
      issueLabel: "Payment / Keying Error",
      reasonCode: "PAYMENT_STATUS_UNRESOLVED",
      guidance: "Whether payment was made decides the payment grounds.",
      label: "Payment made",
      valueType: "ENUM",
      allowedValues: ["YES", "NO", "UNSURE"],
      evidenceTypes: [],
      optional: false,
    });
    expect(q.source).toBe("deterministic");
    expect(q.text).toContain("?");
    expect(q.options).toEqual(["YES", "NO", "UNSURE"]);
  });
});
