import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { correctRegisteredKeeperForCase } from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/answers/correct-keeper
 *
 * Customer corrected "not the registered keeper" → Yes, then continue
 * the adaptive question chain.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const result = await correctRegisteredKeeperForCase(id, session);
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
