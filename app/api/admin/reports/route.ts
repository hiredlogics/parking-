import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { listAllCases } from "@/lib/cases/repo";
import { listAllPayments } from "@/lib/payments/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/reports — case and revenue aggregates from the real
 * appeal-case and payment tables. Admin-only.
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

  const [cases, payments] = await Promise.all([listAllCases(5000), listAllPayments(5000)]);

  const byLifecycle: Record<string, number> = {};
  for (const c of cases) {
    byLifecycle[c.lifecycleStatus] = (byLifecycle[c.lifecycleStatus] ?? 0) + 1;
  }
  const completedCases = byLifecycle.COMPLETED ?? 0;

  const revenue = payments
    .filter((p) => p.status === "PAID")
    .reduce((sum, p) => sum + p.amount, 0);
  const pending = payments
    .filter((p) => p.status === "PENDING" || p.status === "CHECKOUT_CREATED")
    .reduce((sum, p) => sum + p.amount, 0);
  const refunded = payments
    .filter((p) => p.status === "REFUNDED")
    .reduce((sum, p) => sum + p.amount, 0);

  return ok({
    totalCases: cases.length,
    openCases: cases.length - completedCases,
    completedCases,
    revenue,
    pending,
    refunded,
    byLifecycle,
  });
}
