import { paymentsEnabled, refuseInProduction } from "@/lib/config/production";
import { DemoPaymentProvider } from "./providers/demo";
import { StripePaymentProvider } from "./providers/stripe";
import { PaymentConfigurationError, type PaymentService } from "./types";

let cached: PaymentService | null = null;

/**
 * Payment provider factory.
 *
 *   PAYMENT_PROVIDER=demo    (default) development / UAT
 *   PAYMENT_PROVIDER=stripe            production
 *
 * Demo is the default deliberately: Stripe must be opted into
 * explicitly, and it refuses to construct without both
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET — an unverified webhook
 * would let anyone mark a case as paid.
 */
export function getPaymentService(): PaymentService {
  if (cached) return cached;
  const configured = (process.env.PAYMENT_PROVIDER ?? "demo").toLowerCase();

  if (configured === "stripe") {
    cached = new StripePaymentProvider();
    return cached;
  }
  if (configured !== "demo") {
    throw new PaymentConfigurationError(
      `Unknown PAYMENT_PROVIDER "${configured}". Use "demo" or "stripe".`,
    );
  }

  /*
   * The demo provider settles a case as PAID for free. Being the default
   * meant a production deploy that forgot PAYMENT_PROVIDER would give
   * appeals away, so production must opt into it explicitly instead.
   */
  if (paymentsEnabled()) {
    refuseInProduction(
      "PAYMENT_PROVIDER",
      "The demo payment provider would give appeals away free. Set PAYMENT_PROVIDER=stripe, or PAYMENTS_ENABLED=false to run deliberately without payment.",
    );
  }

  cached = new DemoPaymentProvider();
  return cached;
}

/** True when the demo provider is active. Guards demo-only endpoints. */
export function isDemoPaymentMode(): boolean {
  return (process.env.PAYMENT_PROVIDER ?? "demo").toLowerCase() === "demo";
}

/**
 * The demo provider, or null when not in demo mode. Used by the
 * demo-only confirm endpoint so real payments can never be settled
 * through that route.
 */
export function getDemoPaymentProvider(): DemoPaymentProvider | null {
  if (!isDemoPaymentMode()) return null;
  const svc = getPaymentService();
  return svc instanceof DemoPaymentProvider ? svc : null;
}

/** Reset the cached provider — tests only. */
export function resetPaymentService(): void {
  cached = null;
}

export { DemoPaymentProvider, StripePaymentProvider };
export * from "./types";
