import type { Question, QuestionDef } from "./types";
import type { AnswerMap } from "@/lib/facts/types";

/**
 * Bank question helpers.
 *
 * WHAT WAS REMOVED, AND WHY
 * -------------------------
 * This file used to hold `nextQuestion()`, the V1 selector. It ordered
 * questions by a static priority integer and — critically — contained
 *
 *     if (answered >= max) return { questioningComplete: true, ... }
 *
 * which declared a case READY because twelve questions had been
 * answered. MASTER V2 and the client are explicit that question count
 * must never determine sufficiency, so it is deleted rather than left
 * around as an unsafe alternative path. `applyAnswer` and `runJourney`
 * went with it: answers are now recorded against the persisted
 * question by `applyAnswerToFact`.
 *
 * Selection lives in `lib/questions/dynamicEngine.ts`, driven by the
 * canonical reasoning context and information gain.
 *
 * What remains here is only what the controlled bank FALLBACK needs.
 */

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

/**
 * Marker recorded when a question has been put to the customer.
 *
 * Retained for the legacy answer map shape. New code marks facts via
 * `askedFactKey` in `lib/questions/missing.ts`.
 */
export const askedKey = (questionId: string) => `__asked:${questionId}`;

/**
 * How many questions have been put to the customer.
 *
 * Reporting only. NOTHING in the readiness path may branch on this —
 * that was the defect above.
 */
export function countAnswered(answers: AnswerMap): number {
  return Object.keys(answers).filter((k) => k.startsWith("__asked:")).length;
}
