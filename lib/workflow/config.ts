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
