import type { AnswerValue } from "@/lib/facts/types";

/**
 * Provider-agnostic contract for reading an uploaded evidence document.
 *
 * Implementations ONLY read and report. They may not decide grounds,
 * select modules, or judge whether the appeal should succeed — the same
 * boundary services/extraction/ works under for the notice itself.
 *
 * The output is CANDIDATE facts, not established ones. Every candidate
 * is checked against the fact registry's vocabulary before it is allowed
 * near the answer map (see lib/facts/fromDocuments.ts), so a provider
 * cannot widen the value space by returning something inventive, and
 * cannot establish a fact outside the scope its document type covers.
 */
export interface DocumentFactCandidate {
  factKey: string;
  value: AnswerValue;
  /**
   * What in the document supports this, quoted or closely paraphrased.
   * Recorded for audit and shown to a human reviewer; never used as
   * letter wording.
   */
  basis: string;
  /**
   * The provider's own confidence, 0..1. Used for reporting and for the
   * reviewer's benefit, never as permission — a fact outside the
   * registry vocabulary is dropped at confidence 1.0 just the same.
   */
  confidence: number;
}

export interface EvidenceUnderstanding {
  /** Candidate facts the document supports. */
  facts: DocumentFactCandidate[];
  /**
   * True when the document is not what its upload category claimed —
   * e.g. a payment receipt tile with a photograph of a sign. The case
   * should be reviewed rather than silently deriving nothing.
   */
  typeMismatch: boolean;
  /** One line on what the document actually is. */
  documentSummary: string;
  providerId: string;
  readAt: string;
  warnings: string[];
}

export interface EvidenceUnderstandingProvider {
  readonly id: string;
  readonly displayName: string;
  derive(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    /** The category the customer filed this under. Scopes what may be read. */
    evidenceType: string;
    /** Attributes the call to a case for cost reporting. */
    caseId?: string | null;
    /** Filename hint for the mock provider. */
    hint?: string;
  }): Promise<EvidenceUnderstanding>;
}
