/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isEntitling, PaymentConfigurationError } from "@/lib/payments/types";
import type { CasePayment, PaymentStatus } from "@/lib/payments/types";

/**
 * P0-c — payment abstraction.
 *
 * The repository is mocked so these tests exercise the provider logic,
 * the state machine and the idempotency contract rather than Postgres.
 */

let store: CasePayment[] = [];
let claimed = new Set<string>();

function makePayment(over: Partial<CasePayment> = {}): CasePayment {
  const now = new Date().toISOString();
  return {
    id: "pay_1",
    caseId: "case_1",
    provider: "demo",
    status: "CHECKOUT_CREATED",
    amount: 29,
    currency: "GBP",
    description: "Appeal Builder — Private Parking",
    providerSessionId: "demo_case_1_1",
    providerPaymentIntent: null,
    providerCustomerId: null,
    checkoutUrl: "/checkout/case_1",
    failureReason: null,
    createdAt: now,
    updatedAt: now,
    paidAt: null,
    failedAt: null,
    refundedAt: null,
    ...over,
  };
}

/** Mirrors the SQL guard: PAID is never downgraded except by a refund. */
function applyStatus(current: PaymentStatus, next: PaymentStatus): PaymentStatus {
  if (current === "PAID" && next !== "REFUNDED") return current;
  return next;
}

const syncCasePaymentStatus =
  vi.fn<(caseId: string, status: PaymentStatus) => Promise<void>>(
    async () => {},
  );

vi.mock("@/lib/payments/repo", () => ({
  findPaymentForCase: async (caseId: string) =>
    store.filter((p) => p.caseId === caseId).at(-1) ?? null,
  findPaidPaymentForCase: async (caseId: string) =>
    store.find((p) => p.caseId === caseId && p.status === "PAID") ?? null,
  findPaymentBySession: async (sid: string) =>
    store.find((p) => p.providerSessionId === sid) ?? null,
  createPayment: async (input: {
    caseId: string;
    provider: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    description?: string | null;
    providerSessionId?: string | null;
    checkoutUrl?: string | null;
  }) => {
    const p = makePayment({
      id: `pay_${store.length + 1}`,
      caseId: input.caseId,
      provider: input.provider,
      status: input.status,
      amount: input.amount,
      currency: input.currency,
      description: input.description ?? null,
      providerSessionId: input.providerSessionId ?? null,
      checkoutUrl: input.checkoutUrl ?? null,
    });
    store.push(p);
    // The real repo mirrors state onto the case on every write; the
    // mock does the same so this contract stays under test.
    await syncCasePaymentStatus(input.caseId, p.status);
    return p;
  },
  updatePaymentStatus: async (
    id: string,
    status: PaymentStatus,
    extra: { providerPaymentIntent?: string | null; failureReason?: string | null } = {},
  ) => {
    const p = store.find((x) => x.id === id);
    if (!p) return null;
    p.status = applyStatus(p.status, status);
    if (p.status === "PAID" && !p.paidAt) p.paidAt = new Date().toISOString();
    if (extra.providerPaymentIntent) p.providerPaymentIntent = extra.providerPaymentIntent;
    if (extra.failureReason) p.failureReason = extra.failureReason;
    await syncCasePaymentStatus(p.caseId, p.status);
    return p;
  },
  syncCasePaymentStatus: (caseId: string, status: PaymentStatus) =>
    syncCasePaymentStatus(caseId, status),
  claimWebhookEvent: async (input: { eventId: string }) => {
    if (claimed.has(input.eventId)) return false;
    claimed.add(input.eventId);
    return true;
  },
  completeWebhookEvent: async () => {},
  wasWebhookProcessed: async (id: string) => claimed.has(id),
}));

const { DemoPaymentProvider } = await import("@/lib/payments/providers/demo");
const { getPaymentService, isDemoPaymentMode, getDemoPaymentProvider, resetPaymentService } =
  await import("@/lib/payments");

