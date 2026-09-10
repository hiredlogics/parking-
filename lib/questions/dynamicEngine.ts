import type { RouteFamily } from "@/types/caseState";
import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts } from "./facts";
import { detectOutOfScope, type ScopeDecision } from "./scope";
import { missingRequirements, unresolvedCriticalFacts } from "./missing";
import type { FactRequirement } from "./requirements";
import { assessCandidacy } from "@/lib/reasoning/routeCandidacy";
import { retrieveForQuestion } from "@/lib/reasoning/questionKnowledge";
import { analysePofa } from "@/lib/analysis/pofa";
import type { PofaAnalysis } from "@/lib/analysis/types";
import { scoreInformationGain } from "@/lib/reasoning/informationGain";
import {
  deriveFactsFromEvidence,
  establishedFacts,
  factsNeedingConfirmation,
} from "@/lib/reasoning/evidenceFacts";
import { fallbackQuestionFor } from "./fallback";
import {
  summariseFailures,
  validateGeneratedQuestion,
  type ValidationFailure,
} from "./validateGenerated";
import type {
  AnswerMap,
  KnownFacts,
  Question,
} from "./types";
import type {
  GeneratedQuestion,
  GenerationContext,
  QuestionProvenance,
} from "./generated";
import { getQuestionProvider } from "@/services/ai/questions";
import type { QuestionProvider } from "@/services/ai/questions";

/**
 * AI-dynamic question orchestration.
 *
 * There is no predetermined sequence. After every answer the case is
 * re-evaluated from scratch: routes are re-derived, outstanding
 * requirements recomputed, and exactly one new question generated for
 * whatever now matters most. Two cases with different facts therefore
 * receive different questions, and a different number of them.
 *
 *   generate -> validate -> serve
 *                       \-> regenerate once with feedback
 *                                            \-> controlled bank fallback
 *
 * A provider failure NEVER completes the journey. If the AI is
 * unavailable the bank answers the same requirement; only an empty
 * requirement list can mark a case sufficient.
 */

export const DYNAMIC_ENGINE_VERSION = "questions-dynamic-v1";

/** Loop guard, not a target. Journeys normally finish well inside this. */
const DEFAULT_MAX_QUESTIONS = 15;

export function maxQuestions(): number {
  const raw = process.env.MAX_ADAPTIVE_QUESTIONS;
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_QUESTIONS;
}

export interface NextQuestionInput {
  /** Attributes provider calls to a case for cost reporting. */
  caseId?: string | null;
  confirmed?: ConfirmedPcn | null;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  /**
   * The operator's allegation from the notice. Opens routes on its own
   * — a PCN alleging non-payment makes PAYMENT a candidate without the
   * customer having to say so first.
   */
  allegedBreach?: string | null;
  /** Facts already put to the customer, answered or not. */
  askedFacts?: string[];
  /** Labels already served, for semantic-repeat detection. */
  askedLabels?: string[];
  /** Injectable for tests. Defaults to the configured provider. */
  provider?: QuestionProvider | null;
}

export type DynamicOutcome =
  | {
      status: "QUESTION_REQUIRED";
      question: Question;
      targetFact: string;
      requirement: FactRequirement;
      provenance: QuestionProvenance;
      eligibleRoutes: RouteFamily[];
      missingFacts: string[];
    }
  | {
      status: "SUFFICIENT_INFORMATION";
      eligibleRoutes: RouteFamily[];
      missingFacts: [];
      readyForNextStage: true;
    }
  | {
      status: "OUT_OF_SCOPE";
      scope: ScopeDecision;
      eligibleRoutes: RouteFamily[];
      missingFacts: string[];
    }
  | {
      status: "MANUAL_REVIEW";
      reason: string;
      detail: string;
      eligibleRoutes: RouteFamily[];
      missingFacts: string[];
    };

