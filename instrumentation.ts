/**
 * Server startup hook.
 *
 * Next.js calls `register()` once per server process before any request
 * is handled, which makes it the right place to refuse an unsafe
 * production configuration. Failing here is loud and immediate; failing
 * later is quiet and happens in front of a customer.
 */
import { assertProductionConfig, isProductionRuntime } from "@/lib/config/production";
import { hardenOutboundConnections } from "@/lib/net/bootstrap";

export async function register(): Promise<void> {
  // Raise the per-address connect budget before the first outbound call.
  hardenOutboundConnections();

  assertProductionConfig();

  if (isProductionRuntime()) {
    console.log("[startup] production configuration validated");
  }
}
