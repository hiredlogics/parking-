import type { RouteFamily } from "@/types/caseState";
import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts } from "@/lib/facts/facts";
import { detectOutOfScope, type ScopeDecision } from "@/lib/facts/scope";
import {
  isRequirementActive,
  missingRequirements,
  unresolvedCriticalFacts,
} from "@/lib/facts/missing";
import type { FactRequirement } from "@/lib/facts/requirements";
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
import type { Question } from "./types";
import type { AnswerMap, KnownFacts } from "@/lib/facts/types";
import type {
  GeneratedQuestion,
  GenerationContext,
  QuestionProvenance,
} from "./generated";
import { getQuestionProvider } from "@/services/ai/questions";
import type { QuestionProvider } from "@/services/ai/questions";
import { KbCatalogError, loadKbCatalog } from "@/lib/kb/catalog";
import type { KbModule, LegalSource } from "@/lib/kb/types";
import {
  evaluateIssues,
  isAdminIssueEngineEnabled,
} from "@/lib/engine/issueEngine";
import { ALL_REASON_CODES, requirementsForFact } from "@/lib/facts/requirements";
import { filterMissingFactsByCircumstances } from "./caseAssessment";
import { triageBlocksAppealJourney } from "@/types/triage";
import type { DocumentTriageResult } from "@/types/triage";
import type { CaseIntelligence } from "@/lib/cases/caseIntelligence";
import { hasIdentifiedIssue } from "@/lib/cases/caseIntelligence";
import { SERVICE_NOT_SUITABLE_DETAIL } from "@/lib/cases/documentUnderstanding";

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
  /** Pre-computed document triage from extraction. */
  triage?: DocumentTriageResult | null;
  /** Durable Case Intelligence from confirm / prior answers. */
  caseIntelligence?: CaseIntelligence | null;
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
  catalog: { modules: KbModule[]; sources: LegalSource[] },
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
       *
       * Same catalog as drafting — admin disable/effective dates apply here.
       */
      knowledge:
        index < 3
          ? retrieveForQuestion({
              requirement: m,
              facts,
              evidenceTypes,
              parkingEventDate: confirmed?.parking_event_date ?? null,
              pofa,
              modules: catalog.modules,
              sources: catalog.sources,
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
  /*
   * @deprecated assessCandidacy — used for provider labels / PoFA context
   * and as legacy fallback when USE_ADMIN_ISSUE_ENGINE=0. Do not extend;
   * remove in Phase 6–7 after parity tests.
   */
  const candidacy = assessCandidacy({
    facts,
    allegedBreach: input.allegedBreach ?? input.confirmed?.alleged_breach ?? null,
    derivedEvidenceFacts,
  });
  const routes = candidacy.candidates;

  /*
   * Scope first — never keep interrogating a case we cannot automate.
   *
   * Case Intelligence is checked ahead of the raw triage result: it is
   * the durable record, and for a case assessed since it was introduced
   * its suitability already carries the triage decision forward. Read
   * here as well as in the caller so no entry point into questioning
   * can reach a fact for an unappealable document.
   */
  const intelligenceBlock =
    input.caseIntelligence?.suitability.decision === "NOT_SUPPORTED"
      ? {
          action: "OUT_OF_SCOPE" as const,
          reason:
            input.caseIntelligence.suitability.reasonCode ?? "NOT_SUPPORTED",
          detail:
            input.caseIntelligence.suitability.detail ??
            SERVICE_NOT_SUITABLE_DETAIL,
        }
      : null;
  const triageBlock =
    input.triage && triageBlocksAppealJourney(input.triage)
      ? {
          action: "OUT_OF_SCOPE" as const,
          reason: input.triage.reasonCode,
          detail: input.triage.detail,
        }
      : null;
  const scope = intelligenceBlock ?? triageBlock ?? detectOutOfScope(facts);
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

  /*
   * Phase 5: Admin-configured issue engine is the authority for missing
   * facts. Legacy missingRequirements is fallback only.
   */
  let missing: FactRequirement[];
  let adminSufficient = false;

  if (isAdminIssueEngineEnabled()) {
    try {
      const evaluated = await evaluateIssues({
        serviceCode: "PRIVATE_PARKING_INITIAL_APPEAL",
        facts,
        evidenceTypes,
      });
      adminSufficient = evaluated.sufficient;
      missing = evaluated.missingFacts.map((m) => {
        /*
         * The static requirement map stays the authority on which route
         * declares a fact and when that fact is conditional, because
         * `validateGeneratedQuestion` checks the generated question against
         * it. Stamping every fact "TRIAGE" made every non-triage question
         * fail ROUTE_MISMATCH — the AI was called, billed, then discarded
         * on both attempts, so the bank answered every question. And
         * `when: () => true` erased gates such as "only ask where the
         * permission came from once permission is established".
         */
        const declared = requirementsForFact(m.factKey);
        const scoped =
          declared.find((r) => routes.includes(r.route as RouteFamily)) ??
          declared[0];
        return {
          fact: m.factKey,
          reasonCode: (ALL_REASON_CODES.includes(m.reasonCode as never)
            ? m.reasonCode
            : "GROUNDS_UNIDENTIFIED") as FactRequirement["reasonCode"],
          route: scoped?.route ?? ("TRIAGE" as FactRequirement["route"]),
          priority: m.priority,
          rationale: `Required for ${m.issueCode}`,
          kbModules: evaluated.applicableModuleIds.slice(0, 4),
          when: scoped?.when,
        };
      });
      // A fact whose gate is closed must not be asked at all — otherwise
      // the bank serves it ungated and the journey reads as a fixed tree.
      missing = missing.filter((r) => isRequirementActive(r, facts));
      // Assessment filter: after circumstances are named, drop permission /
      // residential (etc.) questionnaires that those answers do not justify.
      missing = filterMissingFactsByCircumstances(missing, facts);
      // Merge Case Intelligence missing facts (e.g. late-notice clarifications)
      // without inventing new question bank entries — only known requirements.
      missing = mergeIntelligenceMissingFacts(
        missing,
        input.caseIntelligence,
        facts,
        routes,
      );
      if (
        hasIdentifiedIssue(input.caseIntelligence, "possible_late_notice") &&
        !routes.includes("POFA")
      ) {
        routes.push("POFA");
      }
      if (missing.length === 0) {
        const circumstancesNamed = Array.isArray(facts.values.scenarios)
          ? (facts.values.scenarios as unknown[]).length > 0
          : false;
        if (
          adminSufficient ||
          circumstancesNamed ||
          evaluated.activeIssues.some((i) => i.code !== "TRIAGE_SCOPE")
        ) {
          return {
            status: "SUFFICIENT_INFORMATION",
            eligibleRoutes: routes,
            missingFacts: [],
            readyForNextStage: true,
          };
        }
        return {
          status: "MANUAL_REVIEW",
          reason: "NO_VIABLE_ROUTE",
          detail:
            "We could not identify a ground to appeal on from the notice and the answers given. A member of our team will review this rather than us preparing something unsupported.",
          eligibleRoutes: [],
          missingFacts: [],
        };
      }
    } catch (err) {
      console.warn(
        "[dynamicEngine] admin issue engine failed; using legacy requirements:",
        err,
      );
      missing = filterMissingFactsByCircumstances(
        missingRequirements(facts, routes),
        facts,
      );
      missing = mergeIntelligenceMissingFacts(
        missing,
        input.caseIntelligence,
        facts,
        routes,
      );
    }
  } else {
    missing = filterMissingFactsByCircumstances(
      missingRequirements(facts, routes),
      facts,
    );
    missing = mergeIntelligenceMissingFacts(
      missing,
      input.caseIntelligence,
      facts,
      routes,
    );
  }

  if (
    hasIdentifiedIssue(input.caseIntelligence, "possible_late_notice") &&
    !routes.includes("POFA")
  ) {
    routes.push("POFA");
  }

  /*
   * Legacy dead-end: no route is in play at all.
   * @deprecated — admin engine path above handles this when enabled.
   */
  if (
    !isAdminIssueEngineEnabled() &&
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

  /*
   * Prefer AI phrasing of the next missing fact (AI-led journey).
   * Set QUESTION_PREFER_BANK=1 to serve packed bank questions first.
   */
  const preferBank =
    input.provider === undefined &&
    (process.env.QUESTION_PREFER_BANK ?? "0").toLowerCase() === "1";

  if (preferBank) {
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
          providerId: "bank",
          model: null,
          promptVersion: null,
          rejections: [],
        },
        eligibleRoutes: routes,
        missingFacts: missing.map((m) => m.fact),
      };
    }
  }

  let catalog: { modules: KbModule[]; sources: LegalSource[] };
  try {
    const loaded = await loadKbCatalog();
    catalog = { modules: loaded.modules, sources: loaded.sources };
  } catch (err) {
    if (err instanceof KbCatalogError) {
      // Bank may still cover something even if KB catalog failed.
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
            providerId: "bank",
            model: null,
            promptVersion: null,
            rejections: [`- [KB] ${err.message}`],
          },
          eligibleRoutes: routes,
          missingFacts: missing.map((m) => m.fact),
        };
      }
      return {
        status: "MANUAL_REVIEW",
        reason: "KB_CATALOG_UNAVAILABLE",
        detail: err.message,
        eligibleRoutes: routes,
        missingFacts: missing.map((m) => m.fact),
      };
    }
    throw err;
  }

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
          ordered, askedLabels, askedFacts, pofa, catalog, feedback,
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

  /*
   * A bank answer after the AI was asked is a degradation, not a normal
   * path: it previously left no trace outside the case's `rejections`
   * column, so a permanently failing provider looked like a working one.
   */
  if (provider && rejections.length > 0) {
    console.warn(
      `[dynamicEngine] AI question rejected; serving bank fallback: ${rejections.join(" ")}`,
    );
  }

  // ---- Controlled bank fallback (when AI failed or preferBank was off) ----
  // Gated pass first, across every outstanding requirement. The ungated
  // pass below is a last resort, so a question the bank itself gates off
  // is never served while a properly gated one is available.
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

  // Last resort: nothing could be served within its gate, so relax the
  // gate rather than dead-ending the customer on "under review".
  for (const requirement of ordered) {
    const fb = fallbackQuestionFor(requirement, facts, { ignoreGate: true });
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
        rejections: [
          ...rejections,
          "- [GATE] askWhen relaxed for remaining bank question",
        ],
      },
      eligibleRoutes: routes,
      missingFacts: missing.map((m) => m.fact),
    };
  }

  /*
   * Nothing left we can ask automatically. Continue the customer journey
   * (evidence / pay) rather than trapping them on "Under review".
   * Outstanding facts stay on the case for staff.
   */
  return {
    status: "SUFFICIENT_INFORMATION",
    eligibleRoutes: routes,
    missingFacts: [],
    readyForNextStage: true,
  };
}