function buildContext(
  caseId: string | null,
  facts: KnownFacts,
  confirmed: ConfirmedPcn | null | undefined,
  answers: AnswerMap,
  evidenceTypes: string[],
  routes: RouteFamily[],
  missing: FactRequirement[],
  askedLabels: string[],
  askedFacts: string[],
  pofa: PofaAnalysis,
  feedback?: string,
): GenerationContext {
  return {
    caseId,
    confirmedFacts: (confirmed ?? {}) as Record<string, unknown>,
    answeredFacts: Object.fromEntries(
      Object.entries(answers).filter(([k]) => !k.startsWith("__")),
    ),
    evidenceTypes,
    eligibleRoutes: routes,
    missing: missing.map((m, index) => ({
      fact: m.fact,
      reasonCode: m.reasonCode,
      route: m.route,
      rationale: m.rationale,
      kbModules: m.kbModules,
      /*
       * Retrieved only for the few facts the model will realistically
       * choose between. Retrieving for every outstanding fact would be
       * broad legal RAG, which §K explicitly rules out.
       */
      knowledge:
        index < 3
          ? retrieveForQuestion({
              requirement: m,
              facts,
              evidenceTypes,
              parkingEventDate: confirmed?.parking_event_date ?? null,
              pofa,
            })
          : undefined,
    })),
    askedLabels,
    askedFacts,
    feedback,
  };
}

/**
 * Decide the next single question for a case.
 *
 * Everything before the generator call is deterministic: scope, routes
 * and outstanding requirements. The model only chooses among facts the
 * requirement map already sanctioned, and phrases the question.
 */
