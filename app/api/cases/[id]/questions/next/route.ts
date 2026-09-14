import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { nextQuestionForCase } from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/questions/next
 *
 * Returns at most ONE question, generated for this specific case and
 * persisted server-side.
 *
 * POST rather than GET because resolving a question can call the model
 * and always writes a row. It is still idempotent: an unanswered
 * question is served again rather than regenerated.
 *
 * The response is customer-safe — no route identifiers, no reason
 * codes, no fact keys, no requirement internals.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  if (session.userId) {
    const limited = await (
      await import("@/lib/rateLimit")
    ).enforceRateLimit(session.userId, "QUESTION");
    if (limited) return limited;
  }

  const result = await nextQuestionForCase(id, session);
  if (!result.ok) return failFromAccess(result);

  const n = result.next;
  return ok({
    questioningComplete: n.questioningComplete,
    question: n.question,
    answered: n.answered,
    outstandingCount: n.outstandingCount,
    outOfScope: n.outOfScope,
    needsReview: n.needsReview,
  });
}
