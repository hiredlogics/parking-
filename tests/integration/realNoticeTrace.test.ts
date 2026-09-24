// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/facts/types";
import { FACT, PROFILE, deriveKnownFacts } from "@/lib/facts/facts";
import { analyseCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { loadKbCatalog } from "@/lib/kb/catalog";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { evaluateIssues } from "@/lib/engine/issueEngine";
import {
  applyFactAnswer,
  resolveFactGap,
  validateFactAnswer,
} from "@/lib/facts/gapResolver";
import { deterministicQuestion } from "@/lib/facts/factQuestion";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { classifyNarrative } from "@/lib/reasoning/narrative";
import { generateValidatedAppeal } from "@/lib/generation/engine";

/**
 * Two real notices, traced stage by stage.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE OTHER SUITES
 * ------------------------------------------------
 * `productionNotices.test.ts` asserts that ten notices each retrieve at
 * least one ground. `factGapResolver.test.ts` measures the question
 * loop. Neither prints what actually happened, so when a real notice
 * produces a thin letter there is no way to see WHICH stage lost the
 * argument.
 *
 * This suite logs every stage for two notices that came off a customer's
 * doormat, with the per-module rejection codes from `retrieval.trace`,
 * so the failure point of any future thin letter is readable from the
 * test output rather than guessed at.
 *
 * The two were chosen because they sit on opposite sides of the PoFA
 * timing line, and because the second is defective in a way no fixture
 * had covered: it never states the contravention at all.
 *
 * NO MODEL RUNS HERE. Extraction, question wording, drafting and the
 * grounds judge are all model stages; this traces the deterministic
 * spine they sit on, which is what decides the grounds.
 */

/*
 * Read the REAL knowledge base, not the compiled seed.
 *
 * `loadKbCatalog` short-circuits to `seedCatalog()` under Vitest unless
 * `KB_USE_DATABASE` is set (lib/kb/catalog.ts:153). That default is
 * sensible — it stops every suite depending on a developer's database —
 * but it means a test can pass against compiled fixtures while
 * production reads 58 admin-editable rows that may have diverged. A
 * trace of a real notice is worth little against fixtures, so this one
 * opts in and logs which catalogue it got.
 *
 * These are set and restored around the suite rather than assigned at
 * module scope, because Vitest may reuse a worker process for several
 * files and a bare assignment would change how a LATER file behaves.
 * Swapping the knowledge base out from under an unrelated suite is a
 * nasty way to spend an afternoon.
 */
const ENV_OVERRIDES: Record<string, string> = {
  KB_USE_DATABASE: "1",
  FACT_QUESTIONS: "deterministic",
  GROUNDS_PROVIDER: "deterministic",
  DRAFTING_PROVIDER: "deterministic",
};
const priorEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [k, v] of Object.entries(ENV_OVERRIDES)) {
    priorEnv[k] = process.env[k];
    process.env[k] = v;
  }
});

