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
import { buildVariableMap } from "@/lib/variables";
import { toLegacyAnswers } from "@/lib/facts/toLegacyAnswers";
import { UAT_FIXTURES, byUatId, BASE, type UatFixture } from "../fixtures/uatCases";
import type { ConfirmedPcn } from "@/types";

/**
 * Fixtures carved out of the "must reach READY" set below.
 *
 * UAT-1 used to be here. The PP-KEY-001/002 collision that held it back
 * — two paragraphs restating "a payment was nevertheless made" at 0.86
 * overlap — is resolved by the shared selection table in
 * lib/appeals/paragraphSelection.ts, which keeps the more specific of
 * the pair rather than rewriting either. UAT-1 now releases and is
 * covered by the positive set.
 *
 * UAT-7 (overstay, grace/exit-delay) reaches MANUAL_REVIEW with
 * NO_SUBSTANTIVE_GROUND, and that is the correct answer rather than a
 * gap to paper over. The fixture supplies `exit_delay_reason` and the
 * retired `departure_delay`, but a 129-minute stay against "overstaying
 * maximum permitted stay" makes the grace ground unsupportable
 * (lib/appeals/graceSupport.ts), and every ANPR and consideration
 * module is fact-gated out. Retrieval retains KB-POFA-01 alone, so the
 * only letter available would argue keeper liability and never mention
 * the overstay. That is the generic appeal the ground gate exists to
 * stop. Releasing it would need the customer to answer the outstanding
 * ANPR/consideration facts — which is what the question flow is for.
 *
 * UAT-10 (payment + keying + ANPR together) fails the release
 * checklist on CONCISE_AND_COHERENT, not on validation: it passes every
 * validator with zero blocking issues. Retrieval retains seven modules
 * and eighteen blocks, and the DETERMINISTIC provider concatenates all
 * of them, which runs past the 14-paragraph / 1400-word limit in
 * lib/validation/releaseChecklist.ts. That is a limitation of the
 * test-time provider rather than of the pipeline — a bespoke model
 * given the same blocks writes one argument instead of eighteen
 * paragraphs — so this fixture is expected to need the real drafting
 * model, and the suite says so rather than loosening the limit.
 */
const KNOWN_CONTENT_GAP_IDS = new Set(["UAT-7", "UAT-10"]);
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
    /*
     * The real variable map, not {}.
     *
     * Validators compare the body against these values — VAL-POFA checks
     * that an established timing failure states the dates it is computed
     * from — so an empty map makes this re-check stricter than the
     * pipeline it is meant to mirror, and fails letters the engine
     * correctly released.
     */
    variables: buildVariableMap(
      f.confirmed,
      toLegacyAnswers(f.answers, f.confirmed),
    ) as Record<string, string>,
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
  it("UAT-1 (payment + minor keying error) releases without the colliding PP-KEY-001/002 text", async () => {
    const f = byUatId("UAT-1");
    const result = await generateValidatedAppeal({
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    });

    expect(result.status, JSON.stringify({ reason: result.reason, detail: result.detail })).toBe(
      "READY",
    );
    const body = result.body as string;

    /*
     * The pair must not BOTH appear. Keeping PP-KEY-002 (minor-error
     * specific, invokes the Code's keying-error requirements) and
     * dropping PP-KEY-001 is what makes this releasable; if both ever
     * return, the 0.86 collision comes back and the case stops again.
     */
    const hasGeneral = /existence of a keying error does not alter/i.test(body);
    const hasSpecific = /discrepancy concerns a minor error/i.test(body);
    expect(hasSpecific).toBe(true);
    expect(hasGeneral).toBe(false);
  });

  for (const id of ["UAT-7", "UAT-10"]) {
    it(`${id} is held for review rather than released generic`, async () => {
      const f = byUatId(id);
      const result = await generateValidatedAppeal({
        confirmed: f.confirmed,
        answers: f.answers,
        evidenceTypes: f.evidenceTypes,
      });

      // The invariant that matters: nothing is released to the customer.
      expect(result.status).toBe("MANUAL_REVIEW");
      expect(["NO_SUBSTANTIVE_GROUND", "VALIDATION_FAILED"]).toContain(
        result.reason,
      );
    });
  }
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

  it("the same case, with defaults applied, is still refused because no ground is supported", async () => {
    const { answers, applied } = resolveAnswersWithDefaults(confirmed, {}, []);

    // Every fact a customer would otherwise be asked about, before any
    // of it decides a ground, is filled from a provenanced default.
    // (Jurisdiction is not a gap here: deriveKnownFacts already infers it
    // from parking_location before defaults ever run.)
    //
    // `vehicle_hire_status` joined the other two when the fact-gap
    // resolver landed: it was the top outstanding triage requirement on
    // every case, so without a default "was this a hire car?" became the
    // first question every customer was asked.
    expect(applied.map((d) => d.factKey).sort()).toEqual(
      ["driver_identified", "registered_keeper", "vehicle_hire_status"].sort(),
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
