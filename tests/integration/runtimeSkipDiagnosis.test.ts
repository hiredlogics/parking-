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
import { classifyAllegation } from "@/lib/reasoning/allegation";
import { rulesExtractFromBytes } from "@/services/extraction/rulesOcr";

/**
 * Why the customer never sees a question, and why the letter is generic.
 *
 * The client reported four symptoms — the situation step is skipped, the
 * issue is not identified, the allegation is not detected, and the letter
 * is generic. This suite shows they are ONE failure with a second design
 * flaw that hides it, by running the same reasoning pipeline over the
 * same notices with extraction working and with extraction dead.
 *
 * It asserts the mechanism rather than describing it, so the day
 * extraction is fixed this suite proves the questions came back.
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

interface Case {
  id: string;
  confirmed: ConfirmedPcn;
  narrative: string;
  truth: Record<string, unknown>;
}

/** The three notices the client is testing with. */
const CLIENT_CASES: Case[] = [
  {
    id: "smart-parking (PoFA timing)",
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
      // The paper notice states no contravention. Faithfully absent.
      alleged_breach: undefined,
    }),
    narrative:
      "I went to B&M after work and queued a long time at the till. Nothing arrived until three weeks later.",
    truth: {
      anpr_images_on_notice: "ANPR",
      continuous_presence: "YES",
      visit_count: 1,
      timestamp_discrepancy: "NO",
      exit_delay_reason: "One till was open and the queue took over twenty minutes.",
      initial_period_reason: "The car park was busy and I drove round to find a space.",
    },
  },
  {
    id: "euro-car-parks (payment / keying)",
    confirmed: notice({
      operator_name: "Euro Car Parks",
      pcn_number: "88812545842",
      vrm: "KJ19KYN",
      parking_location: "Sainsburys Willesden Green",
      parking_event_date: "2026-08-29",
      notice_issue_date: "2026-09-04",
      entry_time: "13:05",
      exit_time: "14:14",
      total_recorded_duration: 69,
      charge_amount: 100,
      alleged_breach: "A voucher/receipt was not validated at the kiosk",
    }),
    narrative:
      "I registered my registration at the machine in the shop but I think I typed one letter wrong.",
    truth: {
      payment_made: "ATTEMPTED_FAILED",
      payment_method: "machine",
      vrm_entered: "KJ19KYM",
      keying_error: "I typed KJ19KYM instead of KJ19KYN — one letter out.",
      payment_evidence: "NO",
      anpr_images_on_notice: "ANPR",
      continuous_presence: "YES",
      visit_count: 1,
    },
  },
  {
    id: "wise-parking (ANPR / no permit)",
    confirmed: notice({
      operator_name: "Wise Parking Ltd",
      pcn_number: "AP539112",
      vrm: "LX71UNS",
      parking_location: "Queen Elizabeth Hospital - Car Park 1, London SE18 4QH",
      parking_event_date: "2026-09-08",
      notice_issue_date: "2026-09-14",
      entry_time: "09:07",
      exit_time: "16:28",
      total_recorded_duration: 441,
      charge_amount: 80,
      alleged_breach: "No Permit",
    }),
    narrative:
      "I was at the hospital all day for a day-case procedure. The payment machine in Car Park 1 was broken and there was no sign at the entrance about a permit.",
    truth: {
      permission_held: "I was a patient at a booked appointment; no permit is offered to patients.",
      permission_source: "other",
      signage_issue_basis: ["no_entrance_sign", "term_not_prominent"],
      anpr_images_on_notice: "ANPR",
      continuous_presence: "YES",
      visit_count: 1,
      timestamp_discrepancy: "NO",
    },
  },
];

const line = (s = "") => console.log(s);

