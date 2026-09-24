/**
 * The model call that phrases one fact question.
 *
 * Runs on the QUESTION_GENERATION operation, which has been configured
 * in services/ai/models.ts (gpt-5.4-mini) since before the adaptive
 * questions were removed and has had no call site since. This is the
 * sanctioned use, and it is a narrow one: wording only, on the cheapest
 * configured model, with a hard deterministic floor underneath.
 *
 * FAILURE IS NOT ESCALATED
 * ------------------------
 * Unlike the grounds judge — where a failed call routes the case to
 * manual review, because a judge that quietly stops judging produces
 * identical letters — a failed generation here falls back to the
 * registry wording and the journey continues. The distinction is what
 * the two decide: the judge decides grounds, this decides adjectives.
 * Blocking a customer because prose could not be improved would be the
 * wrong trade.
 */
import OpenAI from "openai";
import { modelFor, openAiApiKey } from "@/services/ai/models";
import { callWithModelFallback } from "@/services/ai/modelFallback";
import { recordAiUsage } from "@/lib/ai/usage";
import type { KnownFacts } from "@/lib/facts/types";
import type { FactGap } from "@/lib/facts/gapResolver";
import {
  buildQuestionContext,
  buildQuestionUserPrompt,
  deterministicQuestion,
  isQuestionAcceptable,
  QUESTION_SYSTEM_PROMPT,
  type GeneratedQuestion,
} from "@/lib/facts/factQuestion";

/**
 * Wording generation is on whenever a key is configured.
 *
 * `FACT_QUESTIONS=deterministic` forces the floor, which is how the
 * acceptance tests assert the journey works with no model at all.
 */
export function factQuestionMode(): "model" | "deterministic" {
  const raw = (process.env.FACT_QUESTIONS ?? "").toLowerCase();
  if (raw === "deterministic" || raw === "off") return "deterministic";
  return openAiApiKey() ? "model" : "deterministic";
}

/** Bounded so a slow model cannot hold up the journey. */
const TIMEOUT_MS = 6_000;

const QUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["question", "help"],
  properties: {
    question: { type: "string" },
    help: { type: "string" },
  },
} as const;

let client: OpenAI | null = null;
function getClient(): OpenAI | null {
  const key = openAiApiKey();
  if (!key) return null;
  client ??= new OpenAI({ apiKey: key });
  return client;
}

/**
 * Phrase the question for one gap.
 *
 * Always returns something usable. `source` records whether the model's
 * wording survived, which is what the measurement harness counts.
 */
export async function generateFactQuestion(input: {
  gap: FactGap;
  facts: KnownFacts;
  caseId?: string | null;
}): Promise<GeneratedQuestion> {
  const floor = deterministicQuestion(input.gap);
  if (factQuestionMode() === "deterministic") return floor;

  const openai = getClient();
  if (!openai) return floor;

  try {
    const ctx = buildQuestionContext(input.gap, input.facts);
    const { result: response, model } = await callWithModelFallback(
      "QUESTION_GENERATION",
      (model) =>
        openai.responses.create(
          {
            model,
            temperature: 0,
            input: [
              {
                role: "system",
                content: [
                  { type: "input_text", text: QUESTION_SYSTEM_PROMPT },
                ],
              },
              {
                role: "user",
                content: [
                  { type: "input_text", text: buildQuestionUserPrompt(ctx) },
                ],
              },
            ],
            text: {
              format: {
                type: "json_schema",
                name: "fact_question",
                schema: QUESTION_SCHEMA,
                strict: true,
              },
            },
          },
          { timeout: TIMEOUT_MS },
        ),
    );

    await recordAiUsage({
      caseId: input.caseId ?? null,
      operation: "QUESTION_GENERATION",
      provider: "openai",
      model,
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens,
      requestId: response.id ?? null,
    });

    const text = response.output_text?.trim() ?? "";
    if (!text) return floor;
    const parsed = JSON.parse(text) as { question?: unknown; help?: unknown };
    const question =
      typeof parsed.question === "string" ? parsed.question.trim() : "";

    const verdict = isQuestionAcceptable(question, input.gap);
    if (!verdict.ok) {
      console.warn(
        `[factQuestion] rejected generated wording (${verdict.reason}) for ${input.gap.factKey}`,
      );
      return floor;
    }

    const help = typeof parsed.help === "string" ? parsed.help.trim() : "";
    return {
      ...floor,
      text: question,
      help: help.length > 0 ? help : floor.help,
      source: "model",
    };
  } catch (err) {
    console.warn(
      `[factQuestion] generation failed for ${input.gap.factKey}:`,
      err instanceof Error ? err.message : err,
    );
    return floor;
  }
}
