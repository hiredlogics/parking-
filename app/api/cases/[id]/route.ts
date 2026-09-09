import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { getCustomerCaseState } from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/cases/[id] — customer-safe case state for resume. */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const state = await getCustomerCaseState(id, session);
  if (!state.ok) return failFromAccess(state);
  return ok({ case: state.state });
}
