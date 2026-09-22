import { requireAdmin } from "@/lib/auth/require-admin";
import { fail, ok } from "@/lib/api/envelope";
import { findCase } from "@/lib/cases/repo";
import {
  buildCaseIntelligence,
  resolveSuitability,
} from "@/lib/cases/caseIntelligence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cases/[id]/intelligence — internal Case Intelligence view.
 *
 * Admin-only diagnostics. Returns two things side by side:
 *
 *   stored      what was persisted when the case last moved forward,
 *               i.e. what the questions and the drafting actually saw
 *   recomputed  what today's engine derives from the same document
 *
 * When those disagree, the case was assessed by an older engine and the
 * stored record is the one that shaped the journey. That distinction is
 * the whole point of the page — without it "the AI didn't spot the late
 * notice" cannot be told apart from "it spotted it after the fact".
 *
 * Never mounted on a customer surface and never written back: this route
 * only reads.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  const { id } = await ctx.params;
  const appealCase = await findCase(id);
  if (!appealCase) return fail("NOT_FOUND", "Case not found.", 404);

  const understanding = {
    documentType: (appealCase.documentType as never) ?? null,
    senderName: appealCase.senderName,
    parkingOperatorName: appealCase.parkingOperatorName,
    caseStage: (appealCase.caseStage as never) ?? null,
    serviceDecision: (appealCase.serviceDecision as never) ?? null,
  };

  const stored = appealCase.caseIntelligence;
  const recomputed = appealCase.confirmed
    ? buildCaseIntelligence({
        confirmed: appealCase.confirmed,
        answers: appealCase.adaptiveAnswers ?? {},
        evidenceTypes: [],
        documentUnderstanding: understanding,
      })
    : null;

  // The gate the rest of the system reads, resolved exactly as the
  // confirm / payment / generation gates resolve it.
  const suitability = resolveSuitability({
    caseIntelligence: stored,
    serviceDecision: appealCase.serviceDecision,
    outOfScopeDetail: appealCase.outOfScopeDetail,
  });

  return ok({
    caseRef: {
      id: appealCase.id,
      publicId: appealCase.publicId,
      status: appealCase.status,
      sufficiencyStatus: appealCase.sufficiencyStatus,
      paymentStatus: appealCase.paymentStatus,
    },
    documentColumns: {
      documentType: appealCase.documentType,
      senderName: appealCase.senderName,
      parkingOperatorName: appealCase.parkingOperatorName,
      operatorName: appealCase.operatorName,
      caseStage: appealCase.caseStage,
      serviceDecision: appealCase.serviceDecision,
      noticeRoute: appealCase.noticeRoute,
      parkingEventDate: appealCase.parkingEventDate,
      noticeIssueDate: appealCase.noticeIssueDate,
    },
    suitability,
    stored,
    recomputed,
    /* True when the stored record predates the current engine. */
    stale:
      Boolean(stored) &&
      Boolean(recomputed) &&
      stored?.version !== recomputed?.version,
  });
}
