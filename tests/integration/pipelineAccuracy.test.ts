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
import { UAT_FIXTURES, byUatId, type UatFixture } from "../fixtures/uatCases";

const POSITIVE_FIXTURES = UAT_FIXTURES.filter((f) => f.id !== "UAT-11");

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
      expect(result.body.toLowerCase()).not.toMatch(/tenanc|lease|residential parking right/);
    }
  });
});
