import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { findCase, listCaseDocuments, listCaseEvents } from "@/lib/cases/repo";
import { listCaseQuestions } from "@/lib/cases/questionRepo";
import { listDraftsForCase } from "@/lib/cases/draftRepo";
import { findPaymentForCase } from "@/lib/payments/repo";
import { findCurrentAppeal } from "@/lib/appeals/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cases/[id] — full internal view of one appeal case.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  if (!session.userId) {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  if (session.kind === "CUSTOMER") {
    return fail("FORBIDDEN", "Admin access required.", 403);
  }

  const { id } = await ctx.params;
  const appealCase = await findCase(id);
  if (!appealCase) return fail("NOT_FOUND", "Case not found.", 404);

  const [documents, events, questions, drafts, payment, currentAppeal] =
    await Promise.all([
      listCaseDocuments(id),
      listCaseEvents(id),
      listCaseQuestions(id),
      listDraftsForCase(id),
      findPaymentForCase(id),
      findCurrentAppeal(id),
    ]);

  return ok({
    case: appealCase,
    documents,
    events,
    questions: questions.map((q) => ({
      seq: q.seq,
      label: q.label,
      targetFact: q.targetFact,
      reasonCode: q.reasonCode,
      route: q.route,
      origin: q.origin,
      model: q.model,
      promptVersion: q.promptVersion,
      rejections: q.rejections,
      answer: q.answer,
      askedAt: q.askedAt,
      answeredAt: q.answeredAt,
    })),
    drafts: drafts.map((d) => ({
      id: d.id,
      version: d.version,
      status: d.status,
      moduleIds: d.moduleIds,
      primaryRoute: d.primaryRoute,
      providerId: d.providerId,
      model: d.model,
      bespoke: d.bespoke,
      validation: d.validation,
      checklist: d.checklist,
      warnings: d.warnings,
      blockReason: d.blockReason,
      blockDetail: d.blockDetail,
      createdAt: d.createdAt,
      supersededAt: d.supersededAt,
    })),
    payment,
    currentAppeal: currentAppeal
      ? {
          id: currentAppeal.id,
          status: currentAppeal.status,
          version: currentAppeal.version,
          body: currentAppeal.body,
          paragraphs: currentAppeal.paragraphs,
          moduleIds: currentAppeal.moduleIds,
          issuesJson: currentAppeal.issuesJson,
          createdAt: currentAppeal.createdAt,
          approvedAt: currentAppeal.approvedAt,
        }
      : null,
  });
}
