import * as repo from "../repo";
import type {
  CheckoutSession,
  CreateCheckoutInput,
  PaymentService,
  PaymentStatus,
  PaymentVerification,
  WebhookResult,
} from "../types";

/**
 * Demo payment provider — development and UAT only.
 *
 * It does NOT pretend a real transaction occurred. Settlement happens
 * only when `confirmDemoPayment()` is called from the clearly-named
 * demo-only endpoint, which is itself refused unless
 * PAYMENT_PROVIDER=demo.
 *
 * Even here the rule holds: the browser cannot declare success. It calls
 * an endpoint, and the SERVER writes the state.
 */
export class DemoPaymentProvider implements PaymentService {
  readonly webhookDriven = false;

  provider(): string {
    return "demo";
  }

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const existing = await repo.findPaidPaymentForCase(input.caseId);
    if (existing) {
      return {
        checkoutUrl: input.successUrl,
        provider: "demo",
        providerSessionId: existing.providerSessionId,
        status: "PAID",
      };
    }

    const checkoutUrl = `/checkout/${input.caseId}`;
    const payment = await repo.createPayment({
      caseId: input.caseId,
      provider: "demo",
      status: "CHECKOUT_CREATED",
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      providerSessionId: `demo_${input.caseId}_${Date.now()}`,
      checkoutUrl,
    });

    return {
      checkoutUrl,
      provider: "demo",
      providerSessionId: payment.providerSessionId,
      status: payment.status,
    };
  }

  /**
   * The demo provider has no upstream to query, so verification simply
   * reports what the database already holds. It never upgrades a state.
   */
  async verifyPayment(caseId: string): Promise<PaymentVerification> {
    const payment = await repo.findPaymentForCase(caseId);
    if (!payment) {
      return {
        status: "UNPAID",
        providerConfirmed: false,
        detail: "No payment has been started for this case.",
      };
    }
    return {
      status: payment.status,
      providerConfirmed: payment.status === "PAID",
      detail: "Demo provider — state read from the database.",
    };
  }

  async handleWebhook(): Promise<WebhookResult> {
    return {
      handled: false,
      duplicate: false,
      eventId: null,
      eventType: null,
      caseId: null,
      detail: "The demo provider does not receive webhooks.",
    };
  }

  async getPaymentStatus(caseId: string): Promise<PaymentStatus> {
    const payment = await repo.findPaymentForCase(caseId);
    return payment?.status ?? "UNPAID";
  }

  /**
   * Demo-only settlement. Deliberately NOT part of the PaymentService
   * interface so no shared code path can settle a real payment this way.
   */
  async confirmDemoPayment(
    caseId: string,
  ): Promise<{ ok: boolean; status: PaymentStatus; detail?: string }> {
    const payment = await repo.findPaymentForCase(caseId);
    if (!payment) {
      return {
        ok: false,
        status: "UNPAID",
        detail: "Start checkout before confirming a demo payment.",
      };
    }
    if (payment.status === "PAID") {
      return { ok: true, status: "PAID", detail: "Already paid." };
    }
    const updated = await repo.updatePaymentStatus(payment.id, "PAID", {
      providerPaymentIntent: `demo_intent_${payment.id}`,
    });
    return { ok: true, status: updated?.status ?? "PAID" };
  }
}
