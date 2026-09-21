import { FACT, factStr } from "./facts";
import type { KnownFacts } from "./types";

/**
 * Scope and jurisdiction gates.
 *
 * Legal Authority & Source Register V1 §15 — exclusions:
 *   Scotland                → PoFA Sch 4 keeper route must not be applied
 *   Byelaw / statutory land → specialist route
 *   Council PCNs            → out of scope entirely
 *   Debt recovery / court   → out of scope
 *   Hire / company vehicles → dedicated route required before automation
 *
 * The engine must never manufacture an answer for an unsupported case
 * (V2 §35). It routes to manual review instead.
 */

export interface ScopeDecision {
  reason: string;
  detail: string;
  action: "MANUAL_REVIEW" | "OUT_OF_SCOPE";
}

export function detectOutOfScope(f: KnownFacts): ScopeDecision | null {
  const jurisdiction = factStr(f, FACT.JURISDICTION);
  if (jurisdiction === "SCOTLAND") {
    return {
      action: "MANUAL_REVIEW",
      reason: "JURISDICTION_SCOTLAND",
      // Customer-safe — no statute / engine wording.
      detail:
        "We're reviewing your appeal. Cases outside England and Wales are handled by our team rather than the automated flow.",
    };
  }
  if (jurisdiction === "NORTHERN_IRELAND") {
    return {
      action: "MANUAL_REVIEW",
      reason: "JURISDICTION_NORTHERN_IRELAND",
      detail:
        "We're reviewing your appeal. Cases outside England and Wales are handled by our team rather than the automated flow.",
    };
  }

  const hire = factStr(f, FACT.VEHICLE_HIRE_STATUS);
  if (hire === "HIRE" || hire === "LEASE" || hire === "COMPANY") {
    // Soft: do not block letter generation. Rules-based drafting still
    // runs; staff can review hire/company cases after release.
    return null;
  }

  return null;
}

/**
 * True when the case is still viable for automated generation.
 * Unresolved answers ("UNSURE") do not stop the flow — they surface as
 * facts the drafting layer must treat cautiously.
 */
export function isInScope(f: KnownFacts): boolean {
  return detectOutOfScope(f) === null;
}
