import Stripe from "stripe";
import * as repo from "../repo";
import {
  PaymentConfigurationError,
  PaymentSignatureError,
  type CheckoutSession,
  type CreateCheckoutInput,
  type PaymentService,
  type PaymentStatus,
  type PaymentVerification,
  type WebhookResult,
} from "../types";

/**
 * Stripe payment provider.
 *
 * Wired but INACTIVE unless PAYMENT_PROVIDER=stripe. Nothing here runs
 * on the default configuration.
 *
 * The security model the brief demands:
 *   - The Stripe success URL alone NEVER unlocks the appeal. It only
 *     triggers a `verifyPayment()` call, which asks Stripe directly.
 *   - `handleWebhook()` verifies the signature with the endpoint secret
 *     before reading the payload, and rejects an unsigned request.
 *   - Every event is claimed by its Stripe event id first, so a
 *     re-delivery cannot double-process.
 */

const RELEVANT_EVENTS = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
  "charge.refunded",
]);

export class StripePaymentProvider implements PaymentService {
  readonly webhookDriven = true;
  private readonly client: Stripe;
  private readonly webhookSecret: string;

  constructor(opts?: { secretKey?: string; webhookSecret?: string }) {
    const secretKey = opts?.secretKey ?? process.env.STRIPE_SECRET_KEY;
    const webhookSecret =
      opts?.webhookSecret ?? process.env.STRIPE_WEBHOOK_SECRET;

    if (!secretKey || secretKey.trim().length === 0) {
      throw new PaymentConfigurationError(
        "STRIPE_SECRET_KEY is not set. Set it, or use PAYMENT_PROVIDER=demo.",
      );
    }
    if (!webhookSecret || webhookSecret.trim().length === 0) {
      // Refuse to start without it: an unverified webhook is worse than
      // no webhook, because it would let anyone mark a case paid.
      throw new PaymentConfigurationError(
        "STRIPE_WEBHOOK_SECRET is not set. Webhook signature verification is mandatory.",
      );
    }
    this.client = new Stripe(secretKey);
    this.webhookSecret = webhookSecret;
  }

  provider(): string {
    return "stripe";
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const already = await repo.findPaidPaymentForCase(input.caseId);
    if (already) {
      return {
        checkoutUrl: input.successUrl,
        provider: "stripe",
        providerSessionId: already.providerSessionId,
        status: "PAID",
      };
    }

    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      customer_email: input.customerEmail ?? undefined,
      // The case id travels in metadata so the webhook can resolve it
      // without trusting anything from the browser.
      metadata: { caseId: input.caseId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: input.currency.toLowerCase(),
            unit_amount: Math.round(input.amount * 100),
            product_data: { name: input.description },
          },
        },
      ],
    });

    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL.");
    }

    await repo.createPayment({
      caseId: input.caseId,
      provider: "stripe",
      status: "CHECKOUT_CREATED",
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      providerSessionId: session.id,
      checkoutUrl: session.url,
    });

    return {
      checkoutUrl: session.url,
      provider: "stripe",
      providerSessionId: session.id,
      status: "CHECKOUT_CREATED",
    };
  }

  /**
   * Ask Stripe for the authoritative state. This is what runs when the
   * customer returns via the success URL — the URL itself proves nothing.
   */
  async verifyPayment(caseId: string): Promise<PaymentVerification> {
    const payment = await repo.findPaymentForCase(caseId);
    if (!payment?.providerSessionId) {
      return {
        status: payment?.status ?? "UNPAID",
        providerConfirmed: false,
        detail: "No Stripe session recorded for this case.",
      };
    }

    const session = await this.client.checkout.sessions.retrieve(
      payment.providerSessionId,
    );
    const mapped = mapSessionStatus(session);

    if (mapped !== payment.status) {
      await repo.updatePaymentStatus(payment.id, mapped, {
        providerPaymentIntent:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : (session.payment_intent?.id ?? null),
        providerCustomerId:
          typeof session.customer === "string"
            ? session.customer
            : (session.customer?.id ?? null),
      });
    }

    return {
      status: mapped,
      providerConfirmed: mapped === "PAID",
      detail: `Stripe payment_status=${session.payment_status}`,
    };
  }

  async handleWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookResult> {
    if (!signature) {
      throw new PaymentSignatureError("Missing Stripe-Signature header.");
    }

    let event: Stripe.Event;
    try {
      // Throws on any tampering — the raw body must be unparsed.
      event = this.client.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret,
      );
    } catch (err) {
      throw new PaymentSignatureError(
        err instanceof Error ? err.message : "Invalid Stripe signature.",
      );
    }

    if (!RELEVANT_EVENTS.has(event.type)) {
      return {
        handled: false,
        duplicate: false,
        eventId: event.id,
        eventType: event.type,
        caseId: null,
        detail: "Event type not relevant to appeal payments.",
      };
    }

    const caseId = await this.resolveCaseId(event);

    // Claim first: this is the idempotency lock.
    const claimed = await repo.claimWebhookEvent({
      eventId: event.id,
      provider: "stripe",
      eventType: event.type,
      caseId,
      payload: { type: event.type, id: event.id },
    });
    if (!claimed) {
      return {
        handled: true,
        duplicate: true,
        eventId: event.id,
        eventType: event.type,
        caseId,
        detail: "Event already processed.",
      };
    }

    if (!caseId) {
      await repo.completeWebhookEvent(event.id, "NO_CASE");
      return {
        handled: false,
        duplicate: false,
        eventId: event.id,
        eventType: event.type,
        caseId: null,
        detail: "Could not resolve a case for this event.",
      };
    }

    const payment = await repo.findPaymentForCase(caseId);
    if (!payment) {
      await repo.completeWebhookEvent(event.id, "NO_PAYMENT");
      return {
        handled: false,
        duplicate: false,
        eventId: event.id,
        eventType: event.type,
        caseId,
        detail: "No payment record for this case.",
      };
    }

    const status = mapEventStatus(event.type);
    await repo.updatePaymentStatus(payment.id, status, {
      failureReason:
        status === "FAILED" ? `Stripe event ${event.type}` : null,
    });
    await repo.completeWebhookEvent(event.id, status);

    return {
      handled: true,
      duplicate: false,
      eventId: event.id,
      eventType: event.type,
      caseId,
      status,
    };
  }

  async getPaymentStatus(caseId: string): Promise<PaymentStatus> {
    const payment = await repo.findPaymentForCase(caseId);
    return payment?.status ?? "UNPAID";
  }

  /** Prefer metadata; fall back to the recorded session id. */
  private async resolveCaseId(event: Stripe.Event): Promise<string | null> {
    const obj = event.data.object as unknown as Record<string, unknown>;
    const metadata = obj.metadata as Record<string, string> | undefined;
    if (metadata?.caseId) return metadata.caseId;

    const sessionId = typeof obj.id === "string" ? obj.id : null;
    if (sessionId) {
      const bySession = await repo.findPaymentBySession(sessionId);
      if (bySession) return bySession.caseId;
    }
    return null;
  }
}

function mapSessionStatus(session: Stripe.Checkout.Session): PaymentStatus {
  if (session.payment_status === "paid") return "PAID";
  if (session.payment_status === "unpaid") {
    return session.status === "expired" ? "FAILED" : "CHECKOUT_CREATED";
  }
  // "no_payment_required" happens for zero-value sessions.
  if (session.payment_status === "no_payment_required") return "PAID";
  return "PENDING";
}

function mapEventStatus(type: string): PaymentStatus {
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      return "PAID";
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired":
      return "FAILED";
    case "charge.refunded":
      return "REFUNDED";
    default:
      return "PENDING";
  }
}
