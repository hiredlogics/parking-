import { isChoiceType, normaliseAnswerValue } from "./answerContract";
import { askedFactKey } from "./missing";
import type { AnswerMap, AnswerValue, Question } from "./types";

/**
 * Record an answer against the question the SERVER asked.
 *
 * The old path looked the question up in the bank, which no longer
 * works now that wording is generated per case — and would have let a
 * client name any bank question it liked. Here the answer is validated
 * against the persisted pending question, so a fact can only be written
 * if the server actually asked for it.
 */

export interface ApplyResult {
  ok: boolean;
  error?: string;
  answers: AnswerMap;
}

export function applyAnswerToFact(
  current: AnswerMap,
  question: Question,
  targetFact: string,
  value: AnswerValue,
): ApplyResult {
  const typeError = validateAgainstQuestion(question, value);
  if (typeError) return { ok: false, error: typeError, answers: current };

  if (question.required && !isProvided(value)) {
    return {
      ok: false,
      error: "This question requires an answer.",
      answers: current,
    };
  }

  const next: AnswerMap = { ...current };
  /*
   * Store the fact in the vocabulary the reasoning layer reads, not
   * whatever shape the question happened to be asked in.
   */
  if (isProvided(value)) {
    next[targetFact] = normaliseAnswerValue(targetFact, value) as AnswerValue;
  }
  // Marked whether or not a value came back: "I'm not sure" resolves
  // nothing, but the fact must never be asked again.
  next[askedFactKey(targetFact)] = true;
  return { ok: true, answers: next };
}

function isProvided(v: AnswerValue): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function validateAgainstQuestion(
  q: Question,
  v: AnswerValue,
): string | null {
  switch (q.type) {
    case "boolean":
      if (v !== null && typeof v !== "boolean") return "Expected true or false.";
      break;
    case "number":
      if (v === null) break;
      if (typeof v !== "number" || Number.isNaN(v)) return "Expected a number.";
      if (q.min !== undefined && v < q.min) return `Must be at least ${q.min}.`;
      if (q.max !== undefined && v > q.max) return `Must be at most ${q.max}.`;
      break;
    case "multi_choice":
    case "evidence_upload":
      if (v === null) break;
      if (!Array.isArray(v)) return "Expected a list of values.";
      break;
    case "single_choice":
    case "short_text":
    case "long_text":
    case "date":
    case "time":
      if (v === null) break;
      if (typeof v !== "string") return "Expected text.";
      break;
  }

  /*
   * Choice answers must come from the served option set.
   *
   * Scoped to choice types deliberately. This check used to run for
   * every type that happened to carry options, so a boolean question
   * with Yes/No labels rejected its own answer — `String(true)` is not
   * one of the option values — and the customer could not proceed. For
   * a boolean the type check above is already the whole value space.
   */
  if (isChoiceType(q.type) && q.options && q.options.length > 0 && isProvided(v)) {
    const allowed = new Set(q.options.map((o) => o.value));
    const picked = Array.isArray(v) ? v : [String(v)];
    const bad = picked.filter((p) => !allowed.has(p));
    if (bad.length > 0) return `Invalid option(s): ${bad.join(", ")}`;
  }

  return null;
}
