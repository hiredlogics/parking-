/**
 * @vitest-environment node
 *
 * Full-pipeline accuracy against the rules.
 *
 * Every other test that touches drafting either mocks
 * generateValidatedAppeal entirely (tests/integration/appealJourney.test.ts)
 * or stops at the retrieval layer (tests/unit/retrievalDeterminism.test.ts).
 * Neither proves that the text a customer actually receives is grounded
 * only in rule-eligible modules, is keeper-safe, and clears the same
 * validator suite the pipeline itself enforces.
 *
 * This drives the real, non-mocked
 *   analyseCase -> retrieveKnowledge -> draftAppeal (deterministic
 *   provider, pinned by tests/setup.ts) -> validateDraft
 * chain through generateValidatedAppeal, using the same eleven UAT
 * fixtures the retrieval-determinism suite uses, and inspects the
 * released output itself rather than internal call counts.
 */
import { describe, expect, it } from "vitest";
import { generateValidatedAppeal } from "@/lib/generation/engine";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { validateDraft } from "@/lib/validation/engine";
import { validateKeeperSafe } from "@/lib/keeperSafe";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { UAT_FIXTURES, byUatId, BASE, type UatFixture } from "../fixtures/uatCases";
import type { ConfirmedPcn } from "@/types";

/**
 * UAT-1 is carved out of the "must reach READY" set below. Building this
 * suite surfaced a real content defect (not an orchestration bug): the
 * approved Master Pack paragraphs PP-KEY-001 and PP-KEY-002
 * (paragraphs/library.ts) always co-fire for "payment made + a MINOR VRM
 * keying error" (rules/rules.ts's KEYING_ROUTE rules), and their second
 * sentences are near-identical restatements of the same point ("The
 * existence of a keying error does not alter the fact that a payment was
 * made..." vs "A payment was nevertheless made..."), which VAL-REPETITION
 * correctly flags as BLOCKING (0.86 word-overlap, over the 0.85
 * threshold) wherever this combination is assembled — by the rules
 * engine or the deterministic KB provider, since both draw on the same
 * underlying paragraph text.
 *
 * Before the fallback-safety fix in lib/generation/engine.ts (landed in
 * this same change), the post-loop rules-letter fallback shipped this
 * repeated text as a released "READY" appeal with no validation or
 * keeper-safety check at all. It now correctly routes to MANUAL_REVIEW
 * instead — progress, not a regression, since nothing non-compliant is
 * released — but this specific combination is not auto-releasable today.
 * Rewriting the paragraph text is a legal-content decision for whoever
 * owns the Master Pack, not something to do unilaterally here.
 */
const KNOWN_CONTENT_GAP_IDS = new Set(["UAT-1"]);
const POSITIVE_FIXTURES = UAT_FIXTURES.filter(
  (f) => f.id !== "UAT-11" && !KNOWN_CONTENT_GAP_IDS.has(f.id),
);

function independentEligibleModuleIds(f: UatFixture): Set<string> {
  const input = {
    confirmed: f.confirmed,
    answers: f.answers,
    evidenceTypes: f.evidenceTypes,
  };
  const analysis = analyseCase(input);
  const facts = factsForCase(input);
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: f.confirmed.parking_event_date ?? null,
    evidenceTypes: f.evidenceTypes,
  });
  return new Set(retrieval.modules.map((m) => m.moduleId));
}

/** Independently re-run the same validator suite against the released text. */
function recheck(f: UatFixture, body: string) {
  const input = {
    confirmed: f.confirmed,
    answers: f.answers,
    evidenceTypes: f.evidenceTypes,
  };
  const analysis = analyseCase(input);
  const facts = factsForCase(input);
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: f.confirmed.parking_event_date ?? null,
    evidenceTypes: f.evidenceTypes,
  });
  return validateDraft({
    body,
    analysis,
    modules: retrieval.modules,
    sources: retrieval.sources,
    facts,
    evidence: new Set(f.evidenceTypes),
    variables: {},
  });
}

describe("Full-pipeline accuracy: released appeals are rule-grounded", () => {
  for (const f of POSITIVE_FIXTURES) {
    it(`${f.id} produces a releasable, keeper-safe, rule-grounded appeal`, async () => {
      const result = await generateValidatedAppeal({
        confirmed: f.confirmed,
        answers: f.answers,
        evidenceTypes: f.evidenceTypes,
      });

      expect(result.status, JSON.stringify({ reason: result.reason, detail: result.detail })).toBe(
        "READY",
      );
      expect(result.body).toBeTruthy();

      const body = result.body as string;

      // No unresolved template placeholders leaked into the released text.
      expect(body).not.toMatch(/\{\{[^}]+\}\}/);

      // The released text — whichever provider produced it — must never
      // identify or imply who was driving.
      const keeperCheck = validateKeeperSafe(body);
      expect(keeperCheck.ok, JSON.stringify(keeperCheck.violations)).toBe(true);

      // The released text clears the SAME validator suite the pipeline
      // enforces, independently re-run against the final artefact rather
      // than trusted from the internal attempt log.
      const run = recheck(f, body);
      expect(
        run.blockingCount,
        JSON.stringify(run.issues.filter((i) => i.severity === "BLOCKING")),
      ).toBe(0);

      // Rule-grounding invariant, carried through to the final output:
      // every module the pipeline claims to have drawn on was
      // independently deemed eligible by retrieval for these exact facts.
      // Semantic similarity must never resurrect a rule-rejected module.
      const eligible = independentEligibleModuleIds(f);
      for (const id of result.moduleIds) {
        expect(eligible.has(id), `${f.id}: module ${id} was used but is not in the independently retrieved eligible set`).toBe(true);
      }
    });
  }

  it("every positive fixture actually reaches drafting (retrieval is not vacuously empty)", () => {
    for (const f of POSITIVE_FIXTURES) {
      expect(independentEligibleModuleIds(f).size, f.id).toBeGreaterThan(0);
    }
  });
});

