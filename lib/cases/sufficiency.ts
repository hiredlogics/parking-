import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { KbCatalogError, loadKbCatalog } from "@/lib/kb/catalog";
import { deriveKnownFacts } from "@/lib/questions/facts";
import { missingRequirements, askedFactKey } from "@/lib/questions/missing";
import { openRoutes } from "@/lib/questions/requirements";
import { detectOutOfScope, isHardOutOfScope } from "@/lib/questions/scope";
import { routeLabels } from "./labels";
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
  };

  // ---- Are there material facts still outstanding? ----
  // Derived from the route requirement map, not from a fixed question
  // list, so a case is complete exactly when its own routes are served.
  const facts = deriveKnownFacts(analysisInput);
  for (const f of appealCase.askedQuestionIds) {
    facts.values[askedFactKey(f)] = true;
  }

  const scope = detectOutOfScope(facts);
  const triage = appealCase.extraction?.triage;
  if (
    triage?.serviceDecision === "WRONG_STAGE_REDIRECT" ||
    (scope && isHardOutOfScope(scope))
  ) {
    const detail =
      triage?.serviceDecision === "WRONG_STAGE_REDIRECT"
        ? triage.detail
        : scope!.detail;
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
        missingFacts: [triage?.reasonCode ?? scope!.reason],
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

  // Stop here while requirements remain — unless questioning was already
  // completed (e.g. admin/manual path). Customers who finished Questions
  // must be able to reach checkout.
  const outstanding = missingRequirements(facts, openRoutes(facts));
  if (outstanding.length > 0 && !appealCase.questioningComplete) {
    blockers.push("Answer the remaining questions about what happened.");
    return {
      sufficient: false,
      status: "INCOMPLETE",
      blockers,
      groundLabels: [],
      outstandingCount: outstanding.length,
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