export async function nextDynamicQuestion(
  input: NextQuestionInput,
): Promise<DynamicOutcome> {
  const answers = input.answers ?? {};
  const evidenceTypes = input.evidenceTypes ?? [];
  const askedFacts = input.askedFacts ?? [];
  const askedLabels = input.askedLabels ?? [];

  /*
   * Evidence first. A customer who uploaded a payment receipt must not
   * be asked whether they paid, so evidence-established facts are
   * merged in BEFORE anything is considered missing. Answers still win
   * over inferences.
   */
  const derivedEvidenceFacts = deriveFactsFromEvidence(evidenceTypes);
  const fromEvidence = establishedFacts(derivedEvidenceFacts);
  const needsConfirmation = factsNeedingConfirmation(derivedEvidenceFacts);
  const mergedAnswers: AnswerMap = { ...fromEvidence, ...answers };

  const facts = deriveKnownFacts({
    confirmed: input.confirmed,
    answers: mergedAnswers,
    evidenceTypes,
  });

  // Mark asked facts so a requirement answered "not sure" is not
  // re-raised on the next pass.
  for (const f of askedFacts) facts.values[`__askedfact:${f}`] = true;

  /*
   * Route candidacy from four independent sources: the allegation, the
   * facts, the evidence, and the customer's description. Routes
   * contradicted by a confirmed fact are excluded.
   */
  const candidacy = assessCandidacy({
    facts,
    allegedBreach: input.allegedBreach ?? input.confirmed?.alleged_breach ?? null,
    derivedEvidenceFacts,
  });
  const routes = candidacy.candidates;

  // Scope first — never keep interrogating a case we cannot automate.
  const scope = detectOutOfScope(facts);
  if (scope) {
    return {
      status: "OUT_OF_SCOPE",
      scope,
      eligibleRoutes: routes,
      missingFacts: [],
    };
  }

  // Deterministic — never delegated to a model (§M).
  const pofa = analysePofa({ facts });

  const missing = missingRequirements(facts, routes);

  /*
   * The real dead end: no route is in play at all.
   *
   * Checked BEFORE sufficiency, because "nothing left to ask" and
   * "nothing to argue" are not the same thing. Every source has been
   * consulted — the allegation, the facts, the evidence, the customer's
   * description — and none opened a ground, so generating would produce
   * an unsupported appeal.
   */
  if (
    routes.length === 0 &&
    (missing.length === 0 || askedFacts.includes("scenarios"))
  ) {
    return {
      status: "MANUAL_REVIEW",
      reason: "NO_VIABLE_ROUTE",
      detail:
        "We could not identify a ground to appeal on from the notice and the answers given. A member of our team will review this rather than us preparing something unsupported.",
      eligibleRoutes: [],
      missingFacts: missing.map((m) => m.fact),
    };
  }

  if (missing.length === 0) {
    return {
      status: "SUFFICIENT_INFORMATION",
      eligibleRoutes: routes,
      missingFacts: [],
      readyForNextStage: true,
    };
  }

  // A critical fact asked and left empty cannot be resolved by asking
  // again. Route to review rather than looping.
  const stuck = unresolvedCriticalFacts(facts, routes);
  if (stuck.length > 0) {
    return {
      status: "MANUAL_REVIEW",
      reason: "CRITICAL_FACT_UNRESOLVED",
      detail:
        "We could not confirm some essential details about the vehicle keeper. A member of our team will look at this case.",
      eligibleRoutes: routes,
      missingFacts: missing.map((m) => m.fact),
    };
  }

  // Loop guard. Reaching it means the case did not converge, which is a
  // review matter — not a reason to pretend it is complete.
  if (askedFacts.length >= maxQuestions()) {
    return {
      status: "MANUAL_REVIEW",
      reason: "QUESTION_LIMIT_REACHED",
      detail:
        "We have asked as much as we can automatically and some details are still unresolved, so a member of our team will review this case.",
      eligibleRoutes: routes,
      missingFacts: missing.map((m) => m.fact),
    };
  }

  /*
   * Rank by information gain, not by a fixed priority number. The top
   * item is the fact whose answer would change the case most.
   */
  const ranked = scoreInformationGain({
    facts,
    candidateRoutes: routes,
    missing,
    allegationCategory: candidacy.allegation.category,
    needsConfirmation,
    establishedFromEvidence: Object.keys(fromEvidence),
    routeProvenance: candidacy.provenance,
  });
  const ordered = ranked.map((r) => r.requirement);

  const provider =
    input.provider !== undefined ? input.provider : getQuestionProvider();
  const rejections: string[] = [];

  // ---- Attempt 1, then one regeneration with feedback ----
  if (provider) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const feedback =
        attempt === 2 && rejections.length > 0
          ? `Your previous question was rejected for these reasons:\n${rejections.join("\n")}`
          : undefined;

      const result = await provider.generate(
        buildContext(
          input.caseId ?? null,
          facts, input.confirmed, mergedAnswers, evidenceTypes, routes,
          ordered, askedLabels, askedFacts, pofa, feedback,
        ),
      );

      if (!result.output) {
        rejections.push(`- [PROVIDER] ${result.error ?? "No output."}`);
        break; // A transport failure will not fix itself on a retry.
      }

      // The model may only declare completion when the list really is
      // empty — and we already returned above if it were.
      if (result.output.status === "SUFFICIENT_INFORMATION") {
        rejections.push(
          "- [PREMATURE_COMPLETION] Outstanding facts remain, so a question was required.",
        );
        continue;
      }

      const validation = validateGeneratedQuestion({
        candidate: result.output as GeneratedQuestion,
        facts,
        missing: ordered,
        askedLabels,
        askedFacts,
      });

      if (validation.ok) {
        return {
          status: "QUESTION_REQUIRED",
          question: validation.question,
          targetFact: validation.requirement.fact,
          requirement: validation.requirement,
          provenance: {
            origin: attempt === 1 ? "AI" : "AI_REGENERATED",
            providerId: result.providerId,
            model: result.model,
            promptVersion: result.promptVersion,
            rejections,
          },
          eligibleRoutes: routes,
          missingFacts: missing.map((m) => m.fact),
        };
      }

      rejections.push(...describe(validation.failures));
    }
  }

  // ---- Controlled bank fallback ----
  // Walk the outstanding list in priority order: the bank may not cover
  // the top item but may cover the next.
  for (const requirement of ordered) {
    const fb = fallbackQuestionFor(requirement, facts);
    if (!fb) continue;
    return {
      status: "QUESTION_REQUIRED",
      question: fb.question,
      targetFact: requirement.fact,
      requirement,
      provenance: {
        origin: "BANK_FALLBACK",
        providerId: provider ? provider.id : "bank",
        model: null,
        promptVersion: null,
        rejections,
      },
      eligibleRoutes: routes,
      missingFacts: missing.map((m) => m.fact),
    };
  }

  // Outstanding facts the bank cannot cover and the AI could not
  // produce. Explicitly NOT "sufficient".
  return {
    status: "MANUAL_REVIEW",
    reason: provider ? "QUESTION_GENERATION_FAILED" : "NO_QUESTION_SOURCE",
    detail:
      "We could not put the remaining questions to you automatically, so a member of our team will review this case.",
    eligibleRoutes: routes,
    missingFacts: missing.map((m) => m.fact),
  };
}

function describe(failures: ValidationFailure[]): string[] {
  return summariseFailures(failures).split("\n").filter(Boolean);
}
