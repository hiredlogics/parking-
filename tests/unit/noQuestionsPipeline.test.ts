/**
 * @vitest-environment node
 *
 * Grounds available from notice + uploads + document reads alone —
 * without the adaptive question bank, and without inventing a weak
 * keeper-only PoFA letter from defaults.
 *
 * Fact-gap questions (allegation → issues → missing facts) are the
 * path for conduct grounds. This suite checks that:
 *
 *   - we do not collapse every thin case onto KB-POFA-01
 *   - document evidence can still open real grounds
 *   - distinct notices remain distinguishable when they have substance
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
    pofaFailed: analysis.pofa.timingStatus === "FAILED",
    moduleIds: retrieval.modules.map((m) => m.moduleId).sort(),
    admittedFactKeys: documentFacts.admitted.map((a) => a.factKey),
  };
}

describe("notice + evidence pipeline without adaptive answers", () => {
  it("does not invent weak keeper-only PoFA from defaults alone", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const genericOnly = snaps.filter(
      (s) => s.moduleIds.length === 1 && s.moduleIds[0] === "KB-POFA-01",
    );
    expect(genericOnly).toEqual([]);
  });

  it("still retrieves grounds when PoFA timing is established or evidence admits facts", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const withSubstance = snaps.filter(
      (s) => s.pofaFailed || s.admittedFactKeys.length > 0,
    );
    expect(withSubstance.length).toBeGreaterThan(0);
    for (const s of withSubstance) {
      expect(
        s.moduleIds.length,
        `${s.id} had substance but retrieved nothing`,
      ).toBeGreaterThan(0);
    }
  });

  it("gives a case with uploaded evidence admitted facts a real route when possible", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const withAdmitted = snaps.filter((s) => s.admittedFactKeys.length > 0);
    expect(withAdmitted.length).toBeGreaterThan(0);
    for (const s of withAdmitted) {
      expect(
        s.moduleIds.length,
        `${s.id}: ${s.moduleIds.join(",")}`,
      ).toBeGreaterThan(0);
    }
  });

  it("still tells materially different notices apart when they have substance", async () => {
    const snaps = await Promise.all(UAT_FIXTURES.map(withoutAnswers));
    const withModules = snaps.filter((s) => s.moduleIds.length > 0);
    const distinct = new Set(withModules.map((s) => s.moduleIds.join("|")));
    expect(distinct.size).toBeGreaterThan(1);
  });
});
