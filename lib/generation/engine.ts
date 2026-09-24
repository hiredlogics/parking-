import type { ConfirmedPcn } from "@/types";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { groundsMode, judgeGrounds } from "@/lib/judge";
import { persistRetrievalRun } from "@/lib/retrieval/persistRun";
import { KbCatalogError, loadKbCatalog } from "@/lib/kb/catalog";
import { draftAppeal, type DraftAppealResult } from "@/lib/drafting/engine";
import {
  summariseForRegeneration,
  validateDraft,
  type ValidationRun,
} from "@/lib/validation/engine";
import { loadValidatorConfig } from "@/lib/validation/ruleConfig";
import {
  runReleaseChecklist,
  type ReleaseChecklist,
} from "@/lib/validation/releaseChecklist";
import { getDraftingProvider } from "@/services/ai/drafting";
import type { AnswerMap, FactSource } from "@/lib/facts/types";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { RouteFamily } from "@/types/caseState";
import {
  buildRulesBasedLetter,
  isAppealBodyTooThin,
} from "@/lib/appeals/rulesLetter";
import { establishedPofaDefects } from "@/lib/facts/toLegacyAnswers";
import { assessGroundSufficiency } from "./groundGuard";

export const GENERATION_VERSION = "generation-v1";

const RULE_ROUTE_TO_FAMILY: Record<string, RouteFamily> = {
  KEEPER_ROUTE: "POFA",
  PAYMENT_ROUTE: "PAYMENT",
  KEYING_ROUTE: "KEYING",
  CONSIDERATION_ROUTE: "CONSIDERATION",
  GRACE_ROUTE: "GRACE",
  ANPR_ROUTE: "ANPR",
  AUTHORISATION_ROUTE: "AUTHORIZATION",
  SIGNAGE_ROUTE: "SIGNAGE",
  LANDOWNER_ROUTE: "LANDOWNER",
};

function withRulesRoutes(
  analysis: IssueAnalysis,
  activeRoutes: string[],
): IssueAnalysis {
  const mapped = activeRoutes
    .map((r) => RULE_ROUTE_TO_FAMILY[r])
    .filter((r): r is RouteFamily => Boolean(r));
  if (mapped.length === 0) return analysis;
  const primary = analysis.primaryRoute ?? mapped[0] ?? null;
  const secondary = [
    ...new Set([
      ...(analysis.secondaryRoutes ?? []),
      ...mapped.filter((r) => r !== primary),
    ]),
  ];
  return {
    ...analysis,
    primaryRoute: primary,
    secondaryRoutes: secondary,
  };
}

/**
 * A rules letter is a deterministic template assembled from PP-* pack
 * paragraphs. It has passed neither the validator, the release
 * checklist nor a keeper-safety check, so it is never released in place
 * of a MANUAL_REVIEW outcome — all we record is that one is available
 * for whoever picks the case up.
 */
function withRulesLetterAvailable(
  warnings: string[],
  rulesLetter: { body: string | null },
): string[] {
  if (isAppealBodyTooThin(rulesLetter.body)) return warnings;
  return [
    ...warnings,
    "A rules-based starter letter was assembled and is available to the reviewer; it is not released automatically.",
  ];
}

/**
 * Generation orchestrator.
 *
 * V2 Part 2 step 11: "If validation fails, regenerate/correct or route to
 * configured manual review rather than releasing an unsafe appeal."
 *
 *   draft -> validate -> release
 *                    \-> regenerate once (bespoke providers only)
 *                        -> validate -> release
 *                                   \-> MANUAL_REVIEW
 *
 * Keeper-safety failures also get ONE controlled correction attempt
 * (structured feedback naming the offending phrases). A second failure
 * is MANUAL_REVIEW — never an indefinite loop.
 *
 * Regeneration is only attempted for a bespoke provider: re-running the
 * deterministic assembler would produce byte-identical output, so it goes
 * straight to manual review instead of burning a pointless cycle.
 *
 * A BLOCKING validation failure can never be released. That is enforced
 * here, not by the caller.
 */

export type GenerationStatus =
  | "READY"
  | "MANUAL_REVIEW"
  | "FAILED";

export interface GenerationAttempt {
  attempt: number;
  validation: ValidationRun;
  checklist: ReleaseChecklist;
  accepted: boolean;
}

