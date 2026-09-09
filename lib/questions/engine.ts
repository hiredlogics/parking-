import type { RouteFamily } from "@/types/caseState";
import type { ConfirmedPcn } from "@/types";
import { QUESTION_BANK, TAG_ROUTES } from "./bank";
import { deriveKnownFacts } from "./facts";
import { assertQuestionKeeperSafe } from "./keeperGuard";
import { detectOutOfScope } from "./scope";
import type {
  AnswerMap,
  AnswerValue,
  KnownFacts,
  NextQuestionResult,
  Question,
  QuestionDef,
} from "./types";

/**
 * Adaptive question engine.
 *
 * MASTER Developer Pack V2 Part 4:
 *
 *   Current Case State
 *          -> determine missing material fact
 *          -> generate/select ONE question
 *          -> customer answers
 *          -> update Case State
 *          -> evaluate again -> another question | QUESTIONING_COMPLETE
 *
 * The engine is pure: it takes confirmed extraction plus prior answers
 * and returns at most one question. It never returns a question whose
 * facts are already established, and it never returns a question that
 * fails the keeper-safety guard.
 */

export interface EngineInput {
  confirmed?: ConfirmedPcn | null;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  /** Safety valve — stop asking beyond this many answered questions. */
  maxQuestions?: number;
}

const DEFAULT_MAX_QUESTIONS = 12;

/** Strip internal fields so nothing leaks to the browser. */
export function toWireQuestion(def: QuestionDef): Question {
  const q: Question = {
    questionId: def.questionId,
    type: def.type,
    label: def.label,
    required: def.required,
  };
  if (def.helpText) q.helpText = def.helpText;
  if (def.options) q.options = def.options;
  if (def.min !== undefined) q.min = def.min;
  if (def.max !== undefined) q.max = def.max;
  if (def.placeholder) q.placeholder = def.placeholder;
  return q;
}

/** Marker recorded when a question has been put to the customer. */
export const askedKey = (questionId: string) => `__asked:${questionId}`;

/**
 * A question is satisfied when every fact it establishes is known, or
 * when it has already been asked. The second case matters for optional
 * questions answered with "none of these" — the answer is empty but the
 * question must not be repeated.
 */
function isSatisfied(def: QuestionDef, facts: KnownFacts): boolean {
  if (facts.values[askedKey(def.questionId)] === true) return true;
  return def.establishesFacts.every((f) => facts.known.has(f));
}

/** Number of questions actually put to the customer. */
export function countAnswered(answers: AnswerMap): number {
  return Object.keys(answers).filter((k) => k.startsWith("__asked:")).length;
}

/** Candidate routes implied by the chosen scenario tags. */
export function candidateRoutes(facts: KnownFacts): RouteFamily[] {
  const out = new Set<RouteFamily>();
  for (const tag of facts.tags) {
    for (const r of TAG_ROUTES[tag] ?? []) out.add(r as RouteFamily);
  }
  // The keeper/PoFA analysis is always in play on an unidentified-driver
  // keeper route, even without an explicit tag.
  if (
    facts.values["registered_keeper"] === "YES" &&
    facts.values["driver_identified"] === "NO"
  ) {
    out.add("POFA");
  }
  return [...out].sort();
}

/** Material facts still outstanding for the open routes. */
export function missingFacts(facts: KnownFacts): string[] {
  const out = new Set<string>();
  for (const def of QUESTION_BANK) {
    if (isSatisfied(def, facts)) continue;
    if (!def.askWhen(facts)) continue;
    for (const f of def.establishesFacts) {
      if (!facts.known.has(f)) out.add(f);
    }
  }
  return [...out];
}

/**
 * Select the next single question, or report completion.
 */
