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
 *
 * The work itself lives in `instrumentation-node.ts`: middleware makes
 * Next build this file for the edge runtime as well, and the startup
 * path pulls in `pg`, which cannot resolve there.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerNode } = await import("./instrumentation-node");
  await registerNode();
}
