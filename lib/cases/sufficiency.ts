import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { KbCatalogError, loadKbCatalog } from "@/lib/kb/catalog";
import { deriveKnownFacts } from "@/lib/facts/facts";
import { askedFactKey } from "@/lib/facts/missing";
import { ASKED_PREFIX, resolveFactGap } from "@/lib/facts/gapResolver";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { detectOutOfScope, isHardOutOfScope } from "@/lib/facts/scope";
import { resolveSuitability } from "@/lib/cases/caseIntelligence";
import { SERVICE_NOT_SUITABLE_DETAIL } from "@/lib/cases/documentUnderstanding";
import { routeLabels } from "./labels";
import { listArchivedQuestions } from "./questionHistory";
import type { AppealCase, SufficiencyStatus } from "./types";
import type { RouteFamily } from "@/types/caseState";

/**
 * Sufficient-information check.
 *
 * Target flow: "System determines whether enough material information
 * exists -> READY_FOR_PAYMENT".
 *
 * WHY ANALYSIS RUNS HERE, BEFORE THE PAYMENT GATE
 * -----------------------------------------------
 * The target flow lists issue analysis after payment. This check does
 * run the analysis, and that is deliberate and safe:
 *
 *   - It is entirely deterministic. No AI call, no cost.
 *   - It produces NO appeal wording. Only route families, which are
 *     converted to plain-language labels before leaving the server.
 *   - It is the only honest way to answer "do we have enough to prepare
 *     an appeal?", and it supplies the ground labels the pre-payment
 *     summary is required to show.
 *
 * Everything that costs money or produces the letter — retrieval
 * context, drafting, validation, PDF — stays behind the gate. Retrieval
 * is invoked here only to discover which modules were dropped for want
 * of evidence, so we can suggest useful uploads; the retrieved content
 * itself is discarded.
 */

export interface EvidenceSuggestion {
  /** Human-readable, taken from the module's evidence_needed list. */
  label: string;
}

export interface SufficiencyResult {
  sufficient: boolean;
  status: SufficiencyStatus;
  /** Customer-safe reasons the case is not yet ready. */
  blockers: string[];
  /** Plain-language grounds. Never route identifiers. */
  groundLabels: string[];
  outstandingCount: number;
  evidence: {
    uploadedCount: number;
    /** Evidence that would strengthen an identified ground. */
    suggestions: EvidenceSuggestion[];
  };
  outOfScope: { detail: string } | null;
  /**
   * Internal only — persisted against the case, never returned to the
   * customer.
   */
  internal: {
    candidateRoutes: RouteFamily[];
    primaryRoute: RouteFamily | null;
    secondaryRoutes: RouteFamily[];
    missingFacts: string[];
    codeVersionId: string | null;
    pofaRoute: string;
    driverStatus: "UNIDENTIFIED" | "FORMALLY_IDENTIFIED";
    moduleCount: number;
  };
}

const NOT_READY_INTERNAL: SufficiencyResult["internal"] = {
  candidateRoutes: [],
  primaryRoute: null,
  secondaryRoutes: [],
  missingFacts: [],
  codeVersionId: null,
  pofaRoute: "UNRESOLVED",
  driverStatus: "UNIDENTIFIED",
  moduleCount: 0,
};

/**
 * Facts already put to the customer, from the question archive.
 *
 * Best-effort: readiness must not fail because a historical audit table
 * could not be read. An empty result means nothing is marked as asked,
 * which is the strict reading — it can only make a case look LESS ready,
 * never more, so a failure here cannot let an unready appeal through.
 */
async function askedFactsFromArchive(
  appealCase: AppealCase,
): Promise<string[]> {
  // Nothing has been asked on a case that never reached questioning, so
  // skip the query on the overwhelmingly common path.
  if (appealCase.status === "DRAFT" || appealCase.status === "EXTRACTING") {
    return [];
  }
  try {
    const rows = await listArchivedQuestions(appealCase.id);
    return rows.map((r) => r.targetFact);
  } catch {
    return [];
  }
}

