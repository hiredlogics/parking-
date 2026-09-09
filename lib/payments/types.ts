import type { CasePaymentStatus } from "@/types/caseState";

/**
 * PaymentService abstraction (brief TASK 4).
 *
 * Non-negotiable rules encoded by this contract:
 *
 *   - Payment state lives server-side. The frontend never asserts that
 *     payment succeeded.
 *   - Only a provider-verified signal — a signature-verified webhook, or
 *     an explicit query to the provider — may move a case to PAID.
 *   - PAID is the only state that entitles a gated step.
 */

export type PaymentStatus = CasePaymentStatus;

/** The only state that unlocks a gated workflow step. */
export const ENTITLING_STATUS: PaymentStatus = "PAID";

export function isEntitling(status: PaymentStatus): boolean {
  return status === ENTITLING_STATUS;
}

export interface CasePayment {
  id: string;
  caseId: string;
  provider: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  description: string | null;
  providerSessionId: string | null;
  providerPaymentIntent: string | null;
  providerCustomerId: string | null;
  checkoutUrl: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  paidAt: string | null;
  failedAt: string | null;
  refundedAt: string | null;
}

export interface CreateCheckoutInput {
  caseId: string;
  amount: number;
  currency: string;
  description: string;
  customerEmail?: string | null;
  /** Absolute URLs the provider redirects back to. */
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  /** Where the browser should be sent to pay. */
  checkoutUrl: string;
  provider: string;
  /** Provider session reference, null for the demo provider. */
  providerSessionId: string | null;
  status: PaymentStatus;
}

export interface PaymentVerification {
  status: PaymentStatus;
  /** True when the provider itself confirmed settlement. */
  providerConfirmed: boolean;
  detail?: string;
}

export interface WebhookResult {
  handled: boolean;
  /** True when this event had already been processed. */
  duplicate: boolean;
  eventId: string | null;
  eventType: string | null;
  caseId: string | null;
  status?: PaymentStatus;
  detail?: string;
}

export interface PaymentService {
  provider(): string;
  /** True when this provider settles via webhook rather than inline. */
  readonly webhookDriven: boolean;

  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;

  /**
   * Ask the provider for the authoritative state and reconcile the
   * database. Used on return from checkout and as a webhook fallback.
   */
  verifyPayment(caseId: string): Promise<PaymentVerification>;

  /**
   * Process a provider webhook. Implementations MUST verify the
   * signature before trusting the payload, and MUST be idempotent.
   */
  handleWebhook(
    rawBody: string,
    signature: string | null,
  ): Promise<WebhookResult>;

  getPaymentStatus(caseId: string): Promise<PaymentStatus>;
}

export class PaymentConfigurationError extends Error {}
export class PaymentSignatureError extends Error {}
