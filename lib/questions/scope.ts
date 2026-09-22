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
 * (V2 §35). It routes to manual review / out-of-scope instead.
 */

export interface ScopeDecision {
  reason: string;
  detail: string;
  action: "MANUAL_REVIEW" | "OUT_OF_SCOPE";
}

/** Fields we can assess before the customer answers any questions. */
export interface NoticeScopeInput {
  operatorName?: string | null;
  allegedBreach?: string | null;
  parkingLocation?: string | null;
  /** Optional OCR / letter text when available. */
  extraText?: string | null;
}

const DEBT_RECOVERY_DETAIL =
  "This looks like a debt recovery or late-stage collection letter, not an initial parking charge notice. The operator appeal window has usually already closed, so we can't prepare an automated appeal from this document. For help with debt recovery or court-stage correspondence, please use Expert Help.";

const COURT_DETAIL =
  "This looks like court, claim or enforcement paperwork rather than an initial parking charge notice. We can't prepare an automated operator appeal from this document. For County Court, CCJ or bailiff help, please use Expert Help.";

/**
 * Known debt-recovery / collection senders and parking-debt solicitors.
 * Matched against the extracted "operator" / sender name.
 */
const DEBT_RECOVERY_SENDERS =
  /\b(?:debt\s*recovery\s*plus|\bdrp\b|zzps|trace\s*debt|debt\s*recovery|debt\s*collection|parking\s*collection|direct\s*collection(?:\s*bailiffs)?|\bdcbl\b|bw\s*legal|gladstones(?:\s*solicitors)?|moorside\s*legal|wright\s*hassall|qdr\s*solicitors|freeths|excel\s*collections?)\b/i;

/** Strong letter-body signals that this is past initial operator appeal. */
const DEBT_RECOVERY_TEXT =
  /\b(?:letter\s+of\s+claim|pre[-\s]?action\s+protocol|legal\s+action\s+imminent|recommend(?:ing)?\s+legal\s+proceedings|county\s+court\s+judgment|\bccj\b|paydrp\.co\.uk|instructed\s+to\s+recover|debt\s+recovery\s+plus|urgent\s+reminder[\s\S]{0,80}legal\s+action)\b/i;

const COURT_TEXT =
  /\b(?:claim\s+form(?:\s+n1)?|county\s+court\s+business\s+centre|notice\s+of\s+enforcement|warrant\s+of\s+control|writ\s+of\s+control|taking\s+control\s+of\s+goods|bailiff|high\s+court\s+enforcement)\b/i;

function combinedNoticeText(input: NoticeScopeInput): string {
  return [
    input.operatorName,
    input.allegedBreach,
    input.parkingLocation,
    input.extraText,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join("\n");
}

/**
 * Assess whether the uploaded notice is still at initial operator appeal
 * stage. Safe to call from the confirm screen using extraction alone.
 */
export function assessNoticeScope(
  input: NoticeScopeInput,
): ScopeDecision | null {
  const operator = (input.operatorName ?? "").trim();
  const text = combinedNoticeText(input);

  if (DEBT_RECOVERY_SENDERS.test(operator) || DEBT_RECOVERY_TEXT.test(text)) {
    return {
      action: "OUT_OF_SCOPE",
      reason: "DEBT_RECOVERY_STAGE",
      detail: DEBT_RECOVERY_DETAIL,
    };
  }

  if (COURT_TEXT.test(text)) {
    return {
      action: "OUT_OF_SCOPE",
      reason: "COURT_OR_ENFORCEMENT_STAGE",
      detail: COURT_DETAIL,
    };
  }

  return null;
}

export function detectOutOfScope(f: KnownFacts): ScopeDecision | null {
  const noticeScope = assessNoticeScope({
    operatorName: factStr(f, FACT.OPERATOR_NAME),
    allegedBreach: factStr(f, FACT.ALLEGED_BREACH),
    parkingLocation: factStr(f, FACT.PARKING_LOCATION),
  });
  if (noticeScope) return noticeScope;

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

/** Hard stop — do not take payment or draft an operator appeal. */
export function isHardOutOfScope(decision: ScopeDecision | null): boolean {
  if (!decision) return false;
  return (
    decision.action === "OUT_OF_SCOPE" &&
    (decision.reason === "DEBT_RECOVERY_STAGE" ||
      decision.reason === "COURT_OR_ENFORCEMENT_STAGE")
  );
}
