import { QUESTION_BANK } from "./bank";
import { toWireQuestion } from "./engine";
import { assertQuestionKeeperSafe } from "./keeperGuard";
import type { Question, QuestionDef } from "./types";
import type { KnownFacts } from "@/lib/facts/types";
import type { FactRequirement } from "@/lib/facts/requirements";

/**
 * Controlled fallback.
 *
 * The 27-question bank is no longer how questions are chosen — the
 * requirement map decides what is needed and the AI phrases it. The
 * bank survives as the safety net for three cases:
 *
 *   - no AI configured,
 *   - the AI failed or was unreachable,
 *   - the AI produced an invalid question twice.
 *
 * A bank question is only usable here if it establishes the fact we
 * actually need, so the fallback answers the same requirement rather
 * than diverting the journey.
 */

/** Bank questions that establish a given fact. */
export function bankQuestionsForFact(fact: string): QuestionDef[] {
  return QUESTION_BANK.filter((q) => q.establishesFacts.includes(fact));
}

export interface FallbackResult {
  question: Question;
  definition: QuestionDef;
}

/**
 * Find a bank question for this requirement.
 *
 * `askWhen` is still honoured: a bank question whose own gate says it
 * is not applicable must not be forced on the customer just because the
 * AI failed.
 */
export function fallbackQuestionFor(
  requirement: FactRequirement,
  facts: KnownFacts,
  opts: { ignoreGate?: boolean } = {},
): FallbackResult | null {
  const candidates = bankQuestionsForFact(requirement.fact)
    .filter((def) => opts.ignoreGate || def.askWhen(facts))
    .sort((a, b) => a.priority - b.priority);

  const chosen = candidates[0];
  if (!chosen) return null;

  // The same non-negotiable check the AI path gets.
  assertQuestionKeeperSafe(chosen);
  return { question: toWireQuestion(chosen), definition: chosen };
}

/**
 * Which outstanding requirements the bank can actually serve.
 *
 * Used to decide whether a fallback journey can continue at all, rather
 * than silently declaring the case complete.
 */
export function coverableByBank(
  requirements: FactRequirement[],
  facts: KnownFacts,
): FactRequirement[] {
  return requirements.filter((r) => fallbackQuestionFor(r, facts) !== null);
}
