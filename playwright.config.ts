import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",

  /*
   * Active suite: journey.spec.ts + security.spec.ts (+ journeyHelpers).
   * Retired V1 specs (anpr/crm/keeperPofa/paymentKeying/signage/landing
   * and helpers.ts) were removed — they targeted demo-seed unlock flows
   * that no longer exist.
   */
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3100",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      /*
       * `next start` sets NODE_ENV=production, which makes the startup
       * guard in lib/config/production.ts refuse to boot without full
       * production configuration. This is a test run, so declare it as
       * one — otherwise the whole suite fails before the first request.
       */
      APP_ENV: "test",

      /*
       * Pin every external dependency to a deterministic local
       * implementation. CI must never make a paid OpenAI call or reach
       * Stripe, and these override anything picked up from .env.local.
       * The real-model UAT harness (scripts/uat-appeals.mts) stays
       * separate for model-quality testing.
       */
      EXTRACTION_PROVIDER: "mock",
      DRAFTING_PROVIDER: "deterministic",
      QUESTION_PROVIDER: "bank",
      PAYMENT_PROVIDER: "demo",
      STORAGE_PROVIDER: "memory",

      /*
       * Memory storage is safe here and nowhere else: `next start` is a
       * single long-lived process, so an uploaded file is still there
       * when the next request reads it.
       */
      SESSION_PASSWORD:
        process.env.SESSION_PASSWORD ?? "playwright-e2e-session-password-32-chars-min!",
      MAX_ADAPTIVE_QUESTIONS: "30",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