export function nextQuestion(input: EngineInput): NextQuestionResult {
  const answers = input.answers ?? {};
  const facts = deriveKnownFacts({
    confirmed: input.confirmed,
    answers,
    evidenceTypes: input.evidenceTypes,
  });
  const answered = countAnswered(answers);
  const routes = candidateRoutes(facts);

  // Out-of-scope detection runs before anything else so we never keep
  // interrogating a case we cannot automate.
  const scope = detectOutOfScope(facts);
  if (scope) {
    return {
      questioningComplete: true,
      question: null,
      answered,
      candidateRoutes: routes,
      missingFacts: [],
      outOfScope: scope,
    };
  }

  const max = input.maxQuestions ?? DEFAULT_MAX_QUESTIONS;
  if (answered >= max) {
    return {
      questioningComplete: true,
      question: null,
      answered,
      candidateRoutes: routes,
      missingFacts: missingFacts(facts),
    };
  }

  const eligible = QUESTION_BANK
    .filter((def) => !isSatisfied(def, facts))
    .filter((def) => def.askWhen(facts))
    .sort((a, b) => a.priority - b.priority);

  const chosen = eligible[0];
  if (!chosen) {
    return {
      questioningComplete: true,
      question: null,
      answered,
      candidateRoutes: routes,
      missingFacts: [],
    };
  }

  // Non-negotiable: never serve a keeper-unsafe question.
  assertQuestionKeeperSafe(chosen);

  return {
    questioningComplete: false,
    question: toWireQuestion(chosen),
    answered,
    candidateRoutes: routes,
    missingFacts: missingFacts(facts),
  };
}

export interface ApplyAnswerResult {
  ok: boolean;
  error?: string;
  answers: AnswerMap;
}

/**
 * Validate and record one answer against the fact keys its question
 * establishes. Rejects answers for unknown questions and values that do
 * not match the declared type.
 */
export function applyAnswer(
  current: AnswerMap,
  questionId: string,
  value: AnswerValue,
): ApplyAnswerResult {
  const def = QUESTION_BANK.find((q) => q.questionId === questionId);
  if (!def) {
    return { ok: false, error: `Unknown question: ${questionId}`, answers: current };
  }

  const typeError = validateAnswerType(def, value);
  if (typeError) return { ok: false, error: typeError, answers: current };

  if (def.required && !isProvided(value)) {
    return { ok: false, error: "This question requires an answer.", answers: current };
  }

  // Choice answers must come from the declared option set.
  if (def.options && isProvided(value)) {
    const allowed = new Set(def.options.map((o) => o.value));
    const picked = Array.isArray(value) ? value : [String(value)];
    const bad = picked.filter((p) => !allowed.has(p));
    if (bad.length > 0) {
      return {
        ok: false,
        error: `Invalid option(s): ${bad.join(", ")}`,
        answers: current,
      };
    }
  }

  const next: AnswerMap = { ...current };
  // One question can establish several facts (e.g. the scenario tags).
  for (const fact of def.establishesFacts) {
    next[fact] = value;
  }
  // Record that the question itself has been asked, so an optional
  // question answered with "nothing applies" is not asked again.
  next[askedKey(questionId)] = true;
  return { ok: true, answers: next };
}

function isProvided(v: AnswerValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function validateAnswerType(def: QuestionDef, v: AnswerValue): string | null {
  switch (def.type) {
    case "boolean":
      if (v !== null && typeof v !== "boolean") return "Expected true or false.";
      return null;
    case "number":
      if (v === null) return null;
      if (typeof v !== "number" || Number.isNaN(v)) return "Expected a number.";
      if (def.min !== undefined && v < def.min) return `Must be at least ${def.min}.`;
      if (def.max !== undefined && v > def.max) return `Must be at most ${def.max}.`;
      return null;
    case "multi_choice":
    case "evidence_upload":
      if (v === null) return null;
      if (!Array.isArray(v)) return "Expected a list of values.";
      return null;
    case "single_choice":
    case "short_text":
    case "long_text":
    case "date":
    case "time":
      if (v === null) return null;
      if (typeof v !== "string") return "Expected text.";
      return null;
    default:
      return null;
  }
}

/**
 * Convenience wrapper: run the whole journey against a fixed answer
 * strategy. Used by tests and by scenario fixtures.
 */
export function runJourney(
  input: EngineInput,
  answerFor: (q: Question) => AnswerValue,
): { asked: Question[]; answers: AnswerMap; result: NextQuestionResult } {
  let answers: AnswerMap = { ...(input.answers ?? {}) };
  const asked: Question[] = [];
  let result = nextQuestion({ ...input, answers });
  let guard = 0;

  while (!result.questioningComplete && result.question && guard < 50) {
    const q = result.question;
    asked.push(q);
    const applied = applyAnswer(answers, q.questionId, answerFor(q));
    if (!applied.ok) {
      throw new Error(`Journey answer rejected for ${q.questionId}: ${applied.error}`);
    }
    answers = applied.answers;
    result = nextQuestion({ ...input, answers });
    guard += 1;
  }
  return { asked, answers, result };
}