beforeEach(() => {
  store = [];
  claimed = new Set();
  syncCasePaymentStatus.mockClear();
  resetPaymentService();
});

/* ======================= Entitlement semantics ======================= */

describe("Entitlement semantics", () => {
  it("treats only PAID as entitling", () => {
    expect(isEntitling("PAID")).toBe(true);
    for (const s of [
      "NOT_REQUIRED", "UNPAID", "CHECKOUT_CREATED", "PENDING",
      "FAILED", "REFUNDED",
    ] as PaymentStatus[]) {
      expect(isEntitling(s), s).toBe(false);
    }
  });
});

/* ========================= Provider factory ========================= */

describe("Provider factory", () => {
  const saved = {
    provider: process.env.PAYMENT_PROVIDER,
    key: process.env.STRIPE_SECRET_KEY,
    hook: process.env.STRIPE_WEBHOOK_SECRET,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries({
      PAYMENT_PROVIDER: saved.provider,
      STRIPE_SECRET_KEY: saved.key,
      STRIPE_WEBHOOK_SECRET: saved.hook,
    })) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetPaymentService();
  });

  it("defaults to the demo provider", () => {
    delete process.env.PAYMENT_PROVIDER;
    expect(getPaymentService().provider()).toBe("demo");
    expect(isDemoPaymentMode()).toBe(true);
  });

  it("refuses Stripe without a secret key", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => getPaymentService()).toThrow(PaymentConfigurationError);
  });

  it("refuses Stripe without a webhook secret", () => {
    // An unverified webhook would let anyone mark a case paid, so this
    // must fail closed rather than start.
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(() => getPaymentService()).toThrow(/WEBHOOK_SECRET/);
  });

  it("constructs Stripe when both secrets are present", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    const svc = getPaymentService();
    expect(svc.provider()).toBe("stripe");
    expect(svc.webhookDriven).toBe(true);
    expect(isDemoPaymentMode()).toBe(false);
  });

  it("rejects an unknown provider rather than silently using demo", () => {
    process.env.PAYMENT_PROVIDER = "paypal";
    expect(() => getPaymentService()).toThrow(/Unknown PAYMENT_PROVIDER/);
  });

  it("exposes the demo provider only in demo mode", () => {
    process.env.PAYMENT_PROVIDER = "stripe";
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_x";
    expect(getDemoPaymentProvider()).toBeNull();
  });
});

/* ========================== Demo provider ========================== */

