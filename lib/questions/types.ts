import type { RouteFamily } from "@/types/caseState";

/**
 * Adaptive question contract.
 *
 * Source: MASTER Developer Pack V2 Part 4 (adaptive customer
 * questioning) and the build brief §13 (question JSON contract).
 *
 * The frontend renders these generically — it must contain no
 * knowledge of routes, rules or legal reasoning.
 */

export type QuestionType =
  | "boolean"
  | "single_choice"
  | "multi_choice"
  | "short_text"
  | "long_text"
  | "date"
  | "time"
  | "number"
  | "evidence_upload";

export interface QuestionOption {
  value: string;
  label: string;
  /** Optional plain-language clarifier shown under the option. */
  hint?: string;
}

/** The wire shape sent to the browser. Deliberately minimal. */
export interface Question {
  questionId: string;
  type: QuestionType;
  label: string;
  required: boolean;
  helpText?: string;
  options?: QuestionOption[];
  /** For number inputs. */
  min?: number;
  max?: number;
  /** Free-text guidance placeholder. */
  placeholder?: string;
}

export type AnswerValue =
  | boolean
  | string
  | string[]
  | number
  | null;

export type AnswerMap = Record<string, AnswerValue>;

/**
 * Internal question definition. Never sent to the browser — it carries
 * the gating predicate, the facts it establishes and the route it
 * serves.
 */
export interface QuestionDef {
  questionId: string;
  type: QuestionType;
  label: string;
  required: boolean;
  helpText?: string;
  options?: QuestionOption[];
  min?: number;
  max?: number;
  placeholder?: string;

  /** Route this question serves. "TRIAGE" runs before route selection. */
  serves: RouteFamily | "TRIAGE" | "SCOPE";

  /**
   * Material fact keys this question establishes. If every one is
   * already known, the question is never asked (V2 Part 4 — the AI must
   * not ask questions where the answer is already established).
   */
  establishesFacts: string[];

  /**
   * Gate. Receives the derived fact set; return true when the question
   * is materially necessary.
   */
  askWhen: (facts: KnownFacts) => boolean;

  /** Lower runs earlier. */
  priority: number;

  /** KB modules this question feeds. Used for traceability/audit. */
  supportsModules?: string[];
}

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
  /** Scenario tags chosen by the customer. */
  tags: Set<string>;
  /** Evidence types available on the case. */
  evidence: Set<string>;
}

export interface NextQuestionResult {
  questioningComplete: boolean;
  question: Question | null;
  /** How many questions have been answered so far. */
  answered: number;
  /** Route families still open for investigation. */
  candidateRoutes: RouteFamily[];
  /** Material facts still outstanding. */
  missingFacts: string[];
  /** Set when the case must leave the automated flow. */
  outOfScope?: {
    reason: string;
    detail: string;
    action: "MANUAL_REVIEW" | "OUT_OF_SCOPE";
  };
}
