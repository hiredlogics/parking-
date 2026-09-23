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
import { releaseAppealToCustomer } from "@/lib/appeals/autoRelease";
import { evaluateIssues } from "@/lib/engine/issueEngine";
import { factsForCase } from "@/lib/analysis/engine";
import { FACT, deriveKnownFacts } from "@/lib/facts/facts";
import { admitDocumentFacts } from "@/lib/facts/fromDocuments";
import { ensureAdminConfigSeeded } from "@/lib/config/seedAdminConfig";
import { getServiceByCode } from "@/lib/config/adminRepo";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";

/**
 * Case-scoped generation.
 *
 * Validation PASS → automatic release (PDF + Instructions + email).
 * Validation FAIL / unsafe → MANUAL_REVIEW exception only (admin).
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
 * READY only after auto-release or admin exception approval.
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

  return {
    status: "UNDER_REVIEW",
    paragraphs: [],
    groundLabels: [],
    needsReview: true,
    reviewDetail: "We're preparing your appeal.",
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

  const { SERVICE_NOT_SUITABLE_DETAIL } = await import(
    "@/lib/cases/documentUnderstanding"
  );
  const { resolveSuitability } = await import("@/lib/cases/caseIntelligence");
  const suitability = resolveSuitability({
    caseIntelligence: c.caseIntelligence,
    serviceDecision: c.serviceDecision,
    triageServiceDecision: c.extraction?.triage?.serviceDecision ?? null,
    triageDetail: c.extraction?.triage?.detail ?? null,
    outOfScopeDetail: c.outOfScopeDetail,
  });
  if (suitability.decision === "NOT_SUPPORTED") {
    return {
      ok: false,
      status: 409,
      code: "WRONG_DOCUMENT_STAGE",
      message: suitability.detail ?? SERVICE_NOT_SUITABLE_DETAIL,
    };
  }

  if (!opts.force) {
    const appeal = await findCurrentAppeal(caseId);
    if (appeal?.status === "APPROVED") {
      const existing = await findReleasedDraft(caseId);
      if (existing) return { ok: true, draft: existing, reused: true };
    }
    /*
     * Stuck / pre-auto-release drafts: release them now instead of
     * waiting for an admin Approve click (client: automated product).
     * HELD remains a true human-exception hold.
     */
    if (appeal?.status === "AWAITING_ADMIN_APPROVAL") {
      const hasBody =
        Boolean(appeal.body?.trim()) && (appeal.paragraphs?.length ?? 0) > 0;
      if (hasBody) {
        const released = await releaseAppealToCustomer({
          appealId: appeal.id,
          approvedBy: "SYSTEM",
          eventType: "APPEAL_READY",
        });
        if (released.ok) {
          const existing =
            (await findReleasedDraft(caseId)) ?? (await findCurrentDraft(caseId));
          if (existing) return { ok: true, draft: existing, reused: true };
        }
      } else {
        // Exception draft with no releasable letter — do not burn another AI call.
        const existing = await findCurrentDraft(caseId);
        if (existing) return { ok: true, draft: existing, reused: true };
      }
    }
    if (appeal?.status === "HELD") {
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

  /*
   * What reading the uploaded documents established.
   *
   * Admission re-checks every candidate against the document category's
   * scope and the registry vocabulary, and defers to anything the notice
   * or the customer already said — so this cannot introduce a value the
   * rest of the system does not recognise, and cannot overwrite the
   * customer's own account of what happened.
   */
  const noticeOnlyFacts = deriveKnownFacts({ confirmed: c.confirmed }).values;
  const documentFacts = admitDocumentFacts({
    candidates: docs
      .filter((d) => d.derivedFacts)
      .map((d) => ({
        evidenceType: d.evidenceType ?? "other",
        facts: d.derivedFacts!.candidates.map((cand) => ({
          factKey: cand.factKey,
          value: cand.value as never,
          basis: cand.basis,
          confidence: cand.confidence,
        })),
      })),
    alreadyEstablished: { ...noticeOnlyFacts, ...c.adaptiveAnswers },
  });

  const answersWithDocuments = { ...c.adaptiveAnswers, ...documentFacts.answers };
  if (documentFacts.tags.length > 0) {
    const existing = Array.isArray(answersWithDocuments[FACT.SCENARIOS])
      ? (answersWithDocuments[FACT.SCENARIOS] as string[])
      : [];
    answersWithDocuments[FACT.SCENARIOS] = [
      ...new Set([...existing, ...documentFacts.tags]),
    ].sort();
  }

  /*
   * A case that never went through adaptive questioning (or skipped it)
   * still needs the same "registered keeper, driver not named" safe
   * assumption the question engine would otherwise have asked about —
   * without it, generation has no route to argue and falls through to
   * MANUAL_REVIEW/NO_SUPPORTED_ROUTE. Only fills genuine gaps; a real
   * answer the customer or a document already supplied is untouched.
   */
  const {
    answers: draftingAnswers,
    applied: appliedDefaults,
    answerProvenance: defaultProvenance,
  } = resolveAnswersWithDefaults(
    c.confirmed,
    answersWithDocuments,
    evidenceTypes,
  );

  // A document-read fact must never be recorded as a customer answer.
  const answerProvenance = {
    ...documentFacts.provenance,
    ...defaultProvenance,
  };

  // Refresh intelligence with latest answers before drafting, then reuse analysis.
  const { buildCaseIntelligence } = await import(
    "@/lib/cases/caseIntelligence"
  );
  const intelligence = buildCaseIntelligence({
    confirmed: c.confirmed,
    answers: draftingAnswers,
    evidenceTypes,
    documentUnderstanding: {
      documentType: (c.documentType as never) ?? null,
      senderName: c.senderName,
      parkingOperatorName: c.parkingOperatorName,
      caseStage: (c.caseStage as never) ?? null,
      serviceDecision: (c.serviceDecision as never) ?? null,
    },
    answerProvenance,
  });
  await repo.saveCaseIntelligence(caseId, intelligence);

  const result = await generateValidatedAppeal({
    caseId,
    confirmed: c.confirmed,
    answers: draftingAnswers,
    evidenceTypes,
    evidenceRefs: docs.map((d) => d.id),
    analysis: intelligence.analysis,
    intelligence,
    answerProvenance,
  });

  if (appliedDefaults.length > 0) {
    result.warnings.push(
      `[defaults] generated without adaptive answers for: ${appliedDefaults
        .map((d) => d.factKey)
        .join(", ")} — appeal uses generic, evidence-independent grounds only`,
    );
  }

  const draft = await saveDraft(caseId, result);

  if (result.status === "READY" && result.analysis.primaryRoute) {
    await repo.updateCaseRoutes(caseId, {
      primaryRoute: result.analysis.primaryRoute,
      secondaryRoutes: result.analysis.secondaryRoutes ?? [],
      missingFacts: [],
      pofaRoute: result.analysis.pofa?.route ?? null,
    });
  }

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

  const appealRow = await saveAwaitingApprovalAppeal({
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

  const canAutoRelease =
    result.status === "READY" &&
    Boolean(draft.body?.trim()) &&
    (draft.paragraphs?.length ?? 0) > 0;

  if (canAutoRelease) {
    const released = await releaseAppealToCustomer({
      appealId: appealRow.id,
      approvedBy: "SYSTEM",
      eventType: "APPEAL_READY",
    });
    if (!released.ok) {
      console.error("[caseGeneration] auto-release failed:", released);
      await repo.setCaseStatus(caseId, "MANUAL_REVIEW");
      await repo.setAwaitingAdminApproval(caseId, true);
      await openManualReview({
        caseId,
        reason: released.code,
        detail: released.message,
      });
    }
  } else {
    await repo.setCaseStatus(caseId, "MANUAL_REVIEW");
    await repo.setAwaitingAdminApproval(caseId, true);
    await repo.addCaseEvent({
      caseId,
      eventType: "APPEAL_MANUAL_REVIEW",
      actorId: session.userId ?? null,
      payload: {
        draftStatus: result.status,
        draftVersion: draft.version,
        reason: result.reason,
      },
    });
    try {
      await insertAuditEvent({
        eventType: "APPEAL_MANUAL_REVIEW",
        caseId,
        actorId: session.userId ?? null,
        payload: {
          draftStatus: result.status,
          reason: result.reason,
          moduleIds: result.moduleIds,
          draftId: draft.id,
        },
      });
      await openManualReview({
        caseId,
        reason: result.reason ?? "VALIDATION_FAILED",
        detail: result.detail,
      });
    } catch (err) {
      console.error("[caseGeneration] manual review bookkeeping failed:", err);
    }
  }

  return { ok: true, draft, reused: false };
}

/**
 * Customer appeal view — generates (and auto-releases on PASS) when paid.
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
