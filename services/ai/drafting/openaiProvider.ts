import OpenAI from "openai";
import {
  ACTIVE_DRAFTING_PROMPT,
  getDraftingPrompt,
} from "../prompts/drafting";
import { serialiseDraftingContext } from "./contextSerialiser";
import { modelFor } from "../models";
import { withTransientRetry } from "../transport";
import { recordAiUsage } from "@/lib/ai/usage";
import type { DraftResult, DraftingContext, DraftingProvider } from "../types";

/**
 * Bespoke AI drafting provider (MASTER Developer Pack V2 Part 6 of the
 * build sequence).
 *
 * The model receives only the approved context assembled by the
 * retrieval layer. It may rewrite, combine, reorder and deduplicate that
 * material into one coherent letter; it may not introduce a new legal
 * proposition, fact or authority.
 *
 * Everything the model returns is treated as untrusted and is
 * post-processed by lib/drafting/engine.ts before it can be used, and
 * independently validated in the Phase 7 validator pass.
 */
export class OpenAIDraftingProvider implements DraftingProvider {
  readonly id: string;
  readonly displayName = "OpenAI Drafting";
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
        "OpenAIDraftingProvider requires an apiKey (set OPENAI_API_KEY).",
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    // Model choice comes from the central configuration service.
    this.model = opts.model ?? modelFor("DRAFTING");
    this.promptVersion = opts.promptVersion ?? ACTIVE_DRAFTING_PROMPT;
    this.id = `openai-draft:${this.model}`;
  }

  async draft(context: DraftingContext): Promise<DraftResult> {
    const prompt = getDraftingPrompt(this.promptVersion);
    const warnings: string[] = [];

    const response = await withTransientRetry(
      () => this.client.responses.create({
      model: this.model,
      // Low but non-zero: the letter should read naturally while staying
      // tightly anchored to the supplied context.
      temperature: 0.3,
      max_output_tokens: 2000,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: prompt.body }],
        },
        {
          role: "user",
          content: [
            { type: "input_text", text: serialiseDraftingContext(context) },
          ],
        },
      ],
      }),
      { operation: "DRAFTING" },
    );

    await recordAiUsage({
      caseId: context.caseId ?? null,
      operation: "DRAFTING",
      provider: "openai",
      model: this.model,
      inputTokens: response.usage?.input_tokens,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
      outputTokens: response.usage?.output_tokens,
      requestId: response.id ?? null,
    });

    const body = (response.output_text ?? "").trim();
    if (body.length === 0) {
      throw new Error("Drafting model returned an empty response.");
    }

    const usage = response.usage
      ? {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
        }
      : undefined;

    if (context.modules.length === 0) {
      warnings.push(
        "No knowledge modules were supplied — the draft cannot be grounded in approved material.",
      );
    }

    return {
      body,
      providerId: this.id,
      promptVersion: prompt.id,
      model: this.model,
      bespoke: true,
      moduleIds: context.modules.map((m) => m.moduleId),
      warnings,
      usage,
    };
  }
}
