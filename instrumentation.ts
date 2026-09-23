/**
 * Server startup hook.
 *
 * Next.js calls `register()` once per server process before any request
 * is handled, which makes it the right place to refuse an unsafe
 * production configuration. Failing here is loud and immediate; failing
 * later is quiet and happens in front of a customer.
 *
 * It is also the right place to pay `ensureSchema()`'s one-time cold-DB
 * cost (up to ~90 idempotent statements on a genuinely new database).
 * Left lazy, that cost landed on whichever request happened to arrive
 * first — a real customer's login or upload, not a developer watching
 * server logs. Warming it here moves it to boot, where nobody is
 * waiting on it.
 */
import { assertProductionConfig, isProductionRuntime } from "@/lib/config/production";
import { hardenOutboundConnections } from "@/lib/net/bootstrap";
import { hasDb } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

export async function register(): Promise<void> {
  // Raise the per-address connect budget before the first outbound call.
  hardenOutboundConnections();

  assertProductionConfig();

  if (isProductionRuntime()) {
    console.log("[startup] production configuration validated");
  }

  if (hasDb()) {
    try {
      await ensureSchema();
      console.log("[startup] database schema ready");
    } catch (err) {
      // Never fatal: a route that needs the DB will surface this loudly
      // on its own first real query, and refusing to boot over it would
      // take down the whole app for what may be a transient DB hiccup.
      console.warn(
        "[startup] schema warm-up failed; will retry on first request:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
