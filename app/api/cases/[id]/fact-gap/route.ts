import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { nextFactQuestion, recordFactAnswer } from "@/lib/cases/factGap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cases/[id]/fact-gap — the one question to ask now.
 * POST /api/cases/[id]/fact-gap — save an answer, get the next question.
 *
 * Replaces the removed `/api/questions/next` and `/api/questions/answer`,
 * and differs from them in the way that matters: those walked a fixed
 * question bank, this asks only what an active issue requires and
 * re-derives the issues after every answer.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const result = await nextFactQuestion(id, session);
  if (!result.ok) {
    if ("status" in result && result.status === 400) {
      return fail(result.code, result.message, 400);
    }
    return failFromAccess(result);
  }
  return ok(result.data);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("BAD_REQUEST", "Invalid JSON body.", 400);
  }

  const factKey = typeof body.factKey === "string" ? body.factKey : "";
  if (!factKey) return fail("BAD_REQUEST", "A factKey is required.", 400);

  const result = await recordFactAnswer(id, session, {
    factKey,
    // `value` is deliberately untyped here: the fact registry decides
    // what this fact accepts, and validateFactAnswer enforces it.
    value: body.value,
  });
  if (!result.ok) {
    if ("status" in result && result.status === 400) {
      return fail(result.code, result.message, 400);
    }
    return failFromAccess(result);
  }
  return ok(result.data);
}
