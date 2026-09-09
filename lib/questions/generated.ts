import type { RouteFamily } from "@/types/caseState";
import type { QuestionOption, QuestionType } from "./types";
import type { ReasonCode, RequirementScope } from "./requirements";

/**
 * Contract for an AI-generated question.
 *
 * The model returns exactly one of these. It phrases the question, but
 * every structural field — the fact it targets, the route it serves,
 * the reason it is being asked — is checked against the controlled
 * requirement map before the customer ever sees it.
 *
 * Chain-of-thought is deliberately not part of the contract and is
 * never requested or stored.
 */

/** Types the AI may produce. `evidence_upload` is handled separately. */
export const GENERATABLE_TYPES: QuestionType[] = [
  "boolean",
  "single_choice",
  "multi_choice",
  "short_text",
  "date",
];

export interface GeneratedQuestionBody {
  type: QuestionType;
  label: string;
  helpText?: string;
  options?: QuestionOption[];
  placeholder?: string;
}

export interface GeneratedQuestion {
  status: "QUESTION_REQUIRED";
  target_fact: string;
  reason_code: ReasonCode;
  route: RequirementScope;
  question: GeneratedQuestionBody;
}

export interface GeneratedSufficient {
  status: "SUFFICIENT_INFORMATION";
  missing_material_facts: string[];
  ready_for_next_stage: boolean;
}

export type GeneratorOutput = GeneratedQuestion | GeneratedSufficient;

/** How a served question came to exist. Persisted for audit. */
export type QuestionOrigin = "AI" | "AI_REGENERATED" | "BANK_FALLBACK";

export interface QuestionProvenance {
  origin: QuestionOrigin;
  providerId: string;
  model: string | null;
  promptVersion: string | null;
  /** Validation failures that forced a retry or fallback. */
  rejections: string[];
}

/** Context handed to the generator. Contains no chain-of-thought. */
export interface GenerationContext {
  /** Confirmed notice facts, already established. Never re-ask these. */
  confirmedFacts: Record<string, unknown>;
  /** Fact key → answer, from questions already put to the customer. */
  answeredFacts: Record<string, unknown>;
  /** Evidence types attached to the case. */
  evidenceTypes: string[];
  /** Routes currently in play. */
  eligibleRoutes: RouteFamily[];
  /** Outstanding requirements, highest value first. */
  missing: Array<{
    fact: string;
    reasonCode: ReasonCode;
    route: RequirementScope;
    rationale: string;
    kbModules: string[];
  }>;
  /** Labels already put to the customer, so none is repeated. */
  askedLabels: string[];
  /** Facts already asked, answered or not. */
  askedFacts: string[];
  /** Set on a retry: why the previous attempt was rejected. */
  feedback?: string;
}
