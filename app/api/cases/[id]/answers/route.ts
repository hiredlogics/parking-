import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok, readJson } from "@/lib/api/envelope";
import { recordAnswerForCase } from "@/lib/cases/service";
import type { AnswerValue } from "@/lib/facts/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/answers
 *
 * Records one adaptive answer and returns the next question.
 *
 * The client sends only a question id and a value — the server owns the
 * answer map, so a caller cannot inject facts for questions that were
 * never asked.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const body = await readJson<{ questionId: string; value: AnswerValue }>(request);
  if (!body?.questionId) {
    return fail("BAD_REQUEST", "A questionId is required.", 400);
  }

  const result = await recordAnswerForCase(
    id,
    session,
    body.questionId,
    body.value ?? null,
  );
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
