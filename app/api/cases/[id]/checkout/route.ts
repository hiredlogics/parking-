import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { startCheckout } from "@/lib/payments/service";
import { addCaseEvent } from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/checkout
 *
 * Creates a provider checkout session. Refused unless the
 * sufficient-information check has passed, so a customer is never
 * charged for a case we cannot prepare.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  if (session.userId) {
    const limited = await (
      await import("@/lib/rateLimit")
    ).enforceRateLimit(session.userId, "CHECKOUT");
    if (limited) return limited;
  }

  const result = await startCheckout(id, session);
  if (!result.ok) return failFromAccess(result);

  await addCaseEvent({
    caseId: id,
    eventType: "PAYMENT_STARTED",
    actorId: session.userId ?? null,
    payload: {
      provider: result.checkout.provider,
      providerSessionId: result.checkout.providerSessionId,
    },
  });

  return ok({ checkout: result.checkout });
}
