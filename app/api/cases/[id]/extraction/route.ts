import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok, readJson } from "@/lib/api/envelope";
import {
  getCustomerCaseState,
  saveExtractionForCase,
} from "@/lib/cases/service";
import type { ExtractionResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/cases/[id]/extraction
 *
 * Persists the raw extraction result. Stored exactly as returned so the
 * original remains auditable after the customer corrects it.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const body = await readJson<{ extraction: ExtractionResult }>(request);
  if (!body?.extraction?.raw) {
    return fail("BAD_REQUEST", "An extraction result is required.", 400);
  }

  const saved = await saveExtractionForCase(id, session, body.extraction);
  if (!saved.ok) return failFromAccess(saved);

  const state = await getCustomerCaseState(id, session);
  if (!state.ok) return failFromAccess(state);
  return ok({ case: state.state });
}
