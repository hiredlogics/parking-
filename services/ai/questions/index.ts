import { refuseInProduction } from "@/lib/config/production";
import { OpenAIQuestionProvider } from "./openaiProvider";
import type { QuestionProvider } from "./types";

let cached: QuestionProvider | null = null;

/**
 * Question provider factory.
 *
 *   QUESTION_PROVIDER=bank    → no AI. The controlled question bank
 *                               supplies every question. Used by tests
 *                               and offline demos.
 *   QUESTION_PROVIDER=openai  → force AI; throws without a key so a
 *                               misconfiguration is loud.
 *   unset → AI when OPENAI_API_KEY exists, otherwise the bank.
 *
 * Returning null means "no AI available" — the caller then uses the
 * bank. It must never be read as "no more questions needed".
 */
export function getQuestionProvider(): QuestionProvider | null {
  if (cached) return cached;
  const explicit = (process.env.QUESTION_PROVIDER ?? "").toLowerCase();

  if (explicit === "bank" || explicit === "deterministic") return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (explicit === "openai") {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        "QUESTION_PROVIDER=openai but OPENAI_API_KEY is not set. Set the key or use QUESTION_PROVIDER=bank.",
      );
    }
    cached = new OpenAIQuestionProvider({ apiKey });
    return cached;
  }

  if (!apiKey || apiKey.trim().length === 0) {
    /*
     * The bank is a safe fallback, but it is the fixed questionnaire the
     * adaptive engine was built to replace. Falling back to it because a
     * key was missing would quietly undo that, so production has to ask.
     */
    refuseInProduction(
      "OPENAI_API_KEY",
      "Question generation would silently fall back to the fixed question bank instead of adaptive questioning. Set OPENAI_API_KEY, or set QUESTION_PROVIDER=bank to accept the bank deliberately.",
    );
    return null;
  }
  cached = new OpenAIQuestionProvider({ apiKey });
  return cached;
}

/** Reset the cached provider — tests only. */
export function resetQuestionProvider(): void {
  cached = null;
}

export { OpenAIQuestionProvider };
export type { QuestionProvider, QuestionProviderResult } from "./types";
