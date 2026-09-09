import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { requireCaseAccess } from "@/lib/cases/service";
import { addCaseEvent } from "@/lib/cases/repo";
import { getDemoPaymentProvider, isDemoPaymentMode } from "@/lib/payments";
import { getPaymentState } from "@/lib/payments/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/payment/confirm-demo
 *
 * DEMO ONLY. Settles a demo payment server-side.
 *
 * Refused outright unless PAYMENT_PROVIDER=demo, so this route can
 * never settle a real payment. Note the browser still does not declare
 * success — it asks the server, and the server writes the state.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);

  if (!isDemoPaymentMode()) {
    return fail(
      "DEMO_PAYMENTS_DISABLED",
      "Demo payment confirmation is disabled. Complete payment through the provider.",
      403,
    );
  }

  const session = await getSession();
  const { id } = await ctx.params;

  const access = await requireCaseAccess(id, session, "write");
  if (!access.ok) return failFromAccess(access);

  const demo = getDemoPaymentProvider();
  if (!demo) {
    return fail(
      "DEMO_PAYMENTS_DISABLED",
      "Demo payment provider is not active.",
      403,
    );
  }

  const confirmed = await demo.confirmDemoPayment(id);
  if (!confirmed.ok) {
    return fail(
      "PAYMENT_NOT_STARTED",
      confirmed.detail ?? "Start checkout before confirming payment.",
      409,
    );
  }

  await addCaseEvent({
    caseId: id,
    eventType: "PAYMENT_CONFIRMED",
    actorId: session.userId ?? null,
    payload: { provider: "demo", status: confirmed.status },
  });

  const state = await getPaymentState(id, session);
  if (!state.ok) return failFromAccess(state);
  return ok({ payment: state.state });
}