/** Run the reasoning pipeline and report the seven things asked for. */
async function report(c: Case, label: string) {
  line(`\n${"─".repeat(72)}\n${label}  ::  ${c.id}\n${"─".repeat(72)}`);

  // 1. Extracted allegation
  const allegation = classifyAllegation(c.confirmed.alleged_breach);
  line(`1. EXTRACTED ALLEGATION`);
  line(`     alleged_breach : ${c.confirmed.alleged_breach ?? "(absent from notice)"}`);
  line(`     category       : ${allegation.category}`);
  line(`     routes opened  : ${allegation.routes.join(", ") || "(none)"}`);
  line(`     matched phrase : ${allegation.matched ?? "(none)"}`);

  // 2. Detected issue
  let answers: AnswerMap = { [PROFILE.SITUATION_OTHER]: c.narrative };
  const factsOf = (a: AnswerMap) =>
    deriveKnownFacts({ confirmed: c.confirmed, answers: a, evidenceTypes: [] });

  const initial = await evaluateIssues({ facts: factsOf(answers), evidenceTypes: [] });
  line(`2. DETECTED ISSUES (before questions)`);
  line(`     active  : ${initial.activeIssues.map((i) => i.code).join(", ") || "(none)"}`);
  line(`     missing : ${initial.missingFacts.map((m) => m.factKey).join(", ") || "(none)"}`);

  // 3 + 4. Questions asked, facts collected
  let resolution = await resolveFactGap({ facts: factsOf(answers), evidenceTypes: [] });
  const asked: string[] = [];
  let guard = 0;
  line(`3. QUESTIONS ASKED`);
  while (resolution.gap && guard++ < 20) {
    const gap = resolution.gap;
    asked.push(gap.factKey);
    const raw = c.truth[gap.factKey];
    const validated = await validateFactAnswer(gap.factKey, raw ?? null);
    line(
      `     Q${guard} ${gap.factKey} (${gap.issueCode})  ->  ${
        raw === undefined ? "declined" : JSON.stringify(validated.value)
      }`,
    );
    line(`         "${deterministicQuestion(gap).text}"`);
    answers = applyFactAnswer(answers, gap.factKey, validated.value ?? null);
    resolution = await resolveFactGap({ facts: factsOf(answers), evidenceTypes: [] });
  }
  if (asked.length === 0) line(`     (none — the customer is asked nothing)`);

  const { answers: draftingAnswers, answerProvenance } = resolveAnswersWithDefaults(
    c.confirmed,
    answers,
    [],
  );
  const facts = deriveKnownFacts({
    confirmed: c.confirmed,
    answers: draftingAnswers,
    evidenceTypes: [],
    answerProvenance,
  });
  const collected = [...facts.known]
    .filter((k) => !k.startsWith("__") && facts.provenance[k] === "answer")
    .sort();
  line(`4. FACTS COLLECTED FROM THE CUSTOMER (provenance=answer)`);
  line(`     ${collected.join(", ") || "(none)"}`);

  // 5. Retrieved knowledge
  const catalog = await loadKbCatalog();
  const analysis = await analyseCase({
    confirmed: c.confirmed,
    answers: draftingAnswers,
    evidenceTypes: [],
    evidenceRefs: [],
    pofaConfig: await loadPofaConfig(),
  });
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: c.confirmed.parking_event_date,
    evidenceTypes: [],
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });
  line(`5. RETRIEVED KNOWLEDGE (catalogue=${catalog.origin})`);
  line(`     modules : ${retrieval.modules.map((m) => m.moduleId).join(", ") || "(none)"}`);
  line(`     blocks  : ${retrieval.blocks.length}`);

  // 6. Final appeal ground
  line(`6. FINAL APPEAL GROUND`);
  line(`     primary   : ${analysis.primaryRoute ?? "(none)"}`);
  line(`     secondary : ${(analysis.secondaryRoutes ?? []).join(", ") || "(none)"}`);
  line(`     pofa      : ${analysis.pofa.timingStatus} daysLate=${analysis.pofa.daysLate}`);

  // 7. Case-specific or not
  const caseSpecific = retrieval.modules.filter(
    (m) => !["POFA", "GOVERNANCE"].includes(m.routeFamily),
  );
  line(`7. IS IT CASE-SPECIFIC?`);
  line(
    `     ${
      caseSpecific.length > 0
        ? `YES — ${caseSpecific.length} non-PoFA module(s): ${caseSpecific
            .map((m) => m.moduleId)
            .join(", ")}`
        : "NO — PoFA boilerplate only, nothing from this notice's own allegation"
    }`,
  );

  return { allegation, initial, asked, retrieval, analysis, caseSpecific };
}

