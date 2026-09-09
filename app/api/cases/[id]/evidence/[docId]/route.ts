import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import {
  getCustomerCaseState,
  removeEvidenceFromCase,
} from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/cases/[id]/evidence/[docId]
 *
 * Soft-deletes an evidence item. The service verifies both case
 * ownership and that the document belongs to that case, so a document id
 * from another customer's case cannot be removed.
 */
export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id, docId } = await ctx.params;

  const removed = await removeEvidenceFromCase(id, session, docId);
  if (!removed.ok) return failFromAccess(removed);

  const state = await getCustomerCaseState(id, session);
  if (!state.ok) return failFromAccess(state);
  return ok({ case: state.state });
}
