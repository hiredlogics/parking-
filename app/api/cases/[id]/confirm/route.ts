import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok, readJson } from "@/lib/api/envelope";
import {
  confirmFactsForCase,
  getCustomerCaseState,
} from "@/lib/cases/service";
import type { ConfirmedPcn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/cases/[id]/confirm
 *
 * Records the customer-confirmed notice. Only confirmed values may feed
 * the rules and AI pipeline (V2 Part 2 step 4), and corrections are
 * written alongside the original extraction rather than over it.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const body = await readJson<{ confirmed: ConfirmedPcn }>(request);
  if (!body?.confirmed) {
    return fail("BAD_REQUEST", "Confirmed notice details are required.", 400);
  }

  const confirmed: ConfirmedPcn = {
    ...body.confirmed,
    // The server stamps the confirmation time; the client cannot backdate it.
    confirmedAt: new Date().toISOString(),
    // case_stage is durable from document understanding — never reset here.
  };
  // Strip any client attempt to overwrite durable stage.
  if ("case_stage" in confirmed) {
    delete (confirmed as { case_stage?: unknown }).case_stage;
  }

  const saved = await confirmFactsForCase(id, session, confirmed);
  if (!saved.ok) return failFromAccess(saved);

  const state = await getCustomerCaseState(id, session);
  if (!state.ok) return failFromAccess(state);
  return ok({ case: state.state });
}