describe("where the runtime skips issue detection", () => {
  /**
   * The failure the client is seeing.
   *
   * With the OpenAI spend limit reached, `getExtractionProvider` wraps the
   * vision provider in `ResilientExtractionProvider`, which on failure
   * falls back to `rulesExtractFromBytes` — a regex sweep over printable
   * bytes. A scanned notice has no text layer, so every field comes back
   * empty and the journey continues anyway.
   */
  it("the fallback extractor returns nothing from a scanned notice", () => {
    // A JPEG header followed by binary noise: a photographed notice.
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(600).fill(0x41)]);
    const asImage = rulesExtractFromBytes({
      name: "notice.jpg",
      mimeType: "image/jpeg",
      bytes: jpeg,
    });
    line("\n=== FALLBACK EXTRACTION OF A PHOTOGRAPHED NOTICE ===");
    line(`  providerId : ${asImage.providerId}`);
    line(`  fields     : ${JSON.stringify(asImage.raw)}`);
    line(`  warnings   : ${asImage.warnings.join(" | ") || "(none)"}`);

    expect(asImage.providerId).toBe("rules-ocr");
    expect(asImage.raw.alleged_breach).toBeUndefined();
    expect(asImage.warnings.length).toBeGreaterThan(0);

    /*
     * The same bytes presented as a PDF — how both client notices
     * arrived. The result is equally empty.
     *
     * It is NOT silent: `parsePcnText` warns that backup OCR found only
     * a few fields. The specific "image OCR needs a photo reader"
     * message at rulesOcr.ts:272 is skipped, because that branch needs
     * `image/*` AND a completely empty confidence map, and `case_stage`
     * / `notice_route` are always populated. So the customer is told
     * something generic rather than that the notice could not be read.
     *
     * The warning is the problem, not its absence: nothing downstream
     * gates on it. `alleged_breach` is empty, no issue opens, no
     * question is asked, and the letter is still generated.
     */
    const asPdf = rulesExtractFromBytes({
      name: "notice.pdf",
      mimeType: "application/pdf",
      bytes: jpeg,
    });
    line("\n=== THE SAME SCAN PRESENTED AS A PDF ===");
    line(`  fields   : ${JSON.stringify(asPdf.raw)}`);
    line(`  warnings : ${asPdf.warnings.join(" | ") || "(none)"}`);
    expect(asPdf.raw.alleged_breach).toBeUndefined();
    // Warned, but only about field count — never that the read failed.
    expect(asPdf.warnings.join(" ")).toMatch(/few fields/i);
    expect(asPdf.warnings.join(" ")).not.toMatch(/could not be read/i);
  }, 60_000);

  /**
   * What the customer gets when extraction produced nothing: the notice
   * fields are blank, so no allegation, so no issue but PoFA, whose
   * required facts are all covered by `fact_defaults` — hence no
   * questions and a boilerplate letter.
   */
  it("an empty extraction yields no allegation, no questions and a generic ground", async () => {
    const empty: Case = {
      id: "extraction produced nothing",
      confirmed: notice({ operator_name: "Unknown", alleged_breach: undefined }),
      narrative: "",
      truth: {},
    };
    const r = await report(empty, "EXTRACTION DEAD");

    expect(r.allegation.category).toBe("UNKNOWN");
    expect(r.asked).toHaveLength(0);
    expect(r.caseSpecific).toHaveLength(0);
  }, 60_000);

  /**
   * The same pipeline, with the notice fields present. This is the
   * control: if questions appear here, the reasoning layer is sound and
   * the defect is upstream in extraction.
   */
  it.each(CLIENT_CASES.map((c) => [c.id, c] as const))(
    "%s asks questions and reaches a case-specific ground once extraction works",
    async (_id, c) => {
      const r = await report(c, "EXTRACTION WORKING");
      expect(r.retrieval.modules.length).toBeGreaterThan(0);
    },
    60_000,
  );

  /**
   * The second flaw, isolated.
   *
   * PoFA and TRIAGE_SCOPE between them require registered_keeper,
   * driver_identified, jurisdiction and vehicle_hire_status — and all
   * four have rows in `fact_defaults`. The issue engine applies defaults
   * at issueEngine.ts:243 and then tests `factResolved` against the
   * DEFAULTED facts at :292, so a defaulted fact is never reported
   * missing and can never be asked.
   *
   * That is correct for avoiding a pointless question. It is wrong as a
   * silent substitute for a failed extraction: a case with no allegation
   * has nothing else to ask about, so the zero-question path looks
   * healthy from the outside.
   */
  it("a notice with no allegation asks nothing, because PoFA's facts are all defaulted", async () => {
    const bare = deriveKnownFacts({
      confirmed: notice({ parking_location: "Somewhere", alleged_breach: undefined }),
      answers: {},
      evidenceTypes: [],
    });
    const ev = await evaluateIssues({ facts: bare, evidenceTypes: [] });
    line("\n=== NOTICE WITH NO ALLEGATION ===");
    line(`  active issues : ${ev.activeIssues.map((i) => i.code).join(", ")}`);
    line(`  missing facts : ${ev.missingFacts.map((m) => m.factKey).join(", ") || "(none)"}`);
    line(`  nextFact      : ${ev.nextFact?.factKey ?? "(null — nothing to ask)"}`);

    expect(ev.missingFacts).toHaveLength(0);
    expect(ev.nextFact).toBeNull();
  }, 60_000);
});
