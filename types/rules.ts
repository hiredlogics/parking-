import type { ConfirmedPcn } from "./pcn";
import type { AllAnswers } from "./answers";
import type { EvidenceItem } from "./evidence";

/**
 * Route names per the Master Developer Pack (Part 6). These are the
 * high-level appeal grounds that the rules engine may activate. Any
 * number of them can be active in the same case.
 */
export type Route =
  | "KEEPER_ROUTE"
  | "PAYMENT_ROUTE"
  | "KEYING_ERROR_ROUTE"
  | "CONSIDERATION_ROUTE"
  | "GRACE_ROUTE"
  | "ANPR_ROUTE"
  | "ANPR_DOUBLE_VISIT"
  | "AUTHORISATION_ROUTE"
  | "SIGNAGE_ROUTE"
  | "LANDOWNER";

export interface RuleInput {
  pcn: ConfirmedPcn;
  answers: AllAnswers;
  evidence: EvidenceItem[];
}

export interface RuleTraceEntry {
  ruleId: string;
  matched: boolean;
  reason: string;
  paragraphIds: string[];
  route?: Route;
}

export interface RuleEvaluation {
  matchedRuleIds: string[];
  matchedParagraphIds: string[];
  activeRoutes: Route[];
  warnings: string[];
  decisionTrace: RuleTraceEntry[];
}

/** A pure, deterministic rule. */
export interface Rule {
  id: string;
  /** Route activated when this rule matches. Optional — some rules only add paragraphs. */
  route?: Route;
  /** Approved paragraph IDs to include when this rule matches. */
  paragraphIds: string[];
  /** Short description surfaced in decisionTrace. */
  description: string;
  /** Pure boolean predicate. */
  test: (input: RuleInput) => { matched: boolean; reason: string };
  /** Whether this rule is enabled. Defaults to true when omitted. CRM-editable — see lib/appealLogic.ts. */
  active?: boolean;
}
