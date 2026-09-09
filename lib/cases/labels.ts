import type { AppealCaseStatus, CasePaymentStatus, RouteFamily } from "@/types/caseState";

/**
 * Customer-friendly ground labels.
 *
 * KB §16 rule 7 forbids exposing module IDs, retrieval scores or
 * internal reasoning. Route family identifiers are internal too, so the
 * customer only ever sees these plain-language labels.
 */
const ROUTE_LABELS: Record<RouteFamily, string> = {
  POFA: "Keeper liability has not been established",
  PAYMENT: "Payment was made for the parking",
  KEYING: "Registration was entered incorrectly when paying",
  CONSIDERATION: "Time was needed before parking began",
  GRACE: "Additional time was needed before leaving",
  ANPR: "The camera evidence and recorded duration are disputed",
  AUTHORIZATION: "Permission to park was in place",
  PERMIT: "A permit or entitlement applied",
  BREAKDOWN: "The vehicle could not be moved",
  RESIDENTIAL: "Residential parking rights apply",
  SIGNAGE: "The signage was unclear or inadequate",
  EQUALITY: "Additional time was needed for a disability-related reason",
  HOSPITAL: "The visit was connected with medical attendance",
  LOADING: "The vehicle was loading or unloading",
  DROP_OFF: "The vehicle stopped briefly to drop off or collect",
  EV_CHARGING: "The vehicle was charging",
  INFRASTRUCTURE: "A barrier or access system affected the visit",
  LANDOWNER: "The operator's authority to enforce is questioned",
};

export function routeLabel(route: RouteFamily): string {
  return ROUTE_LABELS[route] ?? "Additional grounds identified";
}

/** Deduplicated, ordered, customer-safe labels. */
export function routeLabels(routes: RouteFamily[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of routes) {
    const label = routeLabel(r);
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * Case status in plain language.
 *
 * Internal state names ("AWAITING_CONFIRMATION", "UNLOCKED") tell a
 * customer nothing, so the portal shows these instead.
 */
const STATUS_LABELS: Record<AppealCaseStatus, string> = {
  DRAFT: "Not started",
  EXTRACTING: "Reading your notice",
  AWAITING_CONFIRMATION: "Check your details",
  QUESTIONING: "A few questions to answer",
  ANALYSING: "Reviewing your case",
  GENERATING: "Preparing your appeal",
  READY_PREVIEW: "Ready to continue",
  AWAITING_PAYMENT: "Ready — payment needed",
  PAID: "Preparing your appeal",
  UNLOCKED: "Appeal ready",
  MANUAL_REVIEW: "With our team",
  OUT_OF_SCOPE: "With our team",
  FAILED: "Needs attention",
};

export function caseStatusLabel(status: AppealCaseStatus): string {
  return STATUS_LABELS[status] ?? "In progress";
}

/** Where the customer should go next for a case in this state. */
export function caseNextStep(
  status: AppealCaseStatus,
  paymentStatus: CasePaymentStatus,
): { label: string; href: (caseId: string) => string } | null {
  if (paymentStatus === "PAID") {
    return { label: "View appeal", href: (id) => `/portal/cases/${id}` };
  }
  switch (status) {
    case "DRAFT":
    case "EXTRACTING":
      return { label: "Upload your notice", href: () => "/appeal/upload" };
    case "AWAITING_CONFIRMATION":
      return { label: "Check your details", href: () => "/appeal/confirm" };
    case "QUESTIONING":
      return { label: "Continue questions", href: () => "/appeal/questions" };
    case "AWAITING_PAYMENT":
    case "READY_PREVIEW":
      return { label: "Continue to checkout", href: (id) => `/checkout/${id}` };
    case "MANUAL_REVIEW":
    case "OUT_OF_SCOPE":
      return null;
    default:
      return { label: "Continue", href: () => "/appeal/review" };
  }
}

/** Payment state in plain language. */
const PAYMENT_LABELS: Record<CasePaymentStatus, string> = {
  NOT_REQUIRED: "No payment needed",
  UNPAID: "Not paid",
  CHECKOUT_CREATED: "Payment started",
  PENDING: "Payment processing",
  PAID: "Paid",
  REFUNDED: "Refunded",
  FAILED: "Payment failed",
};

export function paymentStatusLabel(status: CasePaymentStatus): string {
  return PAYMENT_LABELS[status] ?? "Unknown";
}