export async function assessSufficiency(
  appealCase: AppealCase,
  evidenceTypes: string[],
): Promise<SufficiencyResult> {
  const blockers: string[] = [];

  // ---- Preconditions that need no analysis ----
  if (!appealCase.extraction) {
    blockers.push("Upload your parking notice so we can read the details.");
  }
  if (!appealCase.confirmed) {
    blockers.push("Confirm the details we read from your notice.");
    return {
      sufficient: false,
      status: "INCOMPLETE",
      blockers,
      groundLabels: [],
      outstandingCount: 0,
      evidence: { uploadedCount: evidenceTypes.length, suggestions: [] },
      outOfScope: null,
      internal: NOT_READY_INTERNAL,
    };
  }

  const analysisInput = {
    confirmed: appealCase.confirmed,
    answers: appealCase.adaptiveAnswers,
    evidenceTypes,
    pofaConfig: await loadPofaConfig(),
  };

  // ---- Are there material facts still outstanding? ----
  // Derived from the route requirement map, not from a fixed question
  // list, so a case is complete exactly when its own routes are served.
  const facts = deriveKnownFacts(analysisInput);

  /*
   * Mark the facts this case was already asked for.
   *
   * A requirement that was put to the customer and left unanswered must
   * not block readiness forever — they were asked and declined, and
   * asking again is not an option on a case whose journey has finished.
   *
   * This used to read `appealCase.askedQuestionIds`, a column the
   * question engine maintained by copying `case_questions.target_fact`.
   * The engine is gone, so the denormalised copy has no writer; the
   * archive it duplicated is still there, and is read here instead.
   *
   * For any case created since the questions were removed this is empty,
   * which is correct: nothing was asked. It exists for the cases that
   * were mid-journey, or already appealed, when the change landed.
   */
  for (const f of await askedFactsFromArchive(appealCase)) {
    facts.values[askedFactKey(f)] = true;
  }

  const scope = detectOutOfScope(facts);
  const triage = appealCase.extraction?.triage;
  // Case Intelligence is the suitability authority; scope detection
  // still contributes because it reads answers the document cannot.
  const suitability = resolveSuitability({
    caseIntelligence: appealCase.caseIntelligence,
    serviceDecision: appealCase.serviceDecision,
    triageServiceDecision: triage?.serviceDecision ?? null,
    triageDetail: triage?.detail ?? null,
    outOfScopeDetail: appealCase.outOfScopeDetail,
  });
  const notSupported =
    suitability.decision === "NOT_SUPPORTED" ||
    (scope && isHardOutOfScope(scope));
  if (notSupported) {
    const detail =
      suitability.detail ??
      appealCase.outOfScopeDetail ??
      scope?.detail ??
      SERVICE_NOT_SUITABLE_DETAIL;
    return {
      sufficient: false,
      status: "INCOMPLETE",
      blockers: [detail],
      groundLabels: [],
      outstandingCount: 0,
      evidence: { uploadedCount: evidenceTypes.length, suggestions: [] },
      outOfScope: { detail },
      internal: {
        ...NOT_READY_INTERNAL,
        missingFacts: [
          appealCase.outOfScopeReason ??
            triage?.reasonCode ??
            scope?.reason ??
            "SERVICE_NOT_SUPPORTED",
        ],
      },
    };
  }
  if (scope) {
    /*
     * Soft scope gates (e.g. Scotland) must not dump the customer.
     * They can still finish evidence → review → pay. Generation then
     * goes to admin approval rather than auto-releasing a PDF.
     */
    return {
      sufficient: true,
      status: "SUFFICIENT",
      blockers: [],
      groundLabels: [
        "Your case will be prepared and checked by our team after payment",
      ],
      outstandingCount: 0,
      evidence: { uploadedCount: evidenceTypes.length, suggestions: [] },
      outOfScope: null,
      internal: {
        ...NOT_READY_INTERNAL,
        missingFacts: [scope.reason],
      },
    };
  }

  /*
   * ---- Are there material facts still worth asking for? ----
   *
   * This gate used to read `missingRequirements(facts, openRoutes(facts))`
   * — the hard-coded route requirement map. Two things were wrong with
   * that. It answered "is the fixed list satisfied?" rather than "do the
   * issues this case actually raises have what they need?", so an admin
   * adding a required fact could not affect readiness and a fact no
   * issue needed could still block payment. And it blocked with "Answer
   * the remaining questions about what happened" while pointing at a
   * page that no longer existed, which was a dead end.
   *
   * The gap resolver answers the real question, from admin config, and
   * terminates: it drops facts already put to the customer, facts no
   * customer can supply, and anything past the question budget. So
   * `complete` here means "there is nothing left worth asking", not
   * "every configured fact is known" — a case may legitimately proceed
   * with gaps, drafting on fewer grounds.
   *
   * Defaults are applied first for the same reason generation applies
   * them (lib/generation/caseGeneration.ts): a fact the default rules
   * will supply is not outstanding, and evaluating without them reports
   * gaps that the real pipeline never sees.
   */
  const { answers: answersWithDefaults } = resolveAnswersWithDefaults(
    appealCase.confirmed,
    appealCase.adaptiveAnswers,
    evidenceTypes,
  );
  const resolvedFacts = deriveKnownFacts({
    ...analysisInput,
    answers: answersWithDefaults,
  });
  /*
   * Carry the archive's asked markers across. They are not answers, so
   * `deriveKnownFacts` above does not reproduce them, and losing them
   * would re-open questions this customer already declined.
   *
   * The defaults are resolved into a second facts object rather than the
   * one above because `detectOutOfScope` has already read that one, and
   * a system default must not be able to change a scope decision.
   */
  for (const key of Object.keys(facts.values)) {
    if (key.startsWith(ASKED_PREFIX)) resolvedFacts.values[key] = true;
  }

  const gapState = await resolveFactGap({
    facts: resolvedFacts,
    serviceCode: appealCase.serviceType,
    evidenceTypes,
  });

  /*
   * Block only while a question will actually be put to the customer.
   *
   * The test is `gap`, not `outstanding`. Outstanding ignores the
   * question budget, so a case raising three issues at once — thirteen
   * required facts against a budget of four — would block forever on
   * facts nobody was ever going to ask. `gap` is null the moment the
   * budget is spent or everything askable has been put, which makes the
   * gate self-limiting: it can only ever hold a case back for as long
   * as there is something to do about it.
   *
   * Optional facts strengthen an appeal but never hold up payment.
   * `questioningComplete` still short-circuits the admin and manual
   * paths.
   */
  const blockingGap = gapState.gap && !gapState.gap.optional;
  if (blockingGap && !appealCase.questioningComplete) {
    blockers.push(
      "Tell us a little more about what happened so we can finish your appeal.",
    );
    return {
      sufficient: false,
      status: "INCOMPLETE",
      blockers,
      groundLabels: [],
      outstandingCount: gapState.outstanding.length,
      evidence: { uploadedCount: evidenceTypes.length, suggestions: [] },
      outOfScope: null,
      internal: NOT_READY_INTERNAL,
    };
  }

  // ---- Deterministic analysis (no AI, no wording) ----
  // Reached only once questioning is complete, so a manual-review
  // outcome here is a genuine scope or support problem.
  const analysis = analyseCase(analysisInput);

  if (analysis.manualReview) {
    /*
     * Same as scope gates: do not block checkout. Admin approval is the
     * release gate after payment.
     */
    return {
      sufficient: true,
      status: "SUFFICIENT",
      blockers: [],
      groundLabels: [
        "Your case will be prepared and checked by our team after payment",
      ],
      outstandingCount: 0,
      evidence: { uploadedCount: evidenceTypes.length, suggestions: [] },
      outOfScope: null,
      internal: {
        ...NOT_READY_INTERNAL,
        missingFacts: analysis.missingFacts,
      },
    };
  }

  // ---- Is any ground actually supported? ----
  let catalog;
  try {
    catalog = await loadKbCatalog();
  } catch (err) {
    if (err instanceof KbCatalogError) {
      // Still allow checkout — admin reviews after payment.
      return {
        sufficient: true,
        status: "SUFFICIENT",
        blockers: [],
        groundLabels: [
          "Your case will be prepared and checked by our team after payment",
        ],
        outstandingCount: 0,
        evidence: { uploadedCount: evidenceTypes.length, suggestions: [] },
        outOfScope: null,
        internal: NOT_READY_INTERNAL,
      };
    }
    throw err;
  }

  const retrieval = retrieveKnowledge({
    analysis,
    facts: factsForCase(analysisInput),
    parkingEventDate: appealCase.confirmed.parking_event_date ?? null,
    evidenceTypes,
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });

  // No supportable modules yet → still allow pay; admin release gate.
  if (retrieval.modules.length === 0) {
    return {
      sufficient: true,
      status: "SUFFICIENT",
      blockers: [],
      groundLabels: [
        "Your case will be prepared and checked by our team after payment",
      ],
      outstandingCount: analysis.missingFacts.length,
      evidence: {
        uploadedCount: evidenceTypes.length,
        suggestions: collectEvidenceSuggestions(retrieval),
      },
      outOfScope: null,
      internal: {
        candidateRoutes: [
          ...(analysis.primaryRoute ? [analysis.primaryRoute] : []),
          ...analysis.secondaryRoutes,
        ],
        primaryRoute: analysis.primaryRoute,
        secondaryRoutes: analysis.secondaryRoutes,
        missingFacts: analysis.missingFacts,
        codeVersionId: analysis.codeVersionId,
        pofaRoute: analysis.pofa.route,
        driverStatus: analysis.driverStatus,
        moduleCount: 0,
      },
    };
  }

  // Evidence that would unlock a module we had to set aside.
  const suggestions = collectEvidenceSuggestions(retrieval);

  return {
    sufficient: true,
    status: "SUFFICIENT",
    blockers: [],
    groundLabels: routeLabels([
      ...(analysis.primaryRoute ? [analysis.primaryRoute] : []),
      ...analysis.secondaryRoutes,
    ]),
    outstandingCount: analysis.missingFacts.length,
    evidence: {
      uploadedCount: evidenceTypes.length,
      suggestions,
    },
    outOfScope: null,
    internal: {
      candidateRoutes: [
        ...(analysis.primaryRoute ? [analysis.primaryRoute] : []),
        ...analysis.secondaryRoutes,
      ],
      primaryRoute: analysis.primaryRoute,
      secondaryRoutes: analysis.secondaryRoutes,
      missingFacts: analysis.missingFacts,
      codeVersionId: analysis.codeVersionId,
      pofaRoute: analysis.pofa.route,
      driverStatus: analysis.driverStatus,
      moduleCount: retrieval.modules.length,
    },
  };
}