export interface GenerationResult {
  status: GenerationStatus;
  /** Released body. Null unless status is READY. */
  body: string | null;
  analysis: IssueAnalysis;
  attempts: GenerationAttempt[];
  /** Reason for manual review or failure. */
  reason: string | null;
  detail: string | null;
  moduleIds: string[];
  provider: {
    providerId: string;
    promptVersion: string;
    model: string | null;
    bespoke: boolean;
    /** Token usage for the accepted attempt, where the provider reports it. */
    usage?: { promptTokens?: number; completionTokens?: number };
  } | null;
  warnings: string[];
  generationVersion: string;
}

export interface GenerateInput {
  /** Attributes every AI call in this generation to a case for costing. */
  caseId?: string | null;
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  evidenceTypes?: string[];
  evidenceRefs?: string[];
  /** Max drafting attempts. Default 2 (initial + one regeneration). */
  maxAttempts?: number;
  /** Pre-built analysis from Case Intelligence when available. */
  analysis?: IssueAnalysis | null;
  /**
   * Full Case Intelligence. Drafting needs more than the analysis
   * snapshot: technical grounds found from the document, the sender /
   * operator split, and what is still outstanding.
   */
  intelligence?:
    | import("@/lib/cases/caseIntelligence").CaseIntelligence
    | null;
  /** See AnalysisInput.answerProvenance — threaded through to analyseCase. */
  answerProvenance?: Partial<Record<string, FactSource>>;
}

