import type { SessionData } from "@/lib/auth/session";
import { requireStepEntitlement, type AccessFailure } from "@/lib/cases/service";
import * as repo from "@/lib/cases/repo";
import {
  findCurrentDraft,
  findReleasedDraft,
  saveDraft,
  type AppealDraftRow,
} from "@/lib/cases/draftRepo";
import { generateValidatedAppeal } from "./engine";
import { openManualReview } from "./manualReview";
import { insertAuditEvent } from "@/lib/kb/audit";
import { routeLabels } from "@/lib/cases/labels";
import type { RouteFamily } from "@/types/caseState";

/**
 * Case-scoped generation — the only way the V2 pipeline runs for a
 * real customer.
 *
 * Two guarantees this layer exists to provide:
 *
 *   1. Generation is behind the server-side entitlement check. The
 *      DRAFTING step sits after PAYMENT in the service workflow, so an
 *      unpaid case gets 402 and no AI call is made.
 *   2. A case is generated once. A repeat request returns the stored
 *      draft rather than re-running the pipeline, so a refresh cannot
 *      change the customer's wording or spend another AI call.
 */

export type PaymentRequired = {
  ok: false;
  status: 402;
  code: "PAYMENT_REQUIRED";
  message: string;
};

export type GenerationFailure = AccessFailure | PaymentRequired | {
  ok: false;
  status: 409;
  code: string;
  message: string;
};

export interface CustomerAppealView {
  status: "READY" | "MANUAL_REVIEW" | "FAILED";
  /** Full letter text. Present only when READY. */
  paragraphs: { id: string; text: string }[];
  /** Customer-friendly grounds. Never route identifiers. */
  groundLabels: string[];
  needsReview: boolean;
  reviewDetail: string | null;
  generatedAt: string;
}

/**
 * Project a stored draft into the customer-safe shape.
 *
 * KB §16 rule 7: module IDs, retrieval scores, internal reasoning and
 * validator output must never reach the customer. Only the letter and
 * friendly ground labels cross this boundary.
 */
export function toCustomerView(draft: AppealDraftRow): CustomerAppealView {
  // Defensive: a paid customer's appeal view must not crash because a
  // column is absent or malformed.
  const routes = [
    draft.primaryRoute,
    ...(Array.isArray(draft.secondaryRoutes) ? draft.secondaryRoutes : []),
  ].filter(Boolean) as RouteFamily[];

  return {
    status: draft.status,
    paragraphs:
      draft.status === "READY" && Array.isArray(draft.paragraphs)
        ? draft.paragraphs
        : [],
    groundLabels: draft.status === "READY" ? routeLabels(routes) : [],
    // Anything not released needs a person, whatever the internal code.
    needsReview: draft.status !== "READY",
    reviewDetail: draft.status === "READY" ? null : draft.blockDetail,
    generatedAt: draft.createdAt,
  };
}

/**
 * Generate (or return) the validated appeal for a case.
 *
 * `force` re-runs the pipeline and supersedes the current draft. It is
 * for admin remediation, not the customer path.
 */
export async function generateAppealForCase(
  caseId: string,
  session: SessionData,
  opts: { force?: boolean } = {},
): Promise<{ ok: true; draft: AppealDraftRow; reused: boolean } | GenerationFailure> {
  // Entitlement first — before any work, and certainly before any AI call.
  const entitled = await requireStepEntitlement(caseId, session, "DRAFTING");
  if (!entitled.ok) return entitled;
  const c = entitled.appealCase;

  if (!opts.force) {
    const existing = await findReleasedDraft(caseId);
    if (existing) return { ok: true, draft: existing, reused: true };
  }

  if (!c.confirmed) {
    return {
      ok: false,
      status: 409,
      code: "CONFIRMATION_REQUIRED",
      message: "The notice details must be confirmed before an appeal is prepared.",
    };
  }

  const docs = await repo.listCaseDocuments(caseId, "EVIDENCE");
  const evidenceTypes = docs.map((d) => d.evidenceType ?? "other");

  const result = await generateValidatedAppeal({
    confirmed: c.confirmed,
    answers: c.adaptiveAnswers,
    evidenceTypes,
    evidenceRefs: docs.map((d) => d.id),
  });

  const draft = await saveDraft(caseId, result);

  // UNLOCKED is the post-payment terminal state: paid for and released.
  await repo.setCaseStatus(
    caseId,
    result.status === "READY" ? "UNLOCKED" : "MANUAL_REVIEW",
  );

  // Releasing the appeal completes the initial journey. This starts the
  // clock for asking whether an outcome arrived; it is idempotent, so a
  // regeneration cannot shift the follow-up window.
  if (result.status === "READY") {
    await repo.markSubmitted(caseId);
  }

  await repo.addCaseEvent({
    caseId,
    eventType:
      result.status === "READY" ? "APPEAL_GENERATED" : "MANUAL_REVIEW_OPENED",
    actorId: session.userId ?? null,
    payload: {
      status: result.status,
      reason: result.reason,
      draftVersion: draft.version,
      moduleCount: result.moduleIds.length,
      provider: result.provider?.providerId ?? null,
      bespoke: result.provider?.bespoke ?? false,
      attempts: result.attempts.length,
    },
  });

  // Audit and review bookkeeping must not lose a successful generation.
  try {
    await insertAuditEvent({
      eventType:
        result.status === "READY"
          ? "VALIDATION_COMPLETED"
          : "MANUAL_REVIEW_REQUESTED",
      caseId,
      actorId: session.userId ?? null,
      payload: {
        status: result.status,
        reason: result.reason,
        primaryRoute: result.analysis.primaryRoute,
        moduleIds: result.moduleIds,
        provider: result.provider?.providerId ?? null,
        promptVersion: result.provider?.promptVersion ?? null,
        generationVersion: result.generationVersion,
        draftId: draft.id,
      },
    });
    if (result.status !== "READY") {
      await openManualReview({
        caseId,
        reason: result.reason ?? "VALIDATION_FAILED",
        detail: result.detail,
      });
    }
  } catch (err) {
    console.error("[caseGeneration] audit/review bookkeeping failed:", err);
  }

  return { ok: true, draft, reused: false };
}

/**
 * Read the customer's appeal, generating it on first request.
 *
 * The gate is enforced inside `generateAppealForCase`, so this cannot
 * return letter text for an unpaid case.
 */
export async function getAppealForCase(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; appeal: CustomerAppealView } | GenerationFailure> {
  const generated = await generateAppealForCase(caseId, session);
  if (!generated.ok) return generated;

  /*
   * Render and store the final PDF as soon as the appeal is released,
   * so it appears in My Documents without waiting for a download.
   *
   * Deliberately non-fatal: a rendering or storage problem must not
   * withhold the appeal the customer has paid for. The validated draft
   * is already persisted, so the PDF is retried from it on the next
   * request — drafting never re-runs.
   */
  if (generated.draft.status === "READY") {
    try {
      const { ensureFinalAppealDocument } = await import(
        "@/lib/cases/finalDocument"
      );
      await ensureFinalAppealDocument(caseId, session);
    } catch (err) {
      console.error("[caseGeneration] final document not created:", err);
    }
  }

  return { ok: true, appeal: toCustomerView(generated.draft) };
}

/** Current draft without triggering generation. Null when none exists. */
export async function peekDraft(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; draft: AppealDraftRow | null } | GenerationFailure> {
  const entitled = await requireStepEntitlement(caseId, session, "DRAFTING");
  if (!entitled.ok) return entitled;
  return { ok: true, draft: await findCurrentDraft(caseId) };
}
