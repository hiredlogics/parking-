/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEV_ADMIN_PASSWORD,
  DEV_SESSION_PASSWORD,
  ProductionConfigError,
  assertProductionConfig,
  collectConfigProblems,
  isProductionRuntime,
  paymentsEnabled,
  refuseInProduction,
} from "@/lib/config/production";
import { sessionPassword } from "@/lib/auth/sessionConfig";
import { getStorageProvider, resetStorageProvider } from "@/services/storage";
import { getPaymentService, resetPaymentService } from "@/lib/payments";
import { getDraftingProvider, resetDraftingProvider } from "@/services/ai/drafting";
import { getQuestionProvider, resetQuestionProvider } from "@/services/ai/questions";

/**
 * Production configuration guard.
 *
 * Each of these defaults was individually reasonable for local
 * development and collectively meant a production deploy that forgot an
 * environment variable would come up looking healthy while giving away
 * free appeals from a forgeable session against ephemeral storage.
 *
 * These tests are the reason that cannot happen again, so they assert
 * the refusals rather than the conveniences.
 */

const KEYS = [
  "NODE_ENV", "APP_ENV", "DATABASE_URL", "POSTGRES_URL",
  "SESSION_PASSWORD", "ADMIN_PASSWORD", "ADMIN_EMAIL",
  "STORAGE_PROVIDER", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
  "R2_ENDPOINT", "S3_ENDPOINT", "R2_ACCOUNT_ID",
  "PAYMENT_PROVIDER", "PAYMENTS_ENABLED", "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET", "APP_URL", "NEXT_PUBLIC_APP_URL",
  "OPENAI_API_KEY", "EXTRACTION_PROVIDER", "DRAFTING_PROVIDER", "QUESTION_PROVIDER",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  resetStorageProvider();
  resetPaymentService();
  resetDraftingProvider();
  resetQuestionProvider();
});

/** A configuration with nothing wrong. */
function applyGoodProductionConfig(): void {
  process.env.APP_ENV = "production";
  process.env.DATABASE_URL = "postgres://user:pw@db.example.com/appeals";
  process.env.SESSION_PASSWORD = "x".repeat(48);
  process.env.ADMIN_PASSWORD = "a-real-admin-password";
  process.env.ADMIN_EMAIL = "ops@client.co.uk";
  process.env.STORAGE_PROVIDER = "s3";
  process.env.R2_BUCKET = "appeals";
  process.env.R2_ACCESS_KEY_ID = "key";
  process.env.R2_SECRET_ACCESS_KEY = "secret";
  process.env.S3_ENDPOINT = "https://lon1.digitaloceanspaces.com";
  process.env.PAYMENT_PROVIDER = "stripe";
  process.env.STRIPE_SECRET_KEY = "sk_live_abc123";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_abc123";
  process.env.APP_URL = "https://client.co.uk";
  process.env.OPENAI_API_KEY = "sk-proj-abc";
  delete process.env.EXTRACTION_PROVIDER;
  delete process.env.DRAFTING_PROVIDER;
  delete process.env.QUESTION_PROVIDER;
}

const keysOf = (): string[] => collectConfigProblems().map((p) => p.key);

describe("Production runtime detection", () => {
  it("treats APP_ENV=production as production", () => {
    process.env.APP_ENV = "production";
    expect(isProductionRuntime()).toBe(true);
  });

  it("applies production strictness to staging too", () => {
    process.env.APP_ENV = "staging";
    expect(isProductionRuntime()).toBe(true);
  });

  it("lets APP_ENV override NODE_ENV", () => {
    // `next build` output always sets NODE_ENV=production.
    process.env.APP_ENV = "development";
    expect(isProductionRuntime()).toBe(false);
  });

  it("falls back to NODE_ENV when APP_ENV is unset", () => {
    delete process.env.APP_ENV;
    expect(isProductionRuntime()).toBe(process.env.NODE_ENV === "production");
  });
});

describe("A complete production configuration is accepted", () => {
  it("reports no problems", () => {
    applyGoodProductionConfig();
    expect(collectConfigProblems()).toEqual([]);
  });

  it("does not throw at startup", () => {
    applyGoodProductionConfig();
    expect(() => assertProductionConfig()).not.toThrow();
  });
});

