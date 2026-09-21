import { requireAdmin } from "@/lib/auth/require-admin";
import { fail, ok } from "@/lib/api/envelope";
import { listAllPayments } from "@/lib/payments/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/finance — every payment across every customer, from
 * `case_payments` (the rows the payment gate itself writes). Admin-only.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  const payments = await listAllPayments(1000);
  return ok({ payments });
}
