import type { ConfirmedPcn } from "@/types";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
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
import type { AnswerMap } from "@/lib/questions/types";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { RouteFamily } from "@/types/caseState";
import {
  buildRulesBasedLetter,
  isAppealBodyTooThin,
} from "@/lib/appeals/rulesLetter";

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
  };

  const analysis = input.analysis ?? analyseCase(analysisInput);
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

  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: input.confirmed.parking_event_date ?? null,
    evidenceTypes,
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });

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
      caseId: input.caseId ?? null,
      analysis,
      intelligence: input.intelligence ?? null,
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
   * Every AI/deterministic attempt was rejected. The rules letter is a
   * candidate substitute, but — exactly as with the in-loop fallback
   * above — it must clear the same validator, checklist and keeper-safety
   * gates before release. Trusting `isAppealBodyTooThin` alone would ship
   * an unvalidated, un-keeper-checked letter whenever every AI attempt
   * failed for a reason the rules letter shares (e.g. its own repeated
   * wording, or driver-identifying phrasing).
   */
  const finalRulesCtx = {
    body: rulesLetter.body ?? "",
    analysis,
    modules: retrieval.modules,
    sources: retrieval.sources,
    facts,
    evidence: new Set(evidenceTypes),
    variables: {},
    ruleConfig,
  };
  const rulesLetterFinallyReleasable =
    !isAppealBodyTooThin(rulesLetter.body) &&
    rulesLetter.keeperSafe &&
    validateDraft(finalRulesCtx).status === "PASS" &&
    runReleaseChecklist(finalRulesCtx).passed;

  if (rulesLetterFinallyReleasable) {
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
        "Validation failed on AI draft; used Master Pack rules letter.",
      ],
    };
  }

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
