/**
 * The shared fact model.
 *
 * Everything here is consumed far beyond the (former) adaptive
 * question engine: analysis, retrieval, validation, rules, drafting
 * and case reasoning all reason about `KnownFacts`. It used to live
 * in lib/questions/ alongside the question-asking machinery, which
 * made a purely question-shaped folder the single most load-bearing
 * import path in the repo. It lives here instead so the fact model
 * can outlive any particular way of gathering facts — adaptive
 * questions, AI evidence-document understanding, or anything else.
 */

export type AnswerValue =
  | boolean
  | string
  | string[]
  | number
  | null;

export type AnswerMap = Record<string, AnswerValue>;

/**
 * Where a fact value actually came from.
 *
 * This is the whole of the anti-fabrication guarantee: VAL-FACT
 * (lib/validation/validators.ts) only permits a draft to state a
 * concrete date/amount/VRM that traces back to one of these origins,
 * so the union must never grow a bucket that means "asserted by the
 * thing being audited" (see "answer" vs "system_default" below).
 *
 *   notice          — confirmed document extraction.
 *   answer          — a genuine customer answer (adaptive question or
 *                      a data-collection form such as keeper details).
 *   document        — derived by AI from an uploaded evidence document
 *                      (lease, receipt, recovery invoice, ...).
 *   computed        — derived deterministically from other established
 *                      facts (applicable Code version, PoFA paragraph).
 *   system_default  — a provisional, admin-configured assumption
 *                      (lib/rules/factDefaults.ts) filled because
 *                      nothing established the real value. Never a
 *                      licence to assert a concrete fact.
 *   inferred        — a heuristic guess (e.g. jurisdiction inferred
 *                      from a postcode) when nothing more specific was
 *                      available. Same treatment as system_default.
 */
export type FactSource =
  | "notice"
  | "answer"
  | "document"
  | "computed"
  | "system_default"
  | "inferred";

/**
 * Derived, provenance-flattened view of everything currently
 * established about a case. Values come from confirmed extraction and
 * customer answers only — never from unconfirmed AI output.
 */
export interface KnownFacts {
  /** Fact key → value. */
  values: Record<string, AnswerValue>;
  /** Fact keys that are established (non-null / non-empty). */
  known: Set<string>;
  /** Fact key → where the value came from. */
  provenance: Record<string, FactSource>;
  /** Scenario tags chosen by the customer. */
  tags: Set<string>;
  /** Evidence types available on the case. */
  evidence: Set<string>;
}