describe("Full-pipeline accuracy: known content gaps stay safe, not silently released", () => {
  it("UAT-1 (payment + minor keying error) never ships the colliding PP-KEY-001/002 text unvalidated", async () => {
    const f = byUatId("UAT-1");
    const result = await generateValidatedAppeal({
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    });

    // The known content defect means this does not reach READY today.
    // The invariant that actually matters: it must never be released
    // without clearing validation — MANUAL_REVIEW, not a silent ship of
    // repetitive text, is the only acceptable outcome while the
    // paragraph collision is unresolved.
    expect(result.status).toBe("MANUAL_REVIEW");
    expect(result.reason).toBe("VALIDATION_FAILED");
  });
});

describe("Full-pipeline accuracy: the pipeline does not fabricate support", () => {
  /*
   * UAT-11 claims residential parking rights but uploads no tenancy
   * evidence (AGREEMENT_UPLOADED: "NO"). The residential-rights module
   * (KB-RES-01) requires that uploaded instrument, so retrieval correctly
   * excludes it — but the case may still legitimately proceed on a
   * generic, evidence-independent ground (the operator must prove
   * Schedule 4 keeper-liability compliance regardless of the alleged
   * breach). A blanket "must not be READY" expectation would be wrong:
   * the real invariant is narrower — the released text must never assert
   * the SPECIFIC unsupported claim.
   */
  it("UAT-11 (unsupported residential-rights claim, no evidence) never draws on the evidence-gated module", () => {
    const f = byUatId("UAT-11");
    const eligible = independentEligibleModuleIds(f);
    expect(eligible.has("KB-RES-01")).toBe(false);
  });

  it("UAT-11's released appeal (if any) never asserts the unsupported tenancy claim", async () => {
    const f = byUatId("UAT-11");
    const result = await generateValidatedAppeal({
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    });

    expect(result.moduleIds).not.toContain("KB-RES-01");

    if (result.status === "READY" && result.body) {
      // Word-bounded: "lease" alone would also match inside "please".
      expect(result.body.toLowerCase()).not.toMatch(/\btenanc\w*|\blease\b|\bresidential parking right/);
    }
  });
});

describe("Full-pipeline accuracy: no-questions fast path (customer skips adaptive questions)", () => {
  /*
   * Product decision: a customer can go straight from upload/confirmation
   * to a generated appeal with zero adaptive answers. Without any
   * defaulting, that has no route to argue at all — this proves the
   * fast path only works BECAUSE resolveAnswersWithDefaults fills the
   * same two facts the question engine would otherwise have asked
   * about, and that the result is the generic, evidence-independent
   * PoFA/Schedule-4 ground rather than anything scenario-specific.
   */
  const confirmed = {
    ...BASE,
    alleged_breach: "Overstaying maximum permitted stay",
  } as ConfirmedPcn;

  it("zero adaptive answers, no defaults applied, cannot be drafted at all", async () => {
    const result = await generateValidatedAppeal({
      confirmed,
      answers: {},
      evidenceTypes: [],
    });
    expect(result.status).toBe("MANUAL_REVIEW");
  });

  it("the same case, with resolveAnswersWithDefaults applied, reaches READY on generic grounds only", async () => {
    const { answers, applied } = resolveAnswersWithDefaults(confirmed, {}, []);

    // Both facts the question engine would have asked about are filled.
    // (Jurisdiction is not a gap here: deriveKnownFacts already infers it
    // from parking_location before defaults ever run.)
    expect(applied.map((d) => d.factKey).sort()).toEqual(
      ["driver_identified", "registered_keeper"].sort(),
    );

    const result = await generateValidatedAppeal({ confirmed, answers, evidenceTypes: [] });

    expect(result.status, JSON.stringify({ reason: result.reason, detail: result.detail })).toBe(
      "READY",
    );
    const body = result.body as string;
    expect(body).toBeTruthy();
    expect(validateKeeperSafe(body).ok).toBe(true);

    // No scenario-specific fact was ever supplied, so only the generic,
    // evidence-independent keeper-liability ground may have been used.
    expect(result.moduleIds).toEqual(["KB-POFA-01"]);
  });

  it("never overwrites a real answer with a default", () => {
    const { answers, applied } = resolveAnswersWithDefaults(
      confirmed,
      { registered_keeper: "NO" },
      [],
    );
    expect(answers.registered_keeper).toBe("NO");
    expect(applied.some((d) => d.factKey === "registered_keeper")).toBe(false);
  });
});
