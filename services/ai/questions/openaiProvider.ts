import OpenAI from "openai";
import type {
  GenerationContext,
  GeneratorOutput,
} from "@/lib/questions/generated";
import {
  ACTIVE_QUESTION_PROMPT,
  getQuestionPrompt,
} from "../prompts/questions";
import { serialiseQuestionContext } from "./contextSerialiser";
import { modelFor } from "../models";
import { callWithModelFallback } from "../modelFallback";
import { recordAiUsage } from "@/lib/ai/usage";
import type { QuestionProvider, QuestionProviderResult } from "./types";

/**
 * AI question generator.
 *
 * Everything this returns is untrusted. `lib/questions/validateGenerated`
 * re-checks the target fact, route, reason code and wording against the
 * controlled requirement map before a customer can see it.
 */
export class OpenAIQuestionProvider implements QuestionProvider {
  readonly id: string;
  readonly bespoke = true;
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly promptVersion: string;

  constructor(opts: {
    apiKey: string;
    model?: string;
    baseURL?: string;
    promptVersion?: string;
  }) {
    if (!opts.apiKey || opts.apiKey.trim().length === 0) {
      throw new Error(
        "OpenAIQuestionProvider requires an apiKey (set OPENAI_API_KEY).",
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    // Model choice comes from the central configuration service.
    this.model = opts.model ?? modelFor("QUESTION_GENERATION");
    this.promptVersion = opts.promptVersion ?? ACTIVE_QUESTION_PROMPT;
    this.id = `openai-question:${this.model}`;
  }

  async generate(context: GenerationContext): Promise<QuestionProviderResult> {
    const prompt = getQuestionPrompt(this.promptVersion);
    const base = {
      providerId: this.id,
      model: this.model,
      promptVersion: prompt.id,
    };

    try {
      const { result: response, model } = await callWithModelFallback(
        "QUESTION_GENERATION",
        (model) =>
          this.client.responses.create({
            model,
            // Low: wording may vary per case, structure must not.
            temperature: 0.2,
            max_output_tokens: 700,
            text: { format: { type: "json_object" } },
            input: [
              { role: "system", content: [{ type: "input_text", text: prompt.system }] },
              {
                role: "user",
                content: [
                  { type: "input_text", text: serialiseQuestionContext(context) },
                ],
              },
            ],
          }),
      );

      await recordAiUsage({
        caseId: context.caseId ?? null,
        operation: "QUESTION_GENERATION",
        provider: "openai",
        model,
        inputTokens: response.usage?.input_tokens,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens,
        requestId: response.id ?? null,
      });

      const raw = (response.output_text ?? "").trim();
      if (raw.length === 0) {
        return { ...base, model, output: null, error: "Model returned an empty response." };
      }

      const parsed = parseOutput(raw);
      if (!parsed) {
        return { ...base, model, output: null, error: "Model returned unparseable JSON." };
      }
      return { ...base, model, output: parsed };
    } catch (err) {
      // A provider failure must never be reported as "no more questions".
      return {
        ...base,
        output: null,
        error: err instanceof Error ? err.message : "Question generation failed.",
      };
    }
  }
}

/** Tolerate a stray markdown fence around otherwise valid JSON. */
export function parseOutput(raw: string): GeneratorOutput | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const value = JSON.parse(cleaned) as GeneratorOutput;
    if (!value || typeof value !== "object") return null;
    if (
      value.status !== "QUESTION_REQUIRED" &&
      value.status !== "SUFFICIENT_INFORMATION"
    ) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}
