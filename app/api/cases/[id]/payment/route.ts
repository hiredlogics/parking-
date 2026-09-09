import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { getPaymentState } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cases/[id]/payment?verify=1
 *
 * Reports payment state. With `verify=1` the provider is queried first
 * and the database reconciled — this is what the return-from-checkout
 * page calls, because the redirect itself proves nothing.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const verify = new URL(request.url).searchParams.get("verify") === "1";
  const result = await getPaymentState(id, session, { verify });
  if (!result.ok) return failFromAccess(result);
  return ok({ payment: result.state });
}
