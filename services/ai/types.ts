import type { DraftingBlock, KbModule, LegalSource } from "@/lib/kb/types";
import type { IssueAnalysis } from "@/lib/analysis/types";

/**
 * AI service abstraction (brief §37).
 *
 * Direct provider calls must not be scattered through API routes or
 * React components. Everything goes through these interfaces so a model
 * or vendor can be replaced without touching the appeal system.
 */

/** The approved context a drafter is allowed to work from. */
export interface DraftingContext {
  /**
   * Attributes the provider call to a case for cost reporting. Not sent
   * to the model — it is metadata, not reasoning input.
   */
  caseId?: string | null;
  analysis: IssueAnalysis;
  /** Retained knowledge modules, in drafting priority order. */
  modules: KbModule[];
  /** Approved wording the drafter may paraphrase, merge and reorder. */
  blocks: DraftingBlock[];
  /** Sources backing the retained modules. */
  sources: LegalSource[];
  /** Resolved variable values, e.g. vrm, pcn_number. */
  variables: Record<string, string>;
  /** Evidence types actually available on the case. */
  availableEvidence: string[];
  /**
   * Validator feedback from a rejected previous attempt. Present only on
   * a regeneration cycle, so the drafter can correct rather than repeat
   * the same failure.
   */
  feedback?: string;
}

export interface DraftResult {
  /** The letter body. Plain prose, no IDs, no salutation. */
  body: string;
  /** Provider that produced it. */
  providerId: string;
  /** Prompt version used, for the audit record. */
  promptVersion: string;
  /** Model identifier where applicable. */
  model: string | null;
  /**
   * True when the output is genuinely bespoke prose rather than
   * assembled approved blocks. The V2 acceptance criteria require
   * bespoke output, so this is surfaced rather than hidden.
   */
  bespoke: boolean;
  /** Module IDs the drafter was given. Never shown to the customer. */
  moduleIds: string[];
  /** Non-fatal notes for the audit record. */
  warnings: string[];
  /** Token usage where the provider reports it. */
  usage?: { promptTokens?: number; completionTokens?: number };
}

export interface DraftingProvider {
  readonly id: string;
  readonly displayName: string;
  /** True when this provider produces bespoke prose. */
  readonly bespoke: boolean;
  draft(context: DraftingContext): Promise<DraftResult>;
}