export async function generateValidatedAppeal(
  input: GenerateInput,
): Promise<GenerationResult> {
  const evidenceTypes = input.evidenceTypes ?? [];
  const analysisInput = {
    confirmed: input.confirmed,
    answers: input.answers,
    evidenceTypes,
    evidenceRefs: input.evidenceRefs ?? [],
    pofaConfig: await loadPofaConfig(),
    answerProvenance: input.answerProvenance,
  };

  /*
   * Copied, not aliased. In `llm` mode the grounds judge rewrites
   * primaryRoute and secondaryRoutes in place so `base`, the validation
   * context and the release checklist all see the routes the letter was
   * actually built from. A caller that passed its own analysis in (Case
   * Intelligence does) must not find it rewritten underneath.
   */
  const analysis: IssueAnalysis = { ...(input.analysis ?? analyseCase(analysisInput)) };
  const facts = factsForCase(analysisInput);
  const warnings: string[] = [];
  const attempts: GenerationAttempt[] = [];

  const base: Omit<GenerationResult, "status" | "body" | "reason" | "detail"> = {
    analysis,
    attempts,
    moduleIds: [],
    provider: null,
    warnings,
    generationVersion: GENERATION_VERSION,
  };

  // Prefer Master Pack rules assembly as the letter body. AI drafting
  // may still run for enrichment, but an empty/thin result must never
  // ship — fall back to PP-* paragraphs selected by the rules engine.
  const rulesLetter = await buildRulesBasedLetter({
    confirmed: input.confirmed,
    answers: input.answers,
    evidenceTypes,
    // Without this the rules engine cannot see an established timing
    // failure, so PP-R004 never fires and the letter argues only the
    // generic keeper-liability threshold. See EstablishedPofaDefects.
    establishedPofa: establishedPofaDefects({
      timingStatus: analysis.pofa.timingStatus,
      noticeRoute: input.confirmed.notice_route,
    }),
    // Same identified facts the AI path works from, so neither path
    // selects grounds the other cannot see.
    identifiedTags: [...facts.tags],
  });
  warnings.push(...rulesLetter.warnings.map((w) => `[rules] ${w}`));

  /*
   * Manual review decided before drafting (scope, Scotland, unresolved
   * Code). This gate is the reason an unappealable notice — a debt
   * recovery letter, say — must not produce an appeal, so nothing may
   * be released past it: no rules letter, no body at all.
   */
  if (analysis.manualReview) {
    return {
      ...base,
      status: "MANUAL_REVIEW",
      body: null,
      reason: analysis.manualReview.reason,
      detail: analysis.manualReview.detail,
      warnings: withRulesLetterAvailable(warnings, rulesLetter),
    };
  }

  let catalog;
  try {
    catalog = await loadKbCatalog();
  } catch (err) {
    if (err instanceof KbCatalogError) {
      // The catalog IS the approved legal basis. Without it there is
      // nothing to ground an appeal in, whatever the template says.
      return {
        ...base,
        status: "MANUAL_REVIEW",
        body: null,
        reason: "KB_CATALOG_UNAVAILABLE",
        detail: err.message,
        warnings: withRulesLetterAvailable(
          [...warnings, `[kb] ${err.message}`],
          rulesLetter,
        ),
      };
    }
    throw err;
  }

  const retrievalArgs = {
    analysis,
    facts,
    parkingEventDate: input.confirmed.parking_event_date ?? null,
    evidenceTypes,
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  };

  let retrieval = retrieveKnowledge(retrievalArgs);
  const deterministicModuleIds = retrieval.modules.map((m) => m.moduleId);

  /*
   * ---- The grounds judge ----
   *
   * Runs here, in the orchestrator, because this is where retrieval, the
   * validation context and the release checklist are all built. A judge
   * that ran inside draftAppeal would narrow the modules the letter is
   * written from while the validator and the checklist still saw the
   * wide set — the two would diverge with nothing reporting it.
   *
   * `shadow` records the decision and drafts the deterministic result
   * anyway, which is how agreement is measured before authority is
   * handed over. `llm` re-runs retrieval restricted to the selection,
   * which re-applies every hard filter and re-derives the approved
   * blocks for the narrowed set.
   */
  const mode = groundsMode();
  const judge =
    mode === "deterministic"
      ? null
      : await judgeGrounds({
          analysis,
          facts,
          retrieval,
          allModules: catalog.modules,
          caseId: input.caseId ?? null,
        });

  if (judge && mode === "llm" && judge.failure) {
    /*
     * MANUAL_REVIEW, never FAILED — the customer has paid, and a judge
     * outage is our problem. Deliberately NOT a silent fallback to the
     * deterministic set: a judge that quietly stops judging is exactly
     * the failure that produced identical letters in the first place,
     * and it must be visible rather than absorbed.
     */
    await persistRetrievalRun({
      caseId: input.caseId ?? null,
      retrieval,
      judge,
      mode,
      deterministicModuleIds,
    });
    return {
      ...base,
      status: "MANUAL_REVIEW",
      body: null,
      reason: judge.failure,
      detail: `The grounds decision could not be completed (${judge.caseUnderstanding}). This case needs a person to review it.`,
      warnings: withRulesLetterAvailable(warnings, rulesLetter),
    };
  }

  if (judge && mode === "llm") {
    retrieval = retrieveKnowledge({
      ...retrievalArgs,
      judgeSelection: judge.moduleIds,
    });
    // Routes derive FROM the judge, so the labels the PDF prints follow
    // the selection rather than the pre-judge assessment.
    analysis.primaryRoute = judge.primaryRoute;
    analysis.secondaryRoutes = judge.secondaryRoutes;
    if (judge.overrides.length > 0) {
      warnings.push(
        `[judge] admitted ${judge.overrides.length} module(s) the fact gate had refused: ${judge.overrides.join(", ")}.`,
      );
    }
  }

  /*
   * Awaited, not fire-and-forget: JUDGE_DECISION_RECORDED checks that
   * the run reached `retrieval_runs`, and the checklist cannot assert
   * that about a promise nobody waited for. persistRetrievalRun swallows
   * its own errors and returns null, so an audit-store outage still
   * cannot throw a customer's appeal away — it fails the checklist
   * instead, which is the correct place for it to surface.
   */
  const retrievalRunId =
    mode === "deterministic"
      ? null
      : await persistRetrievalRun({
          caseId: input.caseId ?? null,
          retrieval,
          judge,
          mode,
          deterministicModuleIds,
        });

  /*
   * Only in `llm` mode does the judge's decision gate release. In
   * `shadow` the deterministic path is what ships, so a judge failure is
   * an observation to record rather than a reason to hold a letter —
   * making shadow mode block releases would make it unusable for
   * measuring agreement, which is its only purpose.
   */
  const judgeCtx =
    judge && mode === "llm"
      ? {
          failure: judge.failure,
          moduleIds: judge.moduleIds,
          providerId: judge.providerId,
          recorded: retrievalRunId !== null,
        }
      : null;

  if (retrieval.modules.length === 0) {
    warnings.push(
      "No KB modules matched; AI will use Master Pack rules basis (with rules-engine fallback).",
    );
  }

  // AI-first when RULES_LETTER_PRIMARY is not forced on.
  // Default is AI with Master Pack rules in the prompt; rules-engine
  // letter is the fallback when AI is thin / blocked / fails.
  // Set RULES_LETTER_PRIMARY=1 to skip AI and ship pack paragraphs only.
  const preferRules =
    (process.env.RULES_LETTER_PRIMARY ?? "0").toLowerCase() === "1";

  if (preferRules) {
    const body = (rulesLetter.body ?? "").trim();
    /*
     * This flag ships pack paragraphs without running the validator at
     * all (there are no drafting variables to validate against yet), so
     * keeper safety is checked explicitly. An appeal must never identify
     * the driver, whichever engine wrote it.
     */
    if (body.length > 0 && rulesLetter.keeperSafe) {
      return {
        ...base,
        analysis: withRulesRoutes(analysis, rulesLetter.activeRoutes),
        status: "READY",
        body: rulesLetter.body,
        moduleIds: retrieval.modules.map((m) => m.moduleId),
        provider: {
          providerId: "rules-engine",
          promptVersion: "pack-v1",
          model: null,
          bespoke: false,
        },
        reason: null,
        detail: null,
        warnings: [
          ...warnings,
          `Rules letter: ${rulesLetter.matchedParagraphIds.length} paragraphs (${rulesLetter.activeRoutes.join(", ") || "no routes"}).`,
          ...(isAppealBodyTooThin(rulesLetter.body)
            ? ["Rules letter is short; AI drafting skipped because RULES_LETTER_PRIMARY=1."]
            : []),
        ],
      };
    }
  }

  // Even with zero KB modules, try AI when the rules basis has content.
  if (retrieval.modules.length === 0 && isAppealBodyTooThin(rulesLetter.body)) {
    return {
      ...base,
      status: "MANUAL_REVIEW",
      body: rulesLetter.body || null,
      reason: "NO_APPROVED_MODULES",
      detail:
        "No approved knowledge module or rules letter supports this case on the confirmed facts.",
    };
  }

  /*
   * ---- The ground gate ----
   *
   * Retrieval returning modules is not the same as the case having an
   * argument. KB-POFA-01 opens on the two defaulted facts every case
   * carries, so "modules > 0" was never a real test of whether there
   * was anything to say. See lib/generation/groundGuard.ts.
   *
   * This runs after retrieval because it needs the analysis, and before
   * the attempt loop because its whole purpose is to avoid paying for a
   * draft that cannot be case-specific. Refusing routes to
   * MANUAL_REVIEW with the rules letter attached, exactly as the other
   * pre-drafting refusals do — the customer has already paid by this
   * point, so the answer is a person, never nothing.
   */
  // No serviceCode: this engine is service-agnostic, and evaluateIssues
  // falls back to the default service graph when none is named.
  const ground = await assessGroundSufficiency({
    facts,
    analysis,
    evidenceTypes: input.evidenceTypes,
    // What retrieval actually kept, so an issue whose knowledge was all
    // gated out does not count as a ground. See the guard's header.
    retainedModuleIds: retrieval.modules.map((m) => m.moduleId),
  });

  if (!ground.ok) {
    return {
      ...base,
      status: "MANUAL_REVIEW",
      body: rulesLetter.body || null,
      reason: ground.reason,
      detail: ground.detail,
      warnings: [
        ...warnings,
        `Ground gate refused drafting: allegation=${ground.allegation.category}, ` +
          `active=[${ground.activeIssues.join(",")}], ` +
          `assertable facts=${ground.assertableFactCount}.`,
      ],
    };
  }

  const provider = getDraftingProvider();
  const maxAttempts = Math.max(
    1,
    input.maxAttempts ?? (provider.bespoke ? 2 : 1),
  );

  let lastDraft: DraftAppealResult | null = null;
  let regenerationFeedback = "";
  const ruleConfig = await loadValidatorConfig();

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const draft = await draftAppeal({
      ...analysisInput,
      // The issues the engine identified, so the drafter argues the
      // grounds the case actually raises rather than inferring them
      // back out of the module list.
      activeIssues: ground.activeIssues,
      substantiveIssues: ground.substantiveIssues,
      outstandingFacts: ground.missingFacts,
      caseId: input.caseId ?? null,
      analysis,
      intelligence: input.intelligence ?? null,
      // The judge's selection, so drafting narrows to exactly the
      // grounds the validator and the checklist will see.
      judgeSelection: judge && mode === "llm" ? judge.moduleIds : undefined,
      // Pass the same catalog so drafting does not re-load seed defaults.
      modules: catalog.modules,
      sources: catalog.sources,
      blocks: catalog.blocks,
      // On a retry the validator's / keeper-safety issues are handed back
      // so the drafter corrects rather than repeats the same failure.
      feedback: regenerationFeedback || undefined,
    });
    lastDraft = draft;

    if (!draft.ok || !draft.body) {
      /*
       * Keeper-safety: ONE controlled correction attempt for bespoke
       * providers. Structural failures (unresolved variables, transport)
       * go straight to MANUAL_REVIEW — retrying them cannot help.
       */
      const canRetryKeeper =
        draft.blockedReason === "KEEPER_SAFETY_FAILED" &&
        provider.bespoke &&
        attempt < maxAttempts;

      if (canRetryKeeper) {
        regenerationFeedback = summariseKeeperSafetyForRegeneration(draft);
        warnings.push(
          `Attempt ${attempt} blocked by keeper safety; regenerating once with correction instructions.`,
        );
        continue;
      }

      /*
       * ANY unreleasable outcome is MANUAL_REVIEW, not FAILED. The
       * customer has paid — an unusable draft must land with a person.
       * Substituting the rules letter here would defeat the whole
       * keeper-safety block: the draft was refused for naming the
       * driver, and the template is built from those same facts without
       * ever being keeper-checked or validated.
       */
      return {
        ...base,
        status: "MANUAL_REVIEW",
        body: null,
        moduleIds: draft.draft?.moduleIds ?? [],
        provider: draft.draft
          ? {
              providerId: draft.draft.providerId,
              promptVersion: draft.draft.promptVersion,
              model: draft.draft.model,
              bespoke: draft.draft.bespoke,
              usage: draft.draft.usage,
            }
          : null,
        warnings: withRulesLetterAvailable(
          [...warnings, ...draft.warnings],
          rulesLetter,
        ),
        reason: draft.blockedReason ?? "DRAFTING_FAILED",
        detail:
          draft.blockedReason === "KEEPER_SAFETY_FAILED"
            ? "The draft contained driver-identifying wording and was blocked before release after one correction attempt."
            : draft.blockedReason === "DRAFTING_TRANSPORT_FAILED"
              ? "We could not reach the drafting service. This is a temporary technical fault, not a problem with your case — it will be retried."
              : "The appeal could not be produced safely and needs a person to review it.",
      };
    }

    const ctx = {
      body: draft.body,
      analysis,
      modules: retrieval.modules,
      sources: retrieval.sources,
      facts,
      evidence: new Set(evidenceTypes),
      variables: draft.variables,
      ruleConfig,
      judge: judgeCtx,
    };

    const validation = validateDraft(ctx);
    const checklist = runReleaseChecklist(ctx);
    const accepted = validation.status === "PASS" && checklist.passed;
    attempts.push({ attempt, validation, checklist, accepted });

    if (accepted) {
      /*
       * A thin-but-valid AI draft can fall back to the Master Pack rules
       * letter — but the substitute has to clear the same gates the AI
       * body just cleared. `validateDraft` above ran against
       * `draft.body`; releasing different text on the strength of that
       * result would mean shipping an unvalidated, un-keeper-checked
       * letter.
       */
      const rulesLetterReleasable =
        !isAppealBodyTooThin(rulesLetter.body) &&
        rulesLetter.keeperSafe &&
        (() => {
          const rulesCtx = { ...ctx, body: rulesLetter.body as string };
          return (
            validateDraft(rulesCtx).status === "PASS" &&
            runReleaseChecklist(rulesCtx).passed
          );
        })();
      const usedRulesFallback =
        isAppealBodyTooThin(draft.body) && rulesLetterReleasable;
      const body = usedRulesFallback ? rulesLetter.body : draft.body;
      return {
        ...base,
        analysis: withRulesRoutes(analysis, rulesLetter.activeRoutes),
        status: "READY",
        body,
        moduleIds: draft.draft?.moduleIds ?? [],
        provider: usedRulesFallback
          ? {
              providerId: "rules-engine",
              promptVersion: "pack-v1",
              model: null,
              bespoke: false,
            }
          : draft.draft
            ? {
                providerId: draft.draft.providerId,
                promptVersion: draft.draft.promptVersion,
                model: draft.draft.model,
                bespoke: draft.draft.bespoke,
                usage: draft.draft.usage,
              }
            : null,
        reason: null,
        detail: null,
        warnings: [
          ...warnings,
          ...draft.warnings,
          ...(usedRulesFallback
            ? ["AI draft too thin; used Master Pack rules letter fallback."]
            : []),
          ...validation.issues
            .filter((i) => i.severity === "WARNING")
            .map((i) => `[${i.code}] ${i.message}`),
        ],
      };
    }

    // Not accepted. Only a bespoke provider can produce different output.
    regenerationFeedback = summariseForRegeneration(validation);
    if (!provider.bespoke || attempt >= maxAttempts) break;
    warnings.push(
      `Attempt ${attempt} rejected by validation; regenerating (${validation.blockingCount} blocking issue(s)).`,
    );
  }

  /*
   * Every attempt was rejected, including any regeneration. A failed
   * draft is NOT downgraded to the rules letter.
   *
   * This path used to release the Master Pack letter here, and that is
   * what produced the "generic appeal" the client reported. The two
   * bodies are not interchangeable: the rules letter is selected from a
   * smaller wording vocabulary (paragraphs/library.ts holds no AI-*
   * blocks at all), so substituting it silently swaps a case-specific
   * argument for a weaker one — and it did so precisely when the
   * case-specific draft had failed, i.e. when the case most needed a
   * person to look.
   *
   * The letter is still attached below for the reviewer, because the
   * customer has paid by this point and the answer to a hard case is a
   * human, never nothing. It is attached as MANUAL_REVIEW, not released.
   */
  const finalAttempt = attempts[attempts.length - 1];
  const blockingCodes = finalAttempt
    ? [
        ...new Set(
          finalAttempt.validation.issues
            .filter((i) => i.severity === "BLOCKING")
            .map((i) => i.code),
        ),
      ]
    : [];
  const checklistFailures = finalAttempt?.checklist.failedIds ?? [];

  return {
    ...base,
    status: "MANUAL_REVIEW",
    body: rulesLetter.body || null,
    moduleIds: lastDraft?.draft?.moduleIds ?? [],
    provider: lastDraft?.draft
      ? {
          providerId: lastDraft.draft.providerId,
          promptVersion: lastDraft.draft.promptVersion,
          model: lastDraft.draft.model,
          bespoke: lastDraft.draft.bespoke,
          usage: lastDraft.draft.usage,
        }
      : null,
    warnings: [...warnings, ...(lastDraft?.warnings ?? [])],
    reason: "VALIDATION_FAILED",
    detail:
      [
        blockingCodes.length > 0
          ? `Blocking validators: ${blockingCodes.join(", ")}.`
          : null,
        checklistFailures.length > 0
          ? `Release checklist failures: ${checklistFailures.join(", ")}.`
          : null,
        regenerationFeedback ? "Regeneration did not resolve the issues." : null,
      ]
        .filter(Boolean)
        .join(" ") || "Validation failed.",
  };
}

/**
 * Structured correction instruction for a keeper-safety failure.
 * Names the offending phrases so the model can remove them without
 * inventing new driver-identifying wording.
 */
function summariseKeeperSafetyForRegeneration(
  draft: DraftAppealResult,
): string {
  const lines = [
    "Your previous draft was REJECTED by the keeper-safety gate.",
    "The recipient is the registered keeper, and the driver has not been identified.",
    "Rewrite the whole letter without any wording that identifies or implies who was driving.",
    "Forbidden patterns include first-person driving/parking narration such as \"I parked\", \"I drove\", \"When I arrived\", \"I was driving\", \"I left the vehicle\".",
    "Use keeper-safe language only (e.g. \"the vehicle was parked\", \"the registered keeper\", \"it is not admitted that the recipient was the driver\").",
    "",
  ];
  for (const v of draft.keeperSafeViolations) {
    lines.push(`- [${v.label}] Offending text: "${v.excerpt}"`);
  }
  return lines.join("\n");
}
