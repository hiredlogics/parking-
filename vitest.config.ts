import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next", "tests/e2e/**"],
    /*
     * Vitest's 5s default is too tight for the tests that talk to the
     * database, and the shortfall is not a bug in them.
     *
     * A cold worker pays a one-off setup cost before any assertion
     * runs: ~1.8s for the Neon TLS handshake, ~0.5s for the schema
     * probe, ~0.3s each for the KB and admin-config seed fingerprints,
     * ~0.6s for the service graph. That is ~3.5s of fixed cost, and
     * each test file gets a fresh worker, so whichever test happens to
     * run first in a file absorbs all of it and fails on timing rather
     * than on behaviour. The symptom was a dozen unrelated suites
     * failing with "Test timed out in 5000ms" while passing when run
     * alone.
     *
     * The setup cost itself has been cut where it was avoidable (see
     * the seed fingerprints and the single-round-trip graph load); what
     * is left is round trips to a remote Postgres, which no amount of
     * local work removes.
     *
     * 20s was tried first and was still too tight. Measured against
     * Neon, the test that absorbs a file's cold start has been seen to
     * take anywhere from 9.5s to over 20s for the SAME assertions —
     * pipelineAccuracy's first fixture passed in 9.5s on one run and
     * timed out on the next two. The variance is remote-database
     * latency, not the code under test, so a timeout tuned to the good
     * case just converts that variance into intermittent red builds and
     * teaches everyone to re-run the suite.
     *
     * 60s is deliberately generous. It is not a performance target:
     * nothing here should take 60s, and if something does, the fix is
     * to make it faster rather than to raise this again. It exists only
     * so that a slow network cannot masquerade as a broken assertion.
     */
    testTimeout: 60_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
