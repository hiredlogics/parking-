import type { SessionData } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/cases/service";
import { isPaidStep, servicePrice } from "@/lib/workflow/config";
import * as repo from "./repo";
import { getPaymentService } from "./index";
import type { CheckoutSession, PaymentStatus } from "./types";

/**
 * Case-scoped payment operations, with ownership enforced.
 *
 * The API routes are thin wrappers around these so the access check and
 * the readiness precondition cannot be skipped.
 */

export type PaymentFailure = {
  ok: false;
  status: 400 | 401 | 402 | 403 | 404 | 409 | 503;
  code: string;
  message: string;
};

export interface PaymentStateView {
  status: PaymentStatus;
  required: boolean;
  amount: number | null;
  currency: string | null;
  description: string | null;
  checkoutUrl: string | null;
  provider: string;
  /** True when a gated step may proceed. */
  entitled: boolean;
}

const APP_URL = () =>
  process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";

/**
 * Start checkout for a case.
 *
 * Refuses unless the sufficient-information check has passed, so a
 * customer cannot be charged for a case we cannot prepare.
 */
export async function startCheckout(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; checkout: CheckoutSession } | PaymentFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access as PaymentFailure;
  const c = access.appealCase;

  if (!isPaidStep(c.serviceType, "ANALYSIS")) {
    return {
      ok: false,
      status: 409,
      code: "PAYMENT_NOT_REQUIRED",
      message: "This service does not require payment.",
    };
  }
  if (c.sufficiencyStatus !== "SUFFICIENT") {
    return {
      ok: false,
      status: 409,
      code: "NOT_READY",
      message:
        "We need a little more information before checkout. Please complete the outstanding items.",
    };
  }
  if (c.outOfScopeDetail) {
    return {
      ok: false,
      status: 409,
      code: "MANUAL_REVIEW",
      message: "This case is with our team for review and cannot be paid for online.",
    };
  }

  const price = servicePrice(c.serviceType);
  const base = APP_URL();
  const svc = getPaymentService();

  // A hosted provider redirects the browser back to us, so it needs an
  // absolute URL. Relative paths only work for the local demo page.
  if (base === "" && svc.provider() !== "demo") {
    return {
      ok: false,
      status: 503,
      code: "APP_URL_NOT_SET",
      message: "Checkout is not configured. Please try again shortly.",
    };
  }

  const checkout = await svc.createCheckout({
    caseId,
    amount: price.amount,
    currency: price.currency,
    description: price.description,
    customerEmail: session.email ?? null,
    // Relative URLs are fine for the demo provider; Stripe needs absolute.
    successUrl: `${base}/checkout/${caseId}/success`,
    cancelUrl: `${base}/appeal/review`,
  });

  return { ok: true, checkout };
}

/**
 * Read payment state, reconciling with the provider first.
 *
 * This is what the return-from-checkout page calls. The redirect itself
 * is never treated as proof of payment.
 */
export async function getPaymentState(
  caseId: string,
  session: SessionData,
  opts: { verify?: boolean } = {},
): Promise<{ ok: true; state: PaymentStateView } | PaymentFailure> {
  const access = await requireCaseAccess(caseId, session, "read");
  if (!access.ok) return access as PaymentFailure;
  const c = access.appealCase;

  const svc = getPaymentService();
  const required = isPaidStep(c.serviceType, "ANALYSIS");

  if (opts.verify && required) {
    // Ask the provider directly and reconcile the database.
    await svc.verifyPayment(caseId);
  }

  const payment = await repo.findPaymentForCase(caseId);
  const status: PaymentStatus = required
    ? (payment?.status ?? "UNPAID")
    : "NOT_REQUIRED";
  const price = required ? servicePrice(c.serviceType) : null;

  return {
    ok: true,
    state: {
      status,
      required,
      amount: payment?.amount ?? price?.amount ?? null,
      currency: payment?.currency ?? price?.currency ?? null,
      description: payment?.description ?? price?.description ?? null,
      checkoutUrl: payment?.checkoutUrl ?? null,
      provider: svc.provider(),
      entitled: !required || status === "PAID",
    },
  };
}