function describe(failures: ValidationFailure[]): string[] {
  return summariseFailures(failures).split("\n").filter(Boolean);
}

/**
 * Fold Case Intelligence clarification facts into the missing list.
 * Only adds facts that already exist in the requirements map — never
 * invents new question targets.
 */
function mergeIntelligenceMissingFacts(
  missing: FactRequirement[],
  intelligence: CaseIntelligence | null | undefined,
  facts: KnownFacts,
  routes: RouteFamily[],
): FactRequirement[] {
  if (!intelligence?.identifiedIssues.length) return missing;
  const have = new Set(missing.map((m) => m.fact));
  const out = [...missing];

  for (const issue of intelligence.identifiedIssues) {
    const preferPofa = issue.code === "possible_late_notice";
    for (const factKey of issue.missingFacts) {
      if (have.has(factKey)) continue;
      const v = facts.values[factKey];
      if (v !== undefined && v !== null && v !== "") {
        if (!Array.isArray(v) || v.length > 0) continue;
      }
      const declared = requirementsForFact(factKey);
      if (declared.length === 0) continue;
      const scoped =
        (preferPofa
          ? declared.find((r) => r.route === "POFA")
          : undefined) ??
        declared.find((r) => routes.includes(r.route as RouteFamily)) ??
        declared[0];
      if (!isRequirementActive(scoped, facts)) continue;
      out.push({
        ...scoped,
        priority: Math.min(scoped.priority, preferPofa ? 8 : scoped.priority),
        rationale: `Required to resolve ${issue.code}`,
        kbModules: [
          ...new Set([...(scoped.kbModules ?? []), ...issue.knowledgeRefs]),
        ].slice(0, 6),
      });
      have.add(factKey);
    }
  }
  return out;
}