describe("Each P0 default is refused", () => {
  it("flags a missing database URL", () => {
    applyGoodProductionConfig();
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    expect(keysOf()).toContain("DATABASE_URL");
  });

  it("flags an unset session secret", () => {
    applyGoodProductionConfig();
    delete process.env.SESSION_PASSWORD;
    expect(keysOf()).toContain("SESSION_PASSWORD");
  });

  it("flags the committed development session secret", () => {
    applyGoodProductionConfig();
    process.env.SESSION_PASSWORD = DEV_SESSION_PASSWORD;
    expect(keysOf()).toContain("SESSION_PASSWORD");
  });

  it("flags a session secret that is too short to seal", () => {
    applyGoodProductionConfig();
    process.env.SESSION_PASSWORD = "short";
    expect(keysOf()).toContain("SESSION_PASSWORD");
  });

  it('flags the default admin password "changeme"', () => {
    applyGoodProductionConfig();
    process.env.ADMIN_PASSWORD = DEV_ADMIN_PASSWORD;
    expect(keysOf()).toContain("ADMIN_PASSWORD");
  });

  it("flags an unset admin password", () => {
    applyGoodProductionConfig();
    delete process.env.ADMIN_PASSWORD;
    expect(keysOf()).toContain("ADMIN_PASSWORD");
  });

  it("flags in-memory storage", () => {
    applyGoodProductionConfig();
    process.env.STORAGE_PROVIDER = "memory";
    expect(keysOf()).toContain("STORAGE_PROVIDER");
  });

  it("flags unset storage, which would default to memory", () => {
    applyGoodProductionConfig();
    delete process.env.STORAGE_PROVIDER;
    expect(keysOf()).toContain("STORAGE_PROVIDER");
  });

  it("flags storage credentials that are incomplete", () => {
    applyGoodProductionConfig();
    delete process.env.R2_SECRET_ACCESS_KEY;
    expect(keysOf()).toContain("STORAGE_CREDENTIALS");
  });

  it("flags a missing storage endpoint", () => {
    applyGoodProductionConfig();
    delete process.env.S3_ENDPOINT;
    delete process.env.R2_ENDPOINT;
    delete process.env.R2_ACCOUNT_ID;
    expect(keysOf()).toContain("S3_ENDPOINT");
  });

  it("flags the demo payment provider", () => {
    applyGoodProductionConfig();
    process.env.PAYMENT_PROVIDER = "demo";
    expect(keysOf()).toContain("PAYMENT_PROVIDER");
  });

  it("flags unset payments, which would default to demo", () => {
    applyGoodProductionConfig();
    delete process.env.PAYMENT_PROVIDER;
    expect(keysOf()).toContain("PAYMENT_PROVIDER");
  });

  it("flags missing Stripe secrets", () => {
    applyGoodProductionConfig();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const keys = keysOf();
    expect(keys).toContain("STRIPE_SECRET_KEY");
    expect(keys).toContain("STRIPE_WEBHOOK_SECRET");
  });

  it("flags a Stripe test key in production", () => {
    applyGoodProductionConfig();
    process.env.STRIPE_SECRET_KEY = "sk_test_abc";
    expect(keysOf()).toContain("STRIPE_SECRET_KEY");
  });

  it("flags a missing APP_URL, without which Stripe cannot return", () => {
    applyGoodProductionConfig();
    delete process.env.APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(keysOf()).toContain("APP_URL");
  });

  it("flags a missing OpenAI key", () => {
    applyGoodProductionConfig();
    delete process.env.OPENAI_API_KEY;
    expect(keysOf()).toContain("OPENAI_API_KEY");
  });

  it("flags test/offline AI providers left switched on", () => {
    applyGoodProductionConfig();
    process.env.EXTRACTION_PROVIDER = "mock";
    process.env.DRAFTING_PROVIDER = "deterministic";
    process.env.QUESTION_PROVIDER = "bank";
    const keys = keysOf();
    expect(keys).toContain("EXTRACTION_PROVIDER");
    expect(keys).toContain("DRAFTING_PROVIDER");
    expect(keys).toContain("QUESTION_PROVIDER");
  });
});

describe("Startup failure is loud and complete", () => {
  it("throws ProductionConfigError listing every problem at once", () => {
    process.env.APP_ENV = "production";
    for (const k of KEYS.filter((k) => k !== "APP_ENV")) delete process.env[k];

    let error: unknown;
    try {
      assertProductionConfig();
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ProductionConfigError);
    const problems = (error as ProductionConfigError).problems.map((p) => p.key);
    // One bad deploy should not require six restarts to diagnose.
    for (const expected of [
      "DATABASE_URL", "SESSION_PASSWORD", "ADMIN_PASSWORD",
      "STORAGE_PROVIDER", "PAYMENT_PROVIDER", "OPENAI_API_KEY",
    ]) {
      expect(problems, expected).toContain(expected);
    }
  });

  it("names the variable and the remedy in the message", () => {
    process.env.APP_ENV = "production";
    delete process.env.PAYMENT_PROVIDER;
    const message = new ProductionConfigError(collectConfigProblems()).message;
    expect(message).toContain("PAYMENT_PROVIDER");
    expect(message).toMatch(/stripe/i);
  });

  it("never leaks a secret value into the message", () => {
    applyGoodProductionConfig();
    process.env.STRIPE_SECRET_KEY = "sk_test_SUPERSECRETVALUE";
    const message = new ProductionConfigError(collectConfigProblems()).message;
    expect(message).not.toContain("SUPERSECRETVALUE");
  });
});

