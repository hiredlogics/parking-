/**
 * @vitest-environment node
 *
 * The go/no-go gate for deleting the question engine.
 *
 * Every customer answer is thrown away here. Each case is built from
 * only what the pipeline will still have once questions are gone:
 *
 *   the confirmed notice
 *   + the evidence categories the customer uploaded under
 *   + what reading those documents established
 *
 * If the corpus collapses onto one set of grounds under those
 * conditions, deleting the questions would ship the identical-letter
 * bug permanently, and this test is the thing that says so.
 *
 * It is deliberately not a snapshot. The question is not "do the same
 * modules come back" — they will not, and should not. The question is
 * whether distinct notices still produce materially distinct grounds
 * with no answers at all.
 */
import { describe, expect, it } from "vitest";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { admitDocumentFacts } from "@/lib/facts/fromDocuments";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { FACT } from "@/lib/facts/facts";
import { MockEvidenceUnderstandingProvider } from "@/services/evidence/mockProvider";
import { UAT_FIXTURES, type UatFixture } from "../fixtures/uatCases";
import type { AnswerMap } from "@/lib/facts/types";

const provider = new MockEvidenceUnderstandingProvider();

/**
 * Rebuild a fixture with no answers: notice + uploads + document reads.
 */
async function withoutAnswers(f: UatFixture) {
  const candidates = [];
  for (const evidenceType of f.evidenceTypes) {
    const reading = await provider.derive({
      name: `${evidenceType}.pdf`,
      mimeType: "application/pdf",
      bytes: new Uint8Array(),
      evidenceType,
    });
    candidates.push({ evidenceType, facts: reading.facts });
  }

  const documentFacts = admitDocumentFacts({
    candidates,
    alreadyEstablished: {},
  });

  let answers: AnswerMap = { ...documentFacts.answers };
  if (documentFacts.tags.length > 0) {
    answers[FACT.SCENARIOS] = [...documentFacts.tags].sort();
  }
  // The same safe defaults the live no-questions path applies.
  const resolved = resolveAnswersWithDefaults(
    f.confirmed,
    answers,
    f.evidenceTypes,
  );
  answers = resolved.answers;

  const input = {
    confirmed: f.confirmed,
    answers,
    evidenceTypes: f.evidenceTypes,
    answerProvenance: {
      ...documentFacts.provenance,
      ...resolved.answerProvenance,
    },
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
    hasEvidence: f.evidenceTypes.length > 0,
    primaryRoute: analysis.primaryRoute,
    moduleIds: retrieval.modules.map((m) => m.moduleId).sort(),
    admittedFactKeys: documentFacts.admitted.map((a) => a.factKey),
  };
}

describe("no-questions pipeline: the corpus with every answer removed", () => {
  it("retrieves grounds for every case, with no customer answers at all", async () => {
    for (const f of UAT_FIXTURES) {
      const s = await withoutAnswers(f);
      expect(s.moduleIds.length, `${s.id} retrieved nothing`).toBeGreaterThan(0);
    }
  });

  it("does not collapse every case onto the generic module", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const genericOnly = snaps.filter(
      (s) => s.moduleIds.length === 1 && s.moduleIds[0] === "KB-POFA-01",
    );
    /*
     * A case with no uploaded evidence and no answers genuinely has
     * nothing to argue beyond the keeper-liability position, so some
     * generic-only results are correct rather than a failure. What must
     * not happen is the whole corpus landing there.
     */
    expect(genericOnly.length).toBeLessThan(snaps.length);
    expect(
      genericOnly.every((s) => !s.hasEvidence),
      `cases with evidence collapsed to generic: ${genericOnly
        .filter((s) => s.hasEvidence)
        .map((s) => s.id)
        .join(", ")}`,
    ).toBe(true);
  });

  it("gives a case with uploaded evidence more than the generic fallback", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const withEvidence = snaps.filter((s) => s.hasEvidence);
    expect(withEvidence.length).toBeGreaterThan(0);
    for (const s of withEvidence) {
      expect(s.moduleIds.length, `${s.id}: ${s.moduleIds.join(",")}`).toBeGreaterThan(1);
      expect(s.admittedFactKeys.length, `${s.id} read no facts`).toBeGreaterThan(0);
    }
  });

  it("still tells materially different notices apart", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const distinct = new Set(snaps.map((s) => s.moduleIds.join("|")));
    /*
     * Cases that differ only in facts a question used to establish will
     * legitimately coincide now. The corpus must still resolve into
     * several distinct outcomes rather than one.
     */
    expect(distinct.size).toBeGreaterThan(1);
  });
});
