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
      detail:
        "The Protection of Freedoms Act 2012 Schedule 4 keeper-liability route does not apply in Scotland. Separate jurisdiction logic is required, so this case needs manual review.",
    };
  }
  if (jurisdiction === "NORTHERN_IRELAND") {
    return {
      action: "MANUAL_REVIEW",
      reason: "JURISDICTION_NORTHERN_IRELAND",
      detail:
        "This build covers England and Wales. A Northern Ireland case requires manual review.",
    };
  }

  const hire = factStr(f, FACT.VEHICLE_HIRE_STATUS);
  if (hire === "HIRE" || hire === "LEASE" || hire === "COMPANY") {
    return {
      action: "MANUAL_REVIEW",
      reason: "HIRE_OR_COMPANY_VEHICLE",
      detail:
        "Hire, lease and company vehicles follow a different statutory route which is not automated. This case needs manual review.",
    };
  }

  // The registered keeper route is the only automated route in V1.
  const keeper = factStr(f, FACT.REGISTERED_KEEPER);
  if (keeper === "NO") {
    return {
      action: "MANUAL_REVIEW",
      reason: "NOT_REGISTERED_KEEPER",
      detail:
        "This build generates registered-keeper appeals. An appeal from someone who is not the registered keeper needs manual review.",
    };
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
