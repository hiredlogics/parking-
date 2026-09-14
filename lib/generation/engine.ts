import type { ConfirmedPcn } from "@/types";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { KbCatalogError, loadKbCatalog } from "@/lib/kb/catalog";
import { draftAppeal, type DraftAppealResult } from "@/lib/drafting/engine";
import {
  summariseForRegeneration,
  validateDraft,
  type ValidationRun,
} from "@/lib/validation/engine";
import {
  runReleaseChecklist,
  type ReleaseChecklist,
} from "@/lib/validation/releaseChecklist";
import { getDraftingProvider } from "@/services/ai/drafting";
import type { AnswerMap } from "@/lib/questions/types";
import type { IssueAnalysis } from "@/lib/analysis/types";

export const GENERATION_VERSION = "generation-v1";

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
  };

  const analysis = analyseCase(analysisInput);
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

  // Manual review decided before drafting (scope, unresolved Code, etc.).
  if (analysis.manualReview) {
    return {
      ...base,
      status: "MANUAL_REVIEW",
      body: null,
      reason: analysis.manualReview.reason,
      detail: analysis.manualReview.detail,
    };
  }

  let catalog;
  try {
    catalog = await loadKbCatalog();
  } catch (err) {
    if (err instanceof KbCatalogError) {
      return {
        ...base,
        status: "MANUAL_REVIEW",
        body: null,
        reason: "KB_CATALOG_UNAVAILABLE",
        detail: err.message,
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
    return {
      ...base,
      status: "MANUAL_REVIEW",
      body: null,
      reason: "NO_APPROVED_MODULES",
      detail:
        "No approved knowledge module supports this case on the confirmed facts. A person should review it rather than the system generating an unsupported appeal.",
    };
  }

  const provider = getDraftingProvider();
  const maxAttempts = Math.max(
    1,
    input.maxAttempts ?? (provider.bespoke ? 2 : 1),
  );

  let lastDraft: DraftAppealResult | null = null;
  let regenerationFeedback = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const draft = await draftAppeal({
      ...analysisInput,
      caseId: input.caseId ?? null,
      analysis,
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
       * ANY remaining unreleasable outcome is MANUAL_REVIEW, not FAILED.
       * The customer has paid — an unusable draft must land with a person.
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
        warnings: [...warnings, ...draft.warnings],
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
    };

    const validation = validateDraft(ctx);
    const checklist = runReleaseChecklist(ctx);
    const accepted = validation.status === "PASS" && checklist.passed;
    attempts.push({ attempt, validation, checklist, accepted });

    if (accepted) {
      return {
        ...base,
        status: "READY",
        body: draft.body,
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
        warnings: [
          ...warnings,
          ...draft.warnings,
          ...validation.issues
            .filter((i) => i.severity === "WARNING")
            .map((i) => `[${i.code}] ${i.message}`),
        ],
        reason: null,
        detail: null,
      };
    }

    // Not accepted. Only a bespoke provider can produce different output.
    regenerationFeedback = summariseForRegeneration(validation);
    if (!provider.bespoke || attempt >= maxAttempts) break;
    warnings.push(
      `Attempt ${attempt} rejected by validation; regenerating (${validation.blockingCount} blocking issue(s)).`,
    );
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
    body: null,
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
