/**
 * Node-only half of the startup hook.
 *
 * Kept in its own module because `instrumentation.ts` is compiled for
 * the edge runtime too (middleware forces that build), and `pg` reaches
 * for `fs` and the optional `pg-native` binding, neither of which
 * resolve there. Edge never imports this file, so edge never sees `pg`.
 */
import { assertProductionConfig, isProductionRuntime } from "@/lib/config/production";
import { hardenOutboundConnections } from "@/lib/net/bootstrap";
import { hasDb } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

export async function registerNode(): Promise<void> {
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
