import { requireAdmin } from "@/lib/auth/require-admin";
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
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

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
