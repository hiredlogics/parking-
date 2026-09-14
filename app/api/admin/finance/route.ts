import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { listAllPayments } from "@/lib/payments/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance — every payment across every customer, from
 * `case_payments` (the rows the payment gate itself writes). Admin-only.
 */
export async function GET() {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  if (!session.userId) {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  if (session.kind === "CUSTOMER") {
    return fail("FORBIDDEN", "Admin access required.", 403);
  }

  const payments = await listAllPayments(1000);
  return ok({ payments });
}
