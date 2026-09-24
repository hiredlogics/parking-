import type { ServiceType } from "@/lib/cases/types";

/**
 * Service-level workflow configuration.
 *
 * The brief is explicit: "Payment placement must NOT be permanently
 * hard-coded into the architecture. Implement payment as a configurable
 * service-level workflow gate."
 *
 * So the pipeline is declared as data per service, and the payment gate
 * is a position within it. A future service (for example council
 * appeals) can place payment somewhere else — or omit it — without any
 * change to the generation code.
 */

export type WorkflowStep =
  | "UPLOAD"
  | "EXTRACTION"
  | "CONFIRMATION"
  | "QUESTIONING"
  | "EVIDENCE"
  | "SUFFICIENCY_CHECK"
  | "PAYMENT"
  | "ANALYSIS"
  | "RETRIEVAL"
  | "DRAFTING"
  | "VALIDATION"
  | "PDF"
  | "DELIVERY";

export interface PaymentGate {
  required: boolean;
  /**
   * The step immediately after which payment is collected. Everything
   * from the next step onwards requires a settled payment.
   */
  afterStep: WorkflowStep | null;
  amount: number;
  currency: string;
  /** Shown on the checkout summary. */
  description: string;
  /**
   * Customer-facing product name, exactly as named in the Terms.
   * e.g. "Private Parking Charge Appeal".
   */
  productName: string;
  /**
   * The verb half of the pay button. The supplied wording differs per
   * product ("Generate My Appeal" vs "Generate My Challenge"), and the
   * price half is derived from `amount` so the two can never disagree.
   */
  actionLabel: string;
  /**
   * Self-Service products (Terms section 16) must collect the three
   * pre-payment confirmations. Anything else must not be gated on them,
   * because the statutory position is different.
   */
  selfService: boolean;
}

export interface ServiceWorkflow {
  serviceType: ServiceType;
  pipeline: WorkflowStep[];
  paymentGate: PaymentGate;
}

/**
 * PRIVATE_PARKING_INITIAL_APPEAL.
 *
 * Payment sits AFTER the sufficient-information check and BEFORE any
 * analysis, retrieval or drafting. Nothing that costs an AI call — and
 * nothing that produces appeal wording — happens before the gate.
 */
const PRIVATE_PARKING_INITIAL_APPEAL: ServiceWorkflow = {
  serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
  pipeline: [
    "UPLOAD",
    "EXTRACTION",
    "CONFIRMATION",
    "QUESTIONING",
    "EVIDENCE",
    "SUFFICIENCY_CHECK",
    "PAYMENT",
    "ANALYSIS",
    "RETRIEVAL",
    "DRAFTING",
    "VALIDATION",
    "PDF",
    "DELIVERY",
  ],
  paymentGate: {
    required: true,
    afterStep: "SUFFICIENCY_CHECK",
    amount: 11.99,
    currency: "GBP",
    description: "Appeal Builder — Private Parking",
    productName: "Private Parking Charge Appeal",
    actionLabel: "Generate My Appeal",
    selfService: true,
  },
};

const WORKFLOWS: Record<ServiceType, ServiceWorkflow> = {
  PRIVATE_PARKING_INITIAL_APPEAL,
};

export function getWorkflow(serviceType: ServiceType): ServiceWorkflow {
  const w = WORKFLOWS[serviceType];
  if (!w) throw new Error(`No workflow configured for service: ${serviceType}`);
  return w;
}

/** The step after which payment is collected, or null when free. */
export function paymentGateStep(
  serviceType: ServiceType,
): WorkflowStep | null {
  const gate = getWorkflow(serviceType).paymentGate;
  return gate.required ? gate.afterStep : null;
}

/**
 * Does `step` sit behind the payment gate?
 *
 * This is the single question the generation layer asks. It must be
 * answered from configuration, never from a hard-coded branch.
 */
export function isPaidStep(
  serviceType: ServiceType,
  step: WorkflowStep,
): boolean {
  const w = getWorkflow(serviceType);
  if (!w.paymentGate.required || !w.paymentGate.afterStep) return false;

  const gateIndex = w.pipeline.indexOf("PAYMENT");
  const stepIndex = w.pipeline.indexOf(step);
  if (gateIndex === -1 || stepIndex === -1) return false;
  return stepIndex > gateIndex;
}

/** Steps a customer may reach without paying. */
export function freeSteps(serviceType: ServiceType): WorkflowStep[] {
  const w = getWorkflow(serviceType);
  return w.pipeline.filter((s) => s !== "PAYMENT" && !isPaidStep(serviceType, s));
}

/** Price for the checkout summary. */
export function servicePrice(serviceType: ServiceType): {
  amount: number;
  currency: string;
  description: string;
} {
  const gate = getWorkflow(serviceType).paymentGate;
  return {
    amount: gate.amount,
    currency: gate.currency,
    description: gate.description,
  };
}

const CURRENCY_SYMBOLS: Record<string, string> = { GBP: "£" };

/** Format a gate amount the way the Terms price list does. */
export function formatServiceAmount(
  amount: number,
  currency: string,
): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? "";
  return `${symbol}${amount.toFixed(2)}`;
}

/**
 * The exact pay-button wording for a service.
 *
 * Composed from configuration rather than hard-coded, so a service with
 * a different price or a different deliverable ("Generate My Challenge")
 * reads correctly without a code change.
 */
export function checkoutButtonLabel(serviceType: ServiceType): string {
  const gate = getWorkflow(serviceType).paymentGate;
  const price = formatServiceAmount(gate.amount, gate.currency);
  return `Pay ${price} & ${gate.actionLabel}`;
}

/** Does this service require the Terms section 16 pre-payment consent? */
export function requiresSelfServiceConsent(serviceType: ServiceType): boolean {
  const gate = getWorkflow(serviceType).paymentGate;
  return gate.required && gate.selfService;
}

/** Customer-facing product name, as named in the Terms. */
export function serviceProductName(serviceType: ServiceType): string {
  return getWorkflow(serviceType).paymentGate.productName;
}
