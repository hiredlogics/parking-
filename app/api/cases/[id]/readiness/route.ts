import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { runReadinessCheck } from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/readiness
 *
 * Runs the sufficient-information check and persists the outcome.
 *
 * The response is customer-safe by construction: plain-language ground
 * labels, blocker messages and an evidence summary. It contains no route
 * identifiers, module IDs, fact keys, legal reasoning, confidence
 * scores, validator output — and no appeal wording, because nothing has
 * been drafted at this point in the workflow.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const result = await runReadinessCheck(id, session);
  if (!result.ok) return failFromAccess(result);
  return ok({ readiness: result.readiness });
}
