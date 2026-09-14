import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { findClientById } from "@/lib/db/repos";
import { findCasesForCustomer, listDocumentsForCustomer } from "@/lib/cases/repo";
import { listPaymentsForCustomer } from "@/lib/payments/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/clients/[id] — one customer's real profile: their
 * client row, appeal cases, documents and payments. Admin-only.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  if (!session.userId) {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  if (session.kind === "CUSTOMER") {
    return fail("FORBIDDEN", "Admin access required.", 403);
  }

  const { id } = await ctx.params;
  const client = await findClientById(id);
  if (!client) return fail("NOT_FOUND", "Client not found.", 404);

  const [cases, documents, payments] = await Promise.all([
    findCasesForCustomer(id, 100),
    listDocumentsForCustomer(id),
    listPaymentsForCustomer(id),
  ]);

  return ok({ client, cases, documents, payments });
}
