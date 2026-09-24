// @vitest-environment node
import { afterAll, beforeAll, describe, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT } from "@/lib/facts/facts";
import { buildRulesBasedLetter } from "@/lib/appeals/rulesLetter";
import { toLegacyAnswers } from "@/lib/facts/toLegacyAnswers";
import { analyseCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";

/* Scoped, not assigned at module level — see realNoticeTrace.test.ts. */
const priorEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of ["KB_USE_DATABASE", "GROUNDS_PROVIDER", "DRAFTING_PROVIDER"]) {
    priorEnv[k] = process.env[k];
  }
  process.env.KB_USE_DATABASE = "1";
});
afterAll(() => {
  for (const [k, v] of Object.entries(priorEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/**
 * Why the rules-letter fallback drops the winning ground.
 *
 * The generation engine computes the PoFA timing failure deterministically
 * and retrieval authorises PP-POFA-003 for it. When the drafting provider's
 * output fails validation the engine falls back to `buildRulesBasedLetter`,
 * which runs a SECOND, independent rule engine over `toLegacyAnswers(...)`.
 * That bridge never receives the analysis, so the flag the timing rule keys
 * on cannot be set, and the ground disappears from the released letter.
 *
 * This probe prints both sides so the discrepancy is visible rather than
 * argued about.
 */
const confirmed: ConfirmedPcn = {
  uk_jurisdiction: "ENGLAND_WALES",
  notice_route: "POSTAL",
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: "2026-09-24T00:00:00.000Z",
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
} as ConfirmedPcn;

describe("rules-letter fallback vs deterministic analysis", () => {
  it("prints what each path concluded about the late notice", async () => {
    const base = {
      situation_other:
        "I went to B&M after work and queued a long time at the till. I never received anything until three weeks later.",
    };
    const { answers } = resolveAnswersWithDefaults(confirmed, base, []);

    const analysis = await analyseCase({
      confirmed,
      answers,
      evidenceTypes: [],
      evidenceRefs: [],
      pofaConfig: await loadPofaConfig(),
    });

    console.log("\n--- WHAT THE ANALYSIS ENGINE CONCLUDED (from the notice dates) ---");
    console.log(`  pofa.timingStatus : ${analysis.pofa.timingStatus}`);
    console.log(`  pofa.daysLate     : ${analysis.pofa.daysLate}`);
    console.log(`  pofa.deadline     : ${analysis.pofa.deadline}`);
    console.log(`  primaryRoute      : ${analysis.primaryRoute}`);

    const legacy = toLegacyAnswers(answers, confirmed);
    console.log("\n--- WHAT THE RULES LETTER'S LEGACY BRIDGE CARRIES ---");
    console.log(`  branch.keeper     : ${JSON.stringify(legacy.branch.keeper ?? null)}`);
    console.log(`  core.scenarios    : ${JSON.stringify(legacy.core.scenarios)}`);
    console.log(
      `  pofa_postal_timing_failure : ${
        legacy.branch.keeper?.pofa_postal_timing_failure ?? "(never set)"
      }`,
    );

    const letter = await buildRulesBasedLetter({
      confirmed,
      answers,
      evidenceTypes: [],
    });
    console.log("\n--- WHAT THE RULES LETTER SELECTED ---");
    console.log(`  activeRoutes      : ${letter.activeRoutes.join(", ")}`);
    console.log(`  matchedParagraphs : ${letter.matchedParagraphIds.join(", ")}`);
    console.log(`  paragraphs in body: ${letter.paragraphs.map((p) => p.id).join(", ")}`);
    console.log(`  keeperSafe        : ${letter.keeperSafe}`);
    console.log(`  warnings          : ${letter.warnings.join(" | ") || "(none)"}`);

    const argued = letter.paragraphs.some((p) => p.id === "PP-POFA-003");
    console.log(
      `\n  >> Does the released letter argue the late Notice to Keeper? ${
        argued ? "YES" : "NO"
      }`,
    );
  }, 60_000);

  /**
   * What a paying customer gets under the CURRENT production config.
   *
   * `.env.local` sets GROUNDS_PROVIDER=llm, so the grounds judge runs for
   * real. This deliberately does NOT unset the API key: it exercises the
   * configured path, whatever that path currently does.
   */
  it("runs the configured production path and reports the outcome", async () => {
    process.env.GROUNDS_PROVIDER = "llm";
    delete process.env.DRAFTING_PROVIDER;
    const { generateValidatedAppeal } = await import("@/lib/generation/engine");

    const { answers, answerProvenance } = resolveAnswersWithDefaults(
      confirmed,
      {
        situation_other:
          "I went to B&M after work and queued a long time at the till. I never received anything until three weeks later.",
        [FACT.REGISTERED_KEEPER]: "YES",
        [FACT.DRIVER_IDENTIFIED]: "NO",
      },
      [],
    );

    const r = await generateValidatedAppeal({
      confirmed,
      answers,
      evidenceTypes: [],
      evidenceRefs: [],
      answerProvenance,
    });

    console.log("\n--- PRODUCTION CONFIG (GROUNDS_PROVIDER=llm, live key) ---");
    console.log(`  status   : ${r.status}`);
    console.log(`  reason   : ${r.reason ?? "-"}`);
    console.log(`  detail   : ${r.detail ?? "-"}`);
    console.log(`  provider : ${r.provider?.providerId ?? "none"}`);
    console.log(`  modules  : ${r.moduleIds.join(", ") || "(none)"}`);
    console.log(`  warnings : ${r.warnings.join(" | ") || "(none)"}`);
    console.log(`  body     : ${r.body ? `${r.body.length} chars` : "(none released)"}`);
  }, 120_000);
});