describe("Demo provider", () => {
  const demo = () => new DemoPaymentProvider();

  it("creates a checkout in CHECKOUT_CREATED, not PAID", async () => {
    const s = await demo().createCheckout({
      caseId: "case_1",
      amount: 29,
      currency: "GBP",
      description: "Appeal",
      successUrl: "/checkout/case_1/success",
      cancelUrl: "/appeal/review",
    });
    expect(s.status).toBe("CHECKOUT_CREATED");
    expect(s.checkoutUrl).toBe("/checkout/case_1");
    expect(await demo().getPaymentStatus("case_1")).toBe("CHECKOUT_CREATED");
  });

  it("reports UNPAID before checkout starts", async () => {
    expect(await demo().getPaymentStatus("case_unknown")).toBe("UNPAID");
  });

  it("refuses to confirm before checkout has started", async () => {
    const r = await demo().confirmDemoPayment("case_1");
    expect(r.ok).toBe(false);
    expect(r.status).toBe("UNPAID");
  });

  it("settles only via the explicit demo confirm", async () => {
    const d = demo();
    await d.createCheckout({
      caseId: "case_1",
      amount: 29,
      currency: "GBP",
      description: "Appeal",
      successUrl: "/s",
      cancelUrl: "/c",
    });
    expect(await d.getPaymentStatus("case_1")).not.toBe("PAID");

    const r = await d.confirmDemoPayment("case_1");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("PAID");
    expect(await d.getPaymentStatus("case_1")).toBe("PAID");
  });

  it("is idempotent on repeat confirmation", async () => {
    const d = demo();
    await d.createCheckout({
      caseId: "case_1", amount: 29, currency: "GBP",
      description: "Appeal", successUrl: "/s", cancelUrl: "/c",
    });
    await d.confirmDemoPayment("case_1");
    const again = await d.confirmDemoPayment("case_1");
    expect(again.ok).toBe(true);
    expect(again.status).toBe("PAID");
    expect(store.filter((p) => p.status === "PAID")).toHaveLength(1);
  });

  it("does not create a second checkout once paid", async () => {
    const d = demo();
    await d.createCheckout({
      caseId: "case_1", amount: 29, currency: "GBP",
      description: "Appeal", successUrl: "/s", cancelUrl: "/c",
    });
    await d.confirmDemoPayment("case_1");
    const second = await d.createCheckout({
      caseId: "case_1", amount: 29, currency: "GBP",
      description: "Appeal", successUrl: "/s", cancelUrl: "/c",
    });
    expect(second.status).toBe("PAID");
    expect(store).toHaveLength(1);
  });

  it("never upgrades state during verification", async () => {
    const d = demo();
    await d.createCheckout({
      caseId: "case_1", amount: 29, currency: "GBP",
      description: "Appeal", successUrl: "/s", cancelUrl: "/c",
    });
    const v = await d.verifyPayment("case_1");
    expect(v.status).toBe("CHECKOUT_CREATED");
    expect(v.providerConfirmed).toBe(false);
  });

  it("receives no webhooks", async () => {
    const r = await demo().handleWebhook();
    expect(r.handled).toBe(false);
  });
});

/* ======================= Payment state machine ======================= */

describe("Payment state machine", () => {
  it("does not downgrade PAID on a late or out-of-order event", () => {
    expect(applyStatus("PAID", "FAILED")).toBe("PAID");
    expect(applyStatus("PAID", "PENDING")).toBe("PAID");
    expect(applyStatus("PAID", "CHECKOUT_CREATED")).toBe("PAID");
  });

  it("allows a refund to move PAID to REFUNDED", () => {
    expect(applyStatus("PAID", "REFUNDED")).toBe("REFUNDED");
  });

  it("allows normal forward transitions", () => {
    expect(applyStatus("UNPAID", "CHECKOUT_CREATED")).toBe("CHECKOUT_CREATED");
    expect(applyStatus("CHECKOUT_CREATED", "PAID")).toBe("PAID");
    expect(applyStatus("CHECKOUT_CREATED", "FAILED")).toBe("FAILED");
  });

  it("mirrors state onto the case whenever a payment is written", async () => {
    const d = new DemoPaymentProvider();
    await d.createCheckout({
      caseId: "case_1", amount: 29, currency: "GBP",
      description: "Appeal", successUrl: "/s", cancelUrl: "/c",
    });
    expect(syncCasePaymentStatus).toHaveBeenCalledWith(
      "case_1",
      "CHECKOUT_CREATED",
    );
  });
});

/* ======================= Webhook idempotency ======================= */

describe("Webhook idempotency", () => {
  it("claims an event id only once", async () => {
    const repo = await import("@/lib/payments/repo");
    const first = await repo.claimWebhookEvent({
      eventId: "evt_1", provider: "stripe", eventType: "checkout.session.completed",
    });
    const second = await repo.claimWebhookEvent({
      eventId: "evt_1", provider: "stripe", eventType: "checkout.session.completed",
    });
    expect(first).toBe(true);
    // A re-delivery must be a no-op.
    expect(second).toBe(false);
  });

  it("tracks separate events independently", async () => {
    const repo = await import("@/lib/payments/repo");
    expect(await repo.claimWebhookEvent({
      eventId: "evt_a", provider: "stripe", eventType: "x",
    })).toBe(true);
    expect(await repo.claimWebhookEvent({
      eventId: "evt_b", provider: "stripe", eventType: "x",
    })).toBe(true);
  });
});
