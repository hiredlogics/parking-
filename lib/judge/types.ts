import type { RouteFamily } from "@/types/caseState";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { KnownFacts } from "@/lib/facts/types";
import type { KbModule } from "@/lib/kb/types";
import type { RetrievalTraceEntry } from "@/lib/retrieval/engine";

/**
 * The grounds judge — "the LLM reads the case and decides which grounds
 * to argue".
 *
 * WHERE IT SITS, AND WHY THAT MATTERS
 * -----------------------------------
 * The judge runs AFTER structured retrieval, on top of the modules the
 * knowledge graph has already ruled eligible. It does not replace the
 * gates, and that is deliberate rather than timid: VAL-FACT is a value
 * SHAPE checker (five regexes for dates, amounts and VRMs). It cannot
 * detect qualitative fabrication such as "payment was made via the
 * operator's app". Module ineligibility is what catches that today, so
 * removing it would delete the only structural guard against invented
 * grounds and replace it with a validator that cannot cover the class.
 *
 * What the judge adds is the thing the deterministic path genuinely
 * cannot do: deciding which of several eligible grounds to actually
 * argue, in what order, and on what basis — and stopping at a sensible
 * number. KB-GOV-07 and Drafting Priority rule 5 both require exactly
 * that ("A weak secondary ground must not dilute a strong primary
 * ground"; "Do not stack every possible ground"), and nothing in the
 * pipeline implemented it before now: retrieval retained every eligible
 * module, so eligibility WAS the letter's content.
 *
 * THE GROUNDING RULE
 * ------------------
 * A ground carries `groundingFactKeys`: references into the fact set,
 * never values. A ground whose keys are not all present with acceptable
 * provenance is dropped. That is the enforceable form of "the judge
 * cannot ground a claim in a fact nobody established", and it needs no
 * text validation to work — see lib/judge/select.ts.
 */

/** One ground the judge has considered. */
export interface JudgeGround {
  moduleId: string;
  applies: boolean;
  /** 0..1. Used for ordering and for the ceiling, never asserted. */
  confidence: number;
  /**
   * Fact KEYS this ground rests on — never values. The selector checks
   * each one exists with allowed provenance before admitting the ground.
   */
  groundingFactKeys: string[];
  /** Internal only. Never reaches the customer or the operator (KB §16 r7). */
  reasoning: string;
}

/** What a provider returns, before any enforcement. */
export interface JudgeVerdict {
  /**
   * The judge's reading of the case in its own words, recorded for the
   * audit trail. This is the "understand the appeal before deciding it"
   * step the product owner asked for; it is never drafted from.
   */
  caseUnderstanding: string;
  grounds: JudgeGround[];
  providerId: string;
  /** Pinned model id, for the audit record. Null for the mock. */
  model: string | null;
}

export interface JudgeInput {
  analysis: IssueAnalysis;
  facts: KnownFacts;
  /** Modules retrieval ruled eligible — the judge's normal working set. */
  eligible: KbModule[];
  /**
   * Modules retrieval rejected for an overridable reason only
   * (FACT_GATE / ROUTE). Offered to the judge so a ground the
   * answer-starved gates wrongly closed can still be reached, and
   * admitted only under the extra checks in select.ts.
   */
  overridable: KbModule[];
  /** Full retrieval trace, so the judge can see what was refused and why. */
  trace: RetrievalTraceEntry[];
  caseId?: string | null;
}

export interface GroundsJudgeProvider {
  readonly id: string;
  readonly displayName: string;
  judge(input: JudgeInput): Promise<JudgeVerdict>;
}

/**
 * Why a ground the judge proposed was not admitted. Every drop is
 * recorded — a silently discarded verdict is indistinguishable from a
 * judge that never ran.
 */
export type JudgeDropReason =
  | "NOT_APPLICABLE"
  | "UNKNOWN_MODULE"
  | "HARD_REJECTION"
  | "UNGROUNDED"
  | "CEILING";

export interface JudgeDrop {
  moduleId: string;
  reason: JudgeDropReason;
  detail: string;
}

/**
 * Failure modes. All of these route to MANUAL_REVIEW, never to FAILED —
 * the customer has paid, and a judge outage is our problem, not theirs.
 * They are distinctly labelled so an operational spike in one is
 * diagnosable without reading letters.
 */
export type JudgeFailure =
  | "JUDGE_SCHEMA_INVALID"
  | "JUDGE_TRANSPORT_FAILED"
  | "JUDGE_SELECTED_NONE"
  | "JUDGE_CEILING_REJECTED_ALL";

/** The enforced decision: what actually reaches the drafting layer. */
export interface JudgeDecision {
  selected: JudgeGround[];
  /** Module ids in final argument order. */
  moduleIds: string[];
  primaryRoute: RouteFamily | null;
  secondaryRoutes: RouteFamily[];
  drops: JudgeDrop[];
  /** Modules admitted despite an overridable retrieval rejection. */
  overrides: string[];
  caseUnderstanding: string;
  providerId: string;
  model: string | null;
  failure: JudgeFailure | null;
  judgeVersion: string;
}

export const JUDGE_VERSION = "judge-v1";

/**
 * Ceiling on selected grounds.
 *
 * The knowledge base warns against stacking (KB-GOV-07, Drafting
 * Priority rule 5), and the strongest observed real appeals argue two to
 * four grounds. Six leaves room for a primary ground with genuine
 * supporting modules without letting the letter become a list.
 */
export const MAX_SELECTED_MODULES = 6;
