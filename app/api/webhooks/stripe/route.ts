import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/pool";
import { getPaymentService, isDemoPaymentMode } from "@/lib/payments";
import { PaymentSignatureError } from "@/lib/payments/types";
import { addCaseEvent } from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe
 *
 * The source of truth for production payment state.
 *
 * Notes on correctness:
 *   - The RAW body is required for signature verification, so we read
 *     `request.text()` and never parse it first.
 *   - An invalid or missing signature returns 400 and changes nothing.
 *   - Processing is idempotent: the provider event id is claimed in the
 *     database before any state change, so a re-delivery is a no-op.
 *   - This route is intentionally NOT behind the customer session
 *     middleware; Stripe cannot present a cookie. The signature is the
 *     authentication.
 */
export async function POST(request: Request) {
  if (!hasDb()) {
    // 503 so the provider retries rather than treating it as handled.
    return NextResponse.json(
      { received: false, error: "Database not configured." },
      { status: 503 },
    );
  }

  if (isDemoPaymentMode()) {
    return NextResponse.json(
      { received: false, error: "Stripe is not the active payment provider." },
      { status: 400 },
    );
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  try {
    const svc = getPaymentService();
    const result = await svc.handleWebhook(rawBody, signature);

    if (result.caseId && result.handled && !result.duplicate) {
      await addCaseEvent({
        caseId: result.caseId,
        eventType:
          result.status === "PAID" ? "PAYMENT_CONFIRMED" : "PAYMENT_UPDATED",
        actorId: null,
        payload: {
          provider: "stripe",
          eventId: result.eventId,
          eventType: result.eventType,
          status: result.status,
        },
      });

      if (result.status === "PAID") {
        const caseId = result.caseId;
        void import("@/lib/generation/caseGeneration")
          .then(async ({ generateAppealForCase }) => {
            const { findCase } = await import("@/lib/cases/repo");
            const c = await findCase(caseId);
            if (!c?.customerId) return;
            await generateAppealForCase(caseId, {
              userId: c.customerId,
              kind: "CUSTOMER",
            });
          })
          .catch((err) =>
            console.error("[webhooks/stripe] background generation failed:", err),
          );
      }
    }

    // Always 200 for a verified event, even when not relevant, so the
    // provider stops retrying.
    return NextResponse.json({
      received: true,
      handled: result.handled,
      duplicate: result.duplicate,
    });
  } catch (err) {
    if (err instanceof PaymentSignatureError) {
      // Never log the raw body — it is customer payment data.
      console.error("[webhooks/stripe] signature verification failed");
      return NextResponse.json(
        { received: false, error: "Invalid signature." },
        { status: 400 },
      );
    }
    console.error("[webhooks/stripe] processing failed:", err);
    // 500 so the provider retries; the idempotency lock makes that safe.
    return NextResponse.json(
      { received: false, error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}
