/**
 * Outbound connection hardening.
 *
 * Node 20+ connects to multi-address hosts with "happy eyeballs": it
 * races the resolved addresses and gives each one
 * `autoSelectFamilyAttemptTimeout` ms to answer. That default is 250ms.
 *
 * Our Neon pooler resolves to three AWS addresses and the OpenAI API to
 * several more. From a normal broadband connection a 250ms budget is
 * routinely missed, and Node then reports the whole connect as
 * `AggregateError [ETIMEDOUT]` — surfaced by the Neon driver as
 * "Error connecting to database: TypeError: fetch failed" and by the
 * OpenAI SDK as a bare "Connection error."
 *
 * Measured on this machine against the live Neon pooler:
 *   250ms  (default) -> 4 of 12 queries failed
 *   3000ms           -> 0 of 20 queries failed
 *
 * That single default was behind the dev-server 500s on /api/cases, the
 * "could not record usage" noise, and the drafting failures that made a
 * healthy case look like a knowledge-retrieval problem.
 *
 * Raising the per-address budget does NOT slow the healthy path: the
 * timeout only applies while an address is still unanswered, so a fast
 * first address wins immediately as before.
 */

const DEFAULT_ATTEMPT_TIMEOUT_MS = 3000;

let applied = false;

/**
 * Raise the per-address connect budget. Safe to call repeatedly, and a
 * no-op on runtimes without `node:net` (Edge middleware).
 */
export function hardenOutboundConnections(): void {
  if (applied) return;
  applied = true;

  const configured = Number.parseInt(
    process.env.NET_CONNECT_ATTEMPT_TIMEOUT_MS ?? "",
    10,
  );
  const timeout =
    Number.isFinite(configured) && configured > 0
      ? configured
      : DEFAULT_ATTEMPT_TIMEOUT_MS;

  try {
    /*
     * `process.getBuiltinModule` resolves a core module synchronously
     * and is absent on the Edge runtime, so this degrades to a no-op
     * there instead of throwing at import time.
     */
    const net = process.getBuiltinModule?.("node:net") as
      | { setDefaultAutoSelectFamilyAttemptTimeout?: (ms: number) => void }
      | undefined;
    net?.setDefaultAutoSelectFamilyAttemptTimeout?.(timeout);
  } catch {
    // Nothing to harden on this runtime.
  }
}
