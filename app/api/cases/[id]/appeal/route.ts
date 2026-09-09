import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { getAppealForCase } from "@/lib/generation/caseGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cases/[id]/appeal
 *
 * The customer's appeal letter. Generates it on first request and
 * returns the stored draft thereafter.
 *
 * Returns 402 for an unpaid case — the entitlement check runs before
 * any generation work, so nothing is drafted and no AI call is made.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const result = await getAppealForCase(id, session);
  if (!result.ok) return failFromAccess(result);
  return ok({ appeal: result.appeal });
}