/**
 * Turn "module dropped for missing evidence" trace entries into
 * customer-readable suggestions.
 *
 * The KB's `evidence_needed` values are already plain prose, so they can
 * be shown directly — no module identifier is exposed.
 */
function collectEvidenceSuggestions(
  retrieval: ReturnType<typeof retrieveKnowledge>,
): EvidenceSuggestion[] {
  const droppedForEvidence = new Set(
    retrieval.trace
      .filter(
        (t) =>
          !t.eligible &&
          t.reason.toLowerCase().includes("requires supporting evidence"),
      )
      .map((t) => t.moduleId),
  );
  if (droppedForEvidence.size === 0) return [];

  const labels = new Set<string>();
  for (const moduleId of droppedForEvidence) {
    const needed = EVIDENCE_HINTS[moduleId];
    if (!needed) continue;
    for (const label of needed) labels.add(label);
  }
  return [...labels].slice(0, 6).map((label) => ({ label }));
}

/**
 * Plain-language evidence hints for the modules that require evidence.
 * Mirrors EVIDENCE_ESSENTIAL in the retrieval layer, expressed for a
 * customer rather than for the engine.
 */
const EVIDENCE_HINTS: Record<string, string[]> = {
  "KB-BREAK-01": [
    "A recovery or breakdown attendance report",
    "A garage or repair invoice",
  ],
  "KB-BREAK-03": ["A recovery attendance report", "Call logs or messages"],
  "KB-RES-01": ["Your lease, tenancy agreement or parking grant"],
  "KB-RES-02": ["Your lease, tenancy agreement or parking grant"],
  "KB-RES-03": ["Your lease or plan identifying the parking space"],
  "KB-RES-04": ["Your lease, tenancy agreement or parking grant"],
  "KB-RES-06": ["Your lease, tenancy agreement or parking grant"],
  "KB-EV-01": [
    "Independent evidence of where the vehicle was, such as a receipt or dashcam footage",
  ],
};
