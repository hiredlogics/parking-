import OpenAI from "openai";
import { modelFor } from "@/services/ai/models";
import { callWithModelFallback } from "@/services/ai/modelFallback";
import { recordAiUsage } from "@/lib/ai/usage";
import { judgeSchema } from "./schema";
import { JUDGE_SYSTEM_PROMPT, buildJudgeUserPrompt } from "./prompt";
import type {
  GroundsJudgeProvider,
  JudgeGround,
  JudgeInput,
  JudgeVerdict,
} from "./types";

/**
 * The real grounds judge, on the ANALYSIS operation.
 *
 * ANALYSIS was configured in services/ai/models.ts with no call sites
 * and an explicit warning that "a configured model name is not
 * permission to replace" the deterministic layers. This is the
 * sanctioned use: it does not replace PoFA chronology, date arithmetic,
 * Code applicability or source governance — all of which remain
 * deterministic and all of which have already run by the time the judge
 * is called. It decides which of the grounds those layers permitted to
 * actually argue.
 *
 * A malformed or unparseable response throws. The caller turns that into
 * JUDGE_SCHEMA_INVALID / JUDGE_TRANSPORT_FAILED and routes the case to
 * manual review — never into a silent fallback, because a judge that
 * quietly stops judging is exactly the failure that produced identical
 * letters in the first place.
 */
export class OpenAIGroundsJudgeProvider implements GroundsJudgeProvider {
  readonly id: string;
  readonly displayName = "OpenAI Grounds Judge";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string; baseURL?: string }) {
    if (!opts.apiKey || opts.apiKey.trim().length === 0) {
      throw new Error(
        "OpenAIGroundsJudgeProvider requires an apiKey (set OPENAI_API_KEY).",
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.model = opts.model ?? modelFor("ANALYSIS");
    this.id = `openai:${this.model}`;
  }

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const spec = judgeSchema({
      candidateModuleIds: [
        ...input.eligible.map((m) => m.moduleId),
        ...input.overridable.map((m) => m.moduleId),
      ],
      facts: input.facts,
    });

    const { result: response, model } = await callWithModelFallback(
      "ANALYSIS",
      (model) =>
        this.client.responses.create({
          model,
          temperature: 0,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: JUDGE_SYSTEM_PROMPT }],
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: buildJudgeUserPrompt(input) },
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: spec.name,
              schema: spec.schema,
              strict: true,
            },
          },
        }),
    );

    await recordAiUsage({
      caseId: input.caseId ?? null,
      operation: "ANALYSIS",
      provider: "openai",
      model,
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens,
      requestId: response.id ?? null,
    });

    const outputText = response.output_text?.trim() ?? "";
    if (!outputText) {
      throw new Error("Grounds judge returned an empty response.");
    }

    let parsed: {
      case_understanding?: unknown;
      grounds?: unknown;
    };
    try {
      parsed = JSON.parse(outputText);
    } catch (err) {
      throw new Error(
        `Grounds judge returned non-JSON output: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!Array.isArray(parsed.grounds)) {
      throw new Error("Grounds judge returned no grounds array.");
    }

    const grounds: JudgeGround[] = [];
    for (const raw of parsed.grounds) {
      if (!raw || typeof raw !== "object") continue;
      const g = raw as Record<string, unknown>;
      const moduleId = typeof g.module_id === "string" ? g.module_id : null;
      if (!moduleId) continue;
      const confidence = Number(g.confidence);
      grounds.push({
        moduleId,
        applies: g.applies === true,
        confidence: Number.isFinite(confidence)
          ? Math.max(0, Math.min(1, confidence))
          : 0,
        groundingFactKeys: Array.isArray(g.grounding_fact_keys)
          ? g.grounding_fact_keys.filter(
              (k): k is string => typeof k === "string",
            )
          : [],
        reasoning: typeof g.reasoning === "string" ? g.reasoning : "",
      });
    }

    return {
      caseUnderstanding:
        typeof parsed.case_understanding === "string"
          ? parsed.case_understanding
          : "",
      grounds,
      providerId: this.id,
      model,
    };
  }
}
