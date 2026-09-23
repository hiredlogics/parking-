/**
 * @vitest-environment node
 *
 * Golden-corpus regression alarm (plan: docs — "No-questions pipeline").
 *
 * The property that actually matters to the product is "different
 * notices produce materially different appeals" — not "the customer
 * was asked questions". This asserts that property directly, with no
 * journey involved, and doubles as the standing alarm for the failure
 * mode this whole redesign exists to fix: lib/retrieval/gates.ts keys
 * module eligibility on facts only a customer answer could establish,
 * so if those facts ever go missing (deleted questions, a broken
 * derivation pipeline, ...) every case silently collapses onto the
 * same one generic module (KB-POFA-01) and every letter looks the
 * same. This test must keep failing loudly if that ever happens again.
 *
 * Supersedes tests/unit/scenarioJourneys.test.ts's role as the
 * "different cases behave differently" guarantee, without depending on
 * the adaptive-question journey scenarioJourneys.test.ts exercises.
 */
import { describe, expect, it } from "vitest";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { UAT_FIXTURES, type UatFixture } from "../fixtures/uatCases";

interface Snapshot {
  id: string;
  primaryRoute: string | null;
  secondaryRoutes: string[];
  moduleIds: string[];
  prohibitedClaims: string[];
  pofaParagraph: string | null;
}

function snapshot(f: UatFixture): Snapshot {
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
  return {
    id: f.id,
    primaryRoute: analysis.primaryRoute,
    secondaryRoutes: [...analysis.secondaryRoutes].sort(),
    moduleIds: [...retrieval.modules.map((m) => m.moduleId)].sort(),
    prohibitedClaims: [...analysis.prohibitedClaims].sort(),
    pofaParagraph: analysis.pofa.paragraph,
  };
}

const KNOWN_CONTENT_GAP_IDS = new Set(["UAT-1"]);
const DISTINCTNESS_FIXTURES = UAT_FIXTURES.filter(
  (f) => !KNOWN_CONTENT_GAP_IDS.has(f.id),
);

/**
 * Fixtures whose OWN facts don't actually support their claimed ground
 * (UAT-7: a 129-minute recorded stay is too long to be an end-of-parking
 * grace case; UAT-11: a tenancy claim with no uploaded evidence) are
 * SUPPOSED to fall back to the generic module alone — that's the
 * fact-gate correctly refusing an unsupported claim, not the collapse
 * bug this file exists to catch. They're excluded from the
 * "must retrieve something beyond the generic fallback" and
 * "must be distinguishable from other fixtures" assertions, but still
 * count toward the corpus-wide collapse-rate ceiling below.
 */
const EXPECTED_GENERIC_FALLBACK_IDS = new Set(["UAT-7", "UAT-11"]);

describe("Golden corpus: retrieval never collapses distinct notices onto the same grounds", () => {
  const snapshots = DISTINCTNESS_FIXTURES.map(snapshot);
  const genuineFixtures = snapshots.filter(
    (s) => !EXPECTED_GENERIC_FALLBACK_IDS.has(s.id),
  );

  it("every fixture retrieves at least one eligible module", () => {
    for (const s of snapshots) {
      expect(s.moduleIds.length, s.id).toBeGreaterThan(0);
    }
  });

  it("no two fixtures with genuinely distinct, well-evidenced grounds retrieve an identical module set", () => {
    const seen = new Map<string, string>();
    for (const s of genuineFixtures) {
      const key = s.moduleIds.join(",");
      const clash = seen.get(key);
      expect(
        clash,
        `${s.id} and ${clash} retrieved the identical module set [${key}] — ` +
          `this is the KB-POFA-01 collapse the golden corpus exists to catch`,
      ).toBeUndefined();
      seen.set(key, s.id);
    }
  });

  it("fixtures with well-evidenced, specific grounds retrieve more than the generic fallback alone", () => {
    const collapsedToGenericOnly = genuineFixtures.filter(
      (s) => s.moduleIds.length === 1 && s.moduleIds[0] === "KB-POFA-01",
    );
    expect(
      collapsedToGenericOnly.map((s) => s.id),
      "a fixture with specific, well-evidenced facts collapsed to the generic keeper-liability module only",
    ).toEqual([]);
  });

  it("generic-only fallback stays the rare exception across the corpus, not the norm", () => {
    const collapsedToGenericOnly = snapshots.filter(
      (s) => s.moduleIds.length === 1 && s.moduleIds[0] === "KB-POFA-01",
    );
    // Regression alarm: if this ever creeps toward "most of the
    // corpus", the fact producers feeding retrieval have broken (the
    // exact failure mode of deleting adaptive questions with nothing
    // replacing the facts they used to establish).
    expect(collapsedToGenericOnly.length).toBeLessThanOrEqual(
      Math.floor(snapshots.length / 3),
    );
  });
});