afterAll(() => {
  for (const [k, v] of Object.entries(priorEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const notice = (over: Partial<ConfirmedPcn>): ConfirmedPcn =>
  ({
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    ...over,
  }) as ConfirmedPcn;

interface RealNotice {
  id: string;
  /** What the notice itself says, transcribed field by field. */
  confirmed: ConfirmedPcn;
  /** Free text the customer types on the evidence step. */
  narrative: string;
  /** The truth of the case; the customer declines anything absent. */
  truth: Record<string, unknown>;
  evidenceTypes: string[];
  /** Transcription notes — things on the paper the type cannot hold. */
  paperNotes: string[];
}

const NOTICES: RealNotice[] = [
  {
    id: "wise-parking-QEH-no-permit",
    confirmed: notice({
      operator_name: "Wise Parking Ltd",
      pcn_number: "AP539112",
      vrm: "LX71UNS",
      vehicle_make: "Seat",
      parking_location: "Queen Elizabeth Hospital - Car Park 1, London SE18 4QH",
      parking_event_date: "2026-09-08",
      notice_issue_date: "2026-09-14",
      entry_time: "09:07",
      exit_time: "16:28",
      total_recorded_duration: 441,
      // The full charge. £40 is the 14-day discount, not the liability.
      charge_amount: 80,
      alleged_breach: "No Permit",
    }),
    narrative:
      "I was at the hospital all day for a day-case procedure. The payment machine in Car Park 1 was not working and there was no sign at the entrance saying a permit was needed.",
    truth: {
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      anpr_images_on_notice: "ANPR",
      continuous_presence: "YES",
      visit_count: 1,
      timestamp_discrepancy: "NO",
      permission_held:
        "I was a patient attending a booked day-case appointment; no permit was offered to patients and the machine was out of order.",
      permission_source: "other",
      payment_made: "ATTEMPTED_FAILED",
      payment_method: "machine",
      payment_evidence: "NO",
      signage_issue_basis: ["no_entrance_sign", "term_not_prominent"],
      initial_period_reason:
        "I drove around Car Park 1 looking for a free space and to find a working machine.",
      // Deliberately absent: occupier_status, breakdown_*, agreement_uploaded.
      // A hospital visit is not a tenancy and not a breakdown; if the
      // system asks for those it is asking the wrong questions.
    },
    evidenceTypes: [],
    paperNotes: [
      "Keeper addressed as Mrs NANA PALM, 19 Apex Apartments, Culverley Road, London SE6 2LF",
      "Notice cites Schedule 4 Protection of Freedoms Act 2012 and 28-day keeper liability",
      "Says charge was 'detected and recorded by automatic number plate recognition camera'",
      "Discount £40 to 14 days, full £80 to 28 days, debt recovery after 12/10/2026",
      "Keeper postcode SE6 (Catford) is ~8 miles from the site SE18 (Woolwich) — not residential",
    ],
  },
  {
    id: "smart-parking-BM-chatham-late-ntk",
    confirmed: notice({
      operator_name: "Smart Parking Ltd",
      pcn_number: "SP62712518",
      vrm: "FD18BOF",
      parking_location: "B&M Chatham - ME4 4HA",
      parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27",
      entry_time: "19:06",
      exit_time: "20:41",
      total_recorded_duration: 95,
      charge_amount: 90,
      /*
       * Faithfully absent.
       *
       * The paper notice never states the contravention. It gives the
       * charge, the times and the images, and no allegation at all.
       * Filling this in would hide a defect that is itself a ground, so
       * the field is left as production would find it.
       */
      alleged_breach: undefined,
    }),
    narrative:
      "I went to B&M after work and queued a long time at the till. I never received anything until three weeks later.",
    truth: {
      [FACT.REGISTERED_KEEPER]: "YES",
      [FACT.DRIVER_IDENTIFIED]: "NO",
      anpr_images_on_notice: "ANPR",
      continuous_presence: "YES",
      visit_count: 1,
      timestamp_discrepancy: "NO",
      exit_delay_reason:
        "There was one till open and a long queue; it took over twenty minutes to be served.",
      initial_period_reason:
        "The car park was busy and I drove round before finding a space.",
      payment_made: "NO",
      payment_method: "other",
      payment_evidence: "NO",
    },
    evidenceTypes: [],
    paperNotes: [
      "Keeper addressed as Mr Benjamin Onakoh Haruna, 33 Harriet Drive, Rochester ME1 1DY",
      "NO CONTRAVENTION STATED anywhere on the notice",
      "Headed 'NOTICE TO KEEPER - PARKING CHARGE'; £90, discounted £50 within 14 days",
      "Threatens debt recovery charges 'not exceed £170'",
      "Arrival 19:06, departure 20:41 on 10/08/2026 — 95 minutes",
      "Issued 27/08/2026, 17 days after the event",
    ],
  },
];

const line = (s = "") => console.log(s);
const rule = (t: string) =>
  line(`\n${"=".repeat(74)}\n${t}\n${"=".repeat(74)}`);

/** Walk the whole pipeline, logging each stage. */
async function trace(n: RealNotice) {
  rule(`NOTICE  ${n.id}`);

  /* ---- Stage 1: what extraction yields (here, transcribed) ---- */
  line("\n[1] NOTICE FIELDS (in production: vision extraction -> customer confirm)");
  for (const [k, v] of Object.entries(n.confirmed)) {
    if (v === undefined) continue;
    line(`    ${k.padEnd(26)} ${String(v)}`);
  }
  line("    -- on the paper but outside the type:");
  for (const p of n.paperNotes) line(`       * ${p}`);

  /* ---- Stage 2: facts from the notice alone ---- */
  const noticeOnly = deriveKnownFacts({ confirmed: n.confirmed, answers: {} });
  line(`\n[2] FACTS FROM THE NOTICE ALONE  (${noticeOnly.known.size} known)`);
  for (const k of [...noticeOnly.known].sort()) {
    line(
      `    ${k.padEnd(30)} = ${JSON.stringify(noticeOnly.values[k])}`.padEnd(64) +
        ` [${noticeOnly.provenance[k] ?? "?"}]`,
    );
  }

  /* ---- Stage 3: the customer's own account ---- */
  const narrativeTags = classifyNarrative(n.narrative);
  line("\n[3] CUSTOMER NARRATIVE -> circumstance tags (keyword classifier, no model)");
  line(`    "${n.narrative}"`);
  line(`    tags    : ${narrativeTags.tags.join(", ") || "(none)"}`);
  line(
    `    matched : ${
      narrativeTags.matched.map((m) => `${m.tag} <- "${m.phrase}"`).join(", ") ||
      "(none)"
    }`,
  );

  /* ---- Stage 4: issues opened before any question ---- */
  let answers: AnswerMap = { [PROFILE.SITUATION_OTHER]: n.narrative };
  const first = await evaluateIssues({
    facts: deriveKnownFacts({
      confirmed: n.confirmed,
      answers,
      evidenceTypes: n.evidenceTypes,
    }),
    evidenceTypes: n.evidenceTypes,
  });
  line("\n[4] ISSUES OPENED BEFORE ANY QUESTION  (admin applicability_json)");
  line(`    active   : ${first.activeIssues.map((i) => i.code).join(", ") || "(none)"}`);
  line(`    missing  : ${first.missingFacts.length} required facts outstanding`);

  /* ---- Stage 5: the gap loop ---- */
  line("\n[5] FACT GAP LOOP  (one question at a time, system chooses)");
  let resolution = await resolveFactGap({
    facts: deriveKnownFacts({
      confirmed: n.confirmed,
      answers,
      evidenceTypes: n.evidenceTypes,
    }),
    evidenceTypes: n.evidenceTypes,
  });

  let step = 0;
  const asked: string[] = [];
  while (resolution.gap && step++ < 20) {
    const gap = resolution.gap;
    asked.push(gap.factKey);
    const q = deterministicQuestion(gap);
    const raw = n.truth[gap.factKey];
    const validated = await validateFactAnswer(gap.factKey, raw ?? null);
    expect(validated.ok, `${gap.factKey} rejected its own truth value`).toBe(true);

    line(`\n    Q${step}  fact   : ${gap.factKey}  (issue ${gap.issueCode}, ${gap.reasonCode ?? "-"})`);
    line(`        asked  : "${q.text}"`);
    line(
      `        answer : ${
        raw === undefined ? "(customer declines - not true of this case)" : JSON.stringify(validated.value)
      }`,
    );

    answers = applyFactAnswer(answers, gap.factKey, validated.value ?? null);
    resolution = await resolveFactGap({
      facts: deriveKnownFacts({
        confirmed: n.confirmed,
        answers,
        evidenceTypes: n.evidenceTypes,
      }),
      evidenceTypes: n.evidenceTypes,
    });
    line(`        issues now: ${resolution.activeIssues.map((i) => i.code).join(", ")}`);
  }
  line(
    `\n    asked ${asked.length}: ${asked.join(", ")}` +
      `\n    budget remaining ${resolution.remainingBudget}, still outstanding ${resolution.outstanding.length}`,
  );

  /* ---- Stage 6: defaults, then the facts drafting actually sees ---- */
  const { answers: draftingAnswers, applied, answerProvenance } =
    resolveAnswersWithDefaults(n.confirmed, answers, n.evidenceTypes);
  line("\n[6] SYSTEM DEFAULTS APPLIED  (non-assertable provenance)");
  for (const d of applied) {
    line(`    ${d.factKey.padEnd(26)} = ${JSON.stringify(d.value)}   [${d.reasonCode}]`);
  }
  if (applied.length === 0) line("    (none)");

  const facts = deriveKnownFacts({
    confirmed: n.confirmed,
    answers: draftingAnswers,
    evidenceTypes: n.evidenceTypes,
    answerProvenance,
  });
  line(`\n    facts at drafting: ${facts.known.size} known`);
  const bySource = new Map<string, string[]>();
  for (const k of facts.known) {
    const p = facts.provenance[k] ?? "?";
    bySource.set(p, [...(bySource.get(p) ?? []), k]);
  }
  for (const [src, keys] of [...bySource].sort()) {
    line(`      ${src.padEnd(15)} (${keys.length}) ${keys.sort().join(", ")}`);
  }

  /* ---- Stage 7: deterministic legal analysis ---- */
  const analysis = await analyseCase({
    confirmed: n.confirmed,
    answers: draftingAnswers,
    evidenceTypes: n.evidenceTypes,
    evidenceRefs: [],
    pofaConfig: await loadPofaConfig(),
  });
  line("\n[7] DETERMINISTIC ANALYSIS  (no model, no wording)");
  line(`    primary route   : ${analysis.primaryRoute ?? "(none)"}`);
  line(`    secondary routes: ${(analysis.secondaryRoutes ?? []).join(", ")}`);
  for (const a of analysis.assessments ?? []) {
    line(`      route ${a.route.padEnd(14)} rank=${a.rank} evidenceBacked=${a.evidenceBacked}  basis: ${a.basis.join("; ")}`);
  }
  line(`    PoFA timing     : ${analysis.pofa?.timingStatus}  daysLate=${analysis.pofa?.daysLate}`);
  line(`    PoFA route      : ${analysis.pofa?.route}  para=${analysis.pofa?.paragraph}  deadline=${analysis.pofa?.deadline}`);
  line(`    PoFA reasons    : ${(analysis.pofa?.reasons ?? []).join("; ") || "(none)"}`);
  line(`    prohibited      : ${(analysis.prohibitedClaims ?? []).join(", ") || "(none)"}`);
  line(`    manual review   : ${analysis.manualReview ?? false}`);
  line(`    missing facts   : ${(analysis.missingFacts ?? []).join(", ") || "(none)"}`);

  /* ---- Stage 8: retrieval, with every rejection ---- */
  const catalog = await loadKbCatalog();
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: n.confirmed.parking_event_date,
    evidenceTypes: n.evidenceTypes,
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });

  line(
    `\n[8] RETRIEVAL  (catalogue origin=${catalog.origin}: ` +
      `${catalog.modules.length} modules, ${catalog.blocks.length} blocks, ${catalog.sources.length} sources)`,
  );
  line(`    RETAINED (${retrieval.modules.length}):`);
  for (const m of retrieval.modules) {
    line(`      ${m.moduleId.padEnd(14)} [${m.routeFamily}] ${m.topic}`);
  }
  const byCode = new Map<string, string[]>();
  for (const t of retrieval.trace) {
    if (t.eligible) continue;
    byCode.set(t.code, [...(byCode.get(t.code) ?? []), t.moduleId]);
  }
  line(`    REJECTED (${retrieval.trace.filter((t) => !t.eligible).length}) by filter:`);
  for (const [code, ids] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
    line(`      ${code.padEnd(20)} ${ids.length.toString().padStart(2)}  ${ids.slice(0, 8).join(" ")}${ids.length > 8 ? " …" : ""}`);
  }

  /* ---- Stage 9: the wording that would be drafted from ---- */
  line(`\n[9] APPROVED WORDING AVAILABLE  (${retrieval.blocks.length} blocks from the database)`);
  for (const b of retrieval.blocks.slice(0, 10)) {
    const text = String(b.text ?? "").replace(/\s+/g, " ").slice(0, 88);
    line(`      ${b.blockId.padEnd(16)} ${text}…`);
  }
  if (retrieval.blocks.length > 10) {
    line(`      … and ${retrieval.blocks.length - 10} more`);
  }
  line(`\n    sources cited: ${retrieval.sources.map((s) => s.sourceId).join(", ")}`);

  /* ---- Stage 10: the letter itself ---- */
  const generated = await generateValidatedAppeal({
    confirmed: n.confirmed,
    answers: draftingAnswers,
    evidenceTypes: n.evidenceTypes,
    evidenceRefs: [],
    answerProvenance,
  });
  line(`\n[10] GENERATION  (drafting provider: ${generated.provider?.providerId ?? "none"})`);
  line(`    status   : ${generated.status}`);
  line(`    reason   : ${generated.reason ?? "-"} ${generated.detail ?? ""}`);
  line(`    modules  : ${generated.moduleIds.join(", ") || "(none)"}`);
  line(`    warnings : ${generated.warnings.join(" | ") || "(none)"}`);
  for (const a of generated.attempts) {
    line(
      `    attempt  : validation=${a.validation?.status ?? "-"} ` +
        `blocking=${a.validation?.blockingCount ?? 0} warnings=${a.validation?.warningCount ?? 0} ` +
        `failed=${Object.entries(a.validation?.byValidator ?? {})
          .filter(([, v]) => (v as unknown[]).length > 0)
          .map(([k]) => k)
          .join(",") || "none"}`,
    );
  }
  line("\n--- LETTER BODY ---");
  line(generated.body ?? "(no body released)");
  line("--- END BODY ---");

  return { asked, analysis, retrieval, facts, resolution, generated, catalog };
}

describe("real notices, traced end to end", () => {
  it("Wise Parking / QEH — served in time, so no timing challenge", async () => {
    const r = await trace(NOTICES[0]);

    // Event 08/09, issued 14/09 = 6 days. Well inside the 14-day window,
    // so alleging a late notice here would be an untrue statement.
    expect(r.analysis.pofa?.timingStatus).not.toBe("FAILED");
    expect(r.retrieval.modules.map((m) => m.moduleId)).not.toContain("KB-POFA-02");

    // There must still be a real argument in the letter.
    expect(r.retrieval.modules.length).toBeGreaterThan(0);
    expect(r.retrieval.blocks.length).toBeGreaterThan(0);

    // A hospital visit is neither a tenancy nor a breakdown. Asking for
    // either would be the old questionnaire behaviour returning.
    expect(r.asked).not.toContain("occupier_status");
    expect(r.asked).not.toContain("agreement_uploaded");
    expect(r.asked).not.toContain("breakdown_nature");
  }, 60_000);

  it("Smart Parking / B&M — 17 days late, so keeper liability fails", async () => {
    const r = await trace(NOTICES[1]);

    // Event 10/08, issued 27/08. Deemed served two working days later,
    // which is past the 14-day deadline of 24/08.
    expect(r.analysis.pofa?.timingStatus).toBe("FAILED");
    expect(r.analysis.pofa?.daysLate).toBeGreaterThan(0);
    expect(r.retrieval.modules.map((m) => m.moduleId)).toContain("KB-POFA-02");
    expect(r.retrieval.blocks.length).toBeGreaterThan(0);
  }, 60_000);

  /*
   * The notice states no contravention. Nothing in the pipeline may
   * invent one: an allegation the paper does not make cannot be
   * rebutted, and a letter that rebuts an imagined allegation tells the
   * operator the appeal was not read from their own notice.
   */
  it("does not fabricate an allegation the notice never made", async () => {
    const n = NOTICES[1];
    expect(n.confirmed.alleged_breach).toBeUndefined();
    const facts = deriveKnownFacts({
      confirmed: n.confirmed,
      answers: {},
    });
    const allegationFacts = [...facts.known].filter((k) =>
      k.startsWith("allegation"),
    );
    console.log(
      `\n    allegation facts derived from a notice with no allegation: ${
        allegationFacts.length === 0 ? "(none)" : allegationFacts.join(", ")
      }`,
    );
    for (const k of allegationFacts) {
      expect(facts.provenance[k]).not.toBe("inferred");
    }
  }, 60_000);
});
