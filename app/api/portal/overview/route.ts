import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { buildPortalOverview } from "@/lib/portal/overview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/portal/overview
 *
 * Backs My Dashboard, My Cases, My Appeals, My Documents and Invoices
 * from the real case model. Scoped to the signed-in customer.
 *
 * This replaces the V1 CRM demo store those screens previously read,
 * and reads the same tables a future CRM will report from — no parallel
 * data model.
 */
export async function GET() {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();

  const result = await buildPortalOverview(session);
  if (!result.ok) return failFromAccess(result);
  return ok(result.overview);
}