describe("Development and tests are unaffected", () => {
  it("assertProductionConfig is a no-op outside production", () => {
    process.env.APP_ENV = "development";
    for (const k of KEYS.filter((k) => k !== "APP_ENV")) delete process.env[k];
    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("refuseInProduction is a no-op outside production", () => {
    process.env.APP_ENV = "development";
    expect(() => refuseInProduction("X", "y")).not.toThrow();
  });

  it("refuseInProduction throws in production", () => {
    process.env.APP_ENV = "production";
    expect(() => refuseInProduction("X", "y")).toThrow(ProductionConfigError);
  });
});

describe("Payments can be disabled deliberately", () => {
  it("skips every payment check when PAYMENTS_ENABLED=false", () => {
    applyGoodProductionConfig();
    process.env.PAYMENTS_ENABLED = "false";
    delete process.env.PAYMENT_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    expect(paymentsEnabled()).toBe(false);
    expect(keysOf()).not.toContain("PAYMENT_PROVIDER");
  });

  it("defaults to payments being enabled", () => {
    delete process.env.PAYMENTS_ENABLED;
    expect(paymentsEnabled()).toBe(true);
  });
});

/**
 * Defence in depth: the factories must refuse independently, so a
 * missed startup hook is not the only thing preventing a free appeal.
 */
describe("Factories refuse unsafe defaults on their own", () => {
  it("session sealing refuses the placeholder secret in production", () => {
    process.env.APP_ENV = "production";
    delete process.env.SESSION_PASSWORD;
    expect(() => sessionPassword()).toThrow(/SESSION_PASSWORD/);
  });

  it("session sealing still works in development", () => {
    process.env.APP_ENV = "development";
    delete process.env.SESSION_PASSWORD;
    expect(sessionPassword().length).toBeGreaterThanOrEqual(32);
  });

  it("storage refuses to hand back the in-memory provider in production", () => {
    process.env.APP_ENV = "production";
    process.env.STORAGE_PROVIDER = "memory";
    resetStorageProvider();
    expect(() => getStorageProvider()).toThrow(ProductionConfigError);
  });

  it("payments refuse the demo provider in production", () => {
    process.env.APP_ENV = "production";
    process.env.PAYMENT_PROVIDER = "demo";
    delete process.env.PAYMENTS_ENABLED;
    resetPaymentService();
    expect(() => getPaymentService()).toThrow(ProductionConfigError);
  });

  it("payments allow the demo provider when payments are off", () => {
    process.env.APP_ENV = "production";
    process.env.PAYMENT_PROVIDER = "demo";
    process.env.PAYMENTS_ENABLED = "false";
    resetPaymentService();
    expect(() => getPaymentService()).not.toThrow();
  });

  it("drafting refuses to silently serve template prose in production", () => {
    process.env.APP_ENV = "production";
    delete process.env.OPENAI_API_KEY;
    delete process.env.DRAFTING_PROVIDER;
    resetDraftingProvider();
    expect(() => getDraftingProvider()).toThrow(ProductionConfigError);
  });

  it("drafting allows the deterministic provider when chosen explicitly", () => {
    process.env.APP_ENV = "production";
    delete process.env.OPENAI_API_KEY;
    process.env.DRAFTING_PROVIDER = "deterministic";
    resetDraftingProvider();
    expect(() => getDraftingProvider()).not.toThrow();
  });

  it("question generation refuses to fall back to the bank in production", () => {
    process.env.APP_ENV = "production";
    delete process.env.OPENAI_API_KEY;
    delete process.env.QUESTION_PROVIDER;
    resetQuestionProvider();
    expect(() => getQuestionProvider()).toThrow(ProductionConfigError);
  });

  it("question generation allows the bank when chosen explicitly", () => {
    process.env.APP_ENV = "production";
    delete process.env.OPENAI_API_KEY;
    process.env.QUESTION_PROVIDER = "bank";
    resetQuestionProvider();
    expect(getQuestionProvider()).toBeNull();
  });
});
