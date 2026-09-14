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
import { saveAwaitingApprovalAppeal, findCurrentAppeal } from "@/lib/appeals/repo";
import { evaluateIssues } from "@/lib/engine/issueEngine";
import { factsForCase } from "@/lib/analysis/engine";
import { ensureAdminConfigSeeded } from "@/lib/config/seedAdminConfig";
import { getServiceByCode } from "@/lib/config/adminRepo";

/**
 * Case-scoped generation.
 *
 * Phase 2 change: a successful generation does NOT release the PDF to
 * the customer. It creates a first-class APPEAL in
 * AWAITING_ADMIN_APPROVAL. Admin APPROVE is the release gate.
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
  /** Customer-safe status only. */
  status: "UNDER_REVIEW" | "READY" | "FAILED";
  paragraphs: { id: string; text: string }[];
  groundLabels: string[];
  needsReview: boolean;
  /** Always plain English — never validator/module codes. */
  reviewDetail: string | null;
  generatedAt: string;
}

/**
 * Project appeal state for the customer.
 *
 * Before admin approval: UNDER_REVIEW with a plain message.
 * After approval: READY with paragraphs.
 */
export function toCustomerView(
  draft: AppealDraftRow,
  opts: {
    approved?: boolean;
    approvedParagraphs?: Array<{ id: string; text: string }>;
  } = {},
): CustomerAppealView {
  const routes = [
    draft.primaryRoute,
    ...(Array.isArray(draft.secondaryRoutes) ? draft.secondaryRoutes : []),
  ].filter(Boolean) as RouteFamily[];

  if (opts.approved) {
    const paragraphs =
      opts.approvedParagraphs && opts.approvedParagraphs.length > 0
        ? opts.approvedParagraphs
        : Array.isArray(draft.paragraphs)
          ? draft.paragraphs
          : [];
    if (paragraphs.length > 0) {
      return {
        status: "READY",
        paragraphs,
        groundLabels: routeLabels(routes),
        needsReview: false,
        reviewDetail: null,
        generatedAt: draft.createdAt,
      };
    }
  }

  // Awaiting admin — never leak engine details.
  return {
    status: "UNDER_REVIEW",
    paragraphs: [],
    groundLabels: [],
    needsReview: true,
    reviewDetail: "We're reviewing your appeal.",
    generatedAt: draft.createdAt,
  };
}

export async function generateAppealForCase(
  caseId: string,
  session: SessionData,
  opts: { force?: boolean } = {},
): Promise<{ ok: true; draft: AppealDraftRow; reused: boolean } | GenerationFailure> {
  const entitled = await requireStepEntitlement(caseId, session, "DRAFTING");
  if (!entitled.ok) return entitled;
  const c = entitled.appealCase;

  // If already approved, return the released draft.
  if (!opts.force) {
    const appeal = await findCurrentAppeal(caseId);
    if (appeal?.status === "APPROVED") {
      const existing = await findReleasedDraft(caseId);
      if (existing) return { ok: true, draft: existing, reused: true };
    }
    // If awaiting approval and not forcing regen, reuse current draft.
    if (appeal?.status === "AWAITING_ADMIN_APPROVAL" || appeal?.status === "HELD") {
      const existing = await findCurrentDraft(caseId);
      if (existing) return { ok: true, draft: existing, reused: true };
    }
  }

  if (!c.confirmed) {
    return {
      ok: false,
      status: 409,
      code: "CONFIRMATION_REQUIRED",
      message: "The notice details must be confirmed before an appeal is prepared.",
    };
  }

  await ensureAdminConfigSeeded();

  const docs = await repo.listCaseDocuments(caseId, "EVIDENCE");
  const evidenceTypes = docs.map((d) => d.evidenceType ?? "other");

  const result = await generateValidatedAppeal({
    caseId,
    confirmed: c.confirmed,
    answers: c.adaptiveAnswers,
    evidenceTypes,
    evidenceRefs: docs.map((d) => d.id),
  });

  const draft = await saveDraft(caseId, result);

  const facts = factsForCase({
    confirmed: c.confirmed,
    answers: c.adaptiveAnswers,
    evidenceTypes,
  });
  const issueEval = await evaluateIssues({
    serviceCode: c.serviceType,
    facts,
    evidenceTypes,
  });
  const service = await getServiceByCode(c.serviceType);

  // Even a validator-blocked draft goes to admin review — not auto-fail
  // in front of the customer. Admin sees validation detail.
  await saveAwaitingApprovalAppeal({
    caseId,
    serviceId: service?.id ?? null,
    body: draft.body,
    paragraphs: draft.paragraphs ?? [],
    issuesJson: issueEval.activeIssues,
    factsSnapshot: Object.fromEntries(
      Object.entries(c.adaptiveAnswers).filter(([k]) => !k.startsWith("__")),
    ),
    knowledgeSnapshot: (result.moduleIds ?? []).map((id) => ({ moduleId: id })),
    moduleIds: result.moduleIds ?? [],
    validationJson: result.attempts[result.attempts.length - 1]?.validation ?? null,
    checklistJson: result.attempts[result.attempts.length - 1]?.checklist ?? null,
    warnings: result.warnings ?? [],
    promptVersion: result.provider?.promptVersion ?? null,
    generationVersion: result.generationVersion,
    providerId: result.provider?.providerId ?? null,
    model: result.provider?.model ?? null,
    sourceDraftId: draft.id,
  });

  await repo.setCaseStatus(caseId, "AWAITING_ADMIN_APPROVAL");
  await repo.setAwaitingAdminApproval(caseId, true);

  await repo.addCaseEvent({
    caseId,
    eventType: "APPEAL_AWAITING_ADMIN_APPROVAL",
    actorId: session.userId ?? null,
    payload: {
      draftStatus: result.status,
      draftVersion: draft.version,
      moduleCount: result.moduleIds.length,
      issueCodes: issueEval.activeIssues.map((i) => i.code),
    },
  });

  try {
    await insertAuditEvent({
      eventType: "APPEAL_AWAITING_ADMIN_APPROVAL",
      caseId,
      actorId: session.userId ?? null,
      payload: {
        draftStatus: result.status,
        reason: result.reason,
        moduleIds: result.moduleIds,
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
 * Customer appeal view — generation may run, but PDF is not released
 * until admin approval.
 */
export async function getAppealForCase(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; appeal: CustomerAppealView } | GenerationFailure> {
  const generated = await generateAppealForCase(caseId, session);
  if (!generated.ok) return generated;

  const appeal = await findCurrentAppeal(caseId);
  const approved = appeal?.status === "APPROVED";
  const approvedParagraphs =
    appeal?.approvedParagraphs ?? appeal?.paragraphs ?? undefined;

  // Only after approval: ensure PDF exists (from approved text path).
  // Customer getAppeal must NOT trigger PDF creation for awaiting cases.
  if (approved) {
    try {
      const { ensureFinalAppealDocument } = await import(
        "@/lib/cases/finalDocument"
      );
      await ensureFinalAppealDocument(caseId, session);
    } catch (err) {
      console.error("[caseGeneration] final document not created:", err);
    }
  }

  return {
    ok: true,
    appeal: toCustomerView(generated.draft, {
      approved,
      approvedParagraphs,
    }),
  };
}

export async function peekDraft(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; draft: AppealDraftRow | null } | GenerationFailure> {
  const entitled = await requireStepEntitlement(caseId, session, "DRAFTING");
  if (!entitled.ok) return entitled;
  return { ok: true, draft: await findCurrentDraft(caseId) };
}
