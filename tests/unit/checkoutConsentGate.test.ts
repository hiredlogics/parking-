/**
 * @vitest-environment node
 *
 * Server-side enforcement of the pre-payment consent.
 *
 * These exercise `startCheckout` directly — the layer every route and
 * future caller goes through — so they prove the gate holds for a direct
 * API call, not merely for a browser with a disabled button.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const recordPurchaseConsent = vi.fn();
const findUsableConsentForCase = vi.fn();
const attachPaymentToConsent = vi.fn();
const createCheckout = vi.fn();

const APPEAL_CASE = {
  id: "case_1",
  customerId: "cust_1",
  serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
  sufficiencyStatus: "SUFFICIENT",
  outOfScopeReason: null,
  outOfScopeDetail: null,
  documentType: "PCN",
  senderName: null,
  parkingOperatorName: "Euro Car Parks",
  caseStage: "INITIAL_OPERATOR_APPEAL",
  serviceDecision: "SUPPORTED",
};

vi.mock("@/lib/cases/service", () => ({
  requireCaseAccess: vi.fn(async () => ({ ok: true, appealCase: APPEAL_CASE })),
}));

vi.mock("@/lib/consent/repo", () => ({
  recordPurchaseConsent,
  findUsableConsentForCase,
  attachPaymentToConsent,
}));

vi.mock("@/lib/payments/repo", () => ({
  findPaymentForCase: vi.fn(async () => ({ id: "pay_1" })),
}));

vi.mock("@/lib/payments/index", () => ({
  getPaymentService: () => ({
    provider: () => "demo",
    createCheckout,
  }),
}));

vi.mock("@/lib/cases/caseIntelligence", () => ({
  resolveSuitability: () => ({ decision: "SUPPORTED", detail: null }),
}));

vi.mock(import("@/lib/cases/documentUnderstanding"), async (importOriginal) => ({
  ...(await importOriginal()),
}));

const SESSION = { userId: "cust_1", email: "a@b.co" } as never;

async function startCheckout(
  ...args: Parameters<
    typeof import("@/lib/payments/service").startCheckout
  >
) {
  const mod = await import("@/lib/payments/service");
  return mod.startCheckout(...args);
}

beforeEach(() => {
  vi.clearAllMocks();
  findUsableConsentForCase.mockResolvedValue(null);
  recordPurchaseConsent.mockResolvedValue({ id: "csnt_1" });
  createCheckout.mockResolvedValue({
    checkoutUrl: "/checkout/case_1",
    provider: "demo",
    providerSessionId: "demo_1",
    status: "CHECKOUT_CREATED",
  });
});

describe("checkout is blocked without consent", () => {
  it("refuses when no consent is supplied at all", async () => {
    const res = await startCheckout("case_1", SESSION);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("CONSENT_REQUIRED");
    expect(createCheckout).not.toHaveBeenCalled();
    expect(recordPurchaseConsent).not.toHaveBeenCalled();
  });

  it("refuses with one of three confirmed", async () => {
    const res = await startCheckout("case_1", SESSION, {
      consent: {
        informationAccuracyConfirmed: true,
        termsPrivacyAccepted: false,
        immediateSupplyConsent: false,
      },
    });
    expect(res.ok).toBe(false);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("refuses with two of three confirmed", async () => {
    const res = await startCheckout("case_1", SESSION, {
      consent: {
        informationAccuracyConfirmed: true,
        termsPrivacyAccepted: true,
        immediateSupplyConsent: false,
      },
    });
    expect(res.ok).toBe(false);
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("refuses forged truthy values from a tampered client", async () => {
    const res = await startCheckout("case_1", SESSION, {
      consent: {
        informationAccuracyConfirmed: "true",
        termsPrivacyAccepted: 1,
        immediateSupplyConsent: "on",
      } as never,
    });
    expect(res.ok).toBe(false);
    expect(createCheckout).not.toHaveBeenCalled();
  });
});

describe("checkout proceeds with all three", () => {
  it("creates the session and records the consent", async () => {
    const res = await startCheckout("case_1", SESSION, {
      consent: {
        informationAccuracyConfirmed: true,
        termsPrivacyAccepted: true,
        immediateSupplyConsent: true,
      },
      audit: { ipAddress: "203.0.113.5", userAgent: "vitest" },
    });

    expect(res.ok).toBe(true);
    expect(createCheckout).toHaveBeenCalledTimes(1);
    expect(recordPurchaseConsent).toHaveBeenCalledTimes(1);
  });

  it("stores the active terms and privacy versions with the purchase", async () => {
    const { currentLegalVersions } = await import("@/lib/legal/registry");
    await startCheckout("case_1", SESSION, {
      consent: {
        informationAccuracyConfirmed: true,
        termsPrivacyAccepted: true,
        immediateSupplyConsent: true,
      },
    });

    const recorded = recordPurchaseConsent.mock.calls[0]![0];
    expect(recorded.termsVersion).toBe(currentLegalVersions().termsVersion);
    expect(recorded.privacyPolicyVersion).toBe(
      currentLegalVersions().privacyVersion,
    );
    expect(recorded.caseId).toBe("case_1");
    expect(recorded.customerId).toBe("cust_1");
    expect(recorded.serviceType).toBe("PRIVATE_PARKING_INITIAL_APPEAL");
  });

  it("ties the consent to the payment reference", async () => {
    await startCheckout("case_1", SESSION, {
      consent: {
        informationAccuracyConfirmed: true,
        termsPrivacyAccepted: true,
        immediateSupplyConsent: true,
      },
    });
    expect(attachPaymentToConsent).toHaveBeenCalledWith({
      consentId: "csnt_1",
      paymentId: "pay_1",
      providerSessionId: "demo_1",
    });
  });

  it("does not ask twice when a usable consent already exists", async () => {
    findUsableConsentForCase.mockResolvedValue({ id: "csnt_existing" });
    const res = await startCheckout("case_1", SESSION);
    expect(res.ok).toBe(true);
    expect(recordPurchaseConsent).not.toHaveBeenCalled();
  });
});
