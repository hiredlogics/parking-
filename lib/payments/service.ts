import type { SessionData } from "@/lib/auth/session";
import { requireCaseAccess } from "@/lib/cases/service";
import {
  isPaidStep,
  requiresSelfServiceConsent,
  servicePrice,
} from "@/lib/workflow/config";
import { paths, publicUrl } from "@/lib/config/publicUrl";
import { currentLegalVersions } from "@/lib/legal/registry";
import {
  attachPaymentToConsent,
  findUsableConsentForCase,
  recordPurchaseConsent,
} from "@/lib/consent/repo";
import {
  missingConsents,
  type ConsentAuditMeta,
  type ConsentInput,
} from "@/lib/consent/types";
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
 * customer is never charged for a case we cannot prepare — and, for a
 * Self-Service product, unless the three Terms section 16 confirmations
 * have actually been given. The consent check is here rather than in the
 * route handler so no future caller can reach a provider session without
 * passing it.
 */
export async function startCheckout(
  caseId: string,
  session: SessionData,
  options: { consent?: Partial<ConsentInput>; audit?: ConsentAuditMeta } = {},
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
  /*
   * Suitability before money. Sufficiency already refuses an unsuitable
   * document, but a customer must never be able to pay for an appeal we
   * cannot lawfully produce, so the authority is checked directly here.
   */
  const { resolveSuitability } = await import("@/lib/cases/caseIntelligence");
  const { SERVICE_NOT_SUITABLE_DETAIL } = await import(
    "@/lib/cases/documentUnderstanding"
  );
  const suitability = resolveSuitability({
    caseIntelligence: c.caseIntelligence,
    serviceDecision: c.serviceDecision,
    triageServiceDecision: c.extraction?.triage?.serviceDecision ?? null,
    triageDetail: c.extraction?.triage?.detail ?? null,
    outOfScopeDetail: c.outOfScopeDetail,
  });
  if (suitability.decision === "NOT_SUPPORTED") {
    return {
      ok: false,
      status: 409,
      code: "WRONG_DOCUMENT_STAGE",
      message: suitability.detail ?? SERVICE_NOT_SUITABLE_DETAIL,
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

  /*
   * Mandatory pre-payment consent (Terms section 16).
   *
   * An already-recorded consent for this case satisfies the gate, so a
   * customer returning to an abandoned checkout is not asked twice. When
   * there is none, the request must carry all three confirmations as
   * explicit `true` — a missing field is a refusal, and nothing here
   * infers, defaults or accepts on the customer's behalf.
   */
  let consentId: string | null = null;
  if (requiresSelfServiceConsent(c.serviceType)) {
    const existing = await findUsableConsentForCase(caseId);
    if (existing) {
      consentId = existing.id;
    } else {
      const missing = missingConsents(options.consent ?? {});
      if (missing.length > 0) {
        return {
          ok: false,
          status: 409,
          code: "CONSENT_REQUIRED",
          message:
            "Please confirm all three statements before continuing to payment.",
        };
      }
      const versions = currentLegalVersions();
      const recorded = await recordPurchaseConsent({
        caseId,
        customerId: c.customerId,
        serviceType: c.serviceType,
        termsVersion: versions.termsVersion,
        privacyPolicyVersion: versions.privacyVersion,
        consent: options.consent as ConsentInput,
        audit: options.audit,
      });
      consentId = recorded.id;
    }
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
    successUrl: publicUrl(paths.checkoutSuccess(caseId)),
    cancelUrl: publicUrl(paths.checkoutCancel),
  });

  // Tie the consent to the order it authorised, so the record can be
  // produced alongside the payment it belongs to.
  if (consentId) {
    const payment = await repo.findPaymentForCase(caseId);
    await attachPaymentToConsent({
      consentId,
      paymentId: payment?.id ?? null,
      providerSessionId: checkout.providerSessionId,
    });
  }

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
