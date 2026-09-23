import OpenAI from "openai";
import type {
  DocumentFactCandidate,
  EvidenceUnderstanding,
  EvidenceUnderstandingProvider,
} from "./types";
import { schemaForEvidenceType } from "./scope";
import { modelFor } from "@/services/ai/models";
import { callWithModelFallback } from "@/services/ai/modelFallback";
import { recordAiUsage } from "@/lib/ai/usage";
import type { AnswerValue } from "@/lib/facts/types";

/**
 * Reads an uploaded evidence document and reports what it shows.
 *
 * Runs on the ANALYSIS operation, and uses the same strict-schema
 * discipline as notice extraction: the schema is generated from the fact
 * registry for the document's own category, so the model is constrained
 * to the exact value space the rest of the system compares against, and
 * cannot return a fact the category has no business establishing.
 *
 * The model is told, and the merge layer then enforces, that it is
 * reading only — it does not decide grounds or whether the appeal
 * succeeds. Nothing it returns is trusted on its own account:
 * lib/facts/fromDocuments.ts re-checks scope, vocabulary and shape, and
 * defers to anything the notice or the customer already established.
 */
export class OpenAIEvidenceUnderstandingProvider
  implements EvidenceUnderstandingProvider
{
  readonly id: string;
  readonly displayName = "OpenAI Evidence Reader";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string; baseURL?: string }) {
    if (!opts.apiKey || opts.apiKey.trim().length === 0) {
      throw new Error(
        "OpenAIEvidenceUnderstandingProvider requires an apiKey (set OPENAI_API_KEY).",
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.model = opts.model ?? modelFor("ANALYSIS");
    this.id = `openai:${this.model}`;
  }

  async derive(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    evidenceType: string;
    caseId?: string | null;
  }): Promise<EvidenceUnderstanding> {
    const spec = schemaForEvidenceType(input.evidenceType);
    if (!spec) {
      // No scope for this category — nothing can be read from it safely.
      return {
        facts: [],
        typeMismatch: false,
        documentSummary: `Uncategorised upload (${input.evidenceType}); not read.`,
        providerId: this.id,
        readAt: new Date().toISOString(),
        warnings: [
          `No fact scope is defined for evidence type "${input.evidenceType}", so the document was not read.`,
        ],
      };
    }

    const bytes =
      input.bytes instanceof Uint8Array
        ? input.bytes
        : new Uint8Array(input.bytes);
    const mime = normaliseMime(input.mimeType, input.name);
    const isPdf = mime === "application/pdf";
    const isImage = mime.startsWith("image/");
    if (!isPdf && !isImage) {
      throw new Error(
        `OpenAIEvidenceUnderstandingProvider only accepts PDF or image inputs; received "${input.mimeType}".`,
      );
    }
    const b64 = toBase64(bytes);
    const contentItem = isImage
      ? {
          type: "input_image" as const,
          image_url: `data:${mime};base64,${b64}`,
          detail: "high" as const,
        }
      : {
          type: "input_file" as const,
          filename: input.name || "evidence.pdf",
          file_data: `data:${mime};base64,${b64}`,
        };

    const { result: response, model } = await callWithModelFallback(
      "ANALYSIS",
      (model) =>
        this.client.responses.create({
          model,
          temperature: 0,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: SYSTEM_PROMPT }],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: userPrompt(input.evidenceType),
                },
                contentItem,
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
    if (!outputText) throw new Error("OpenAI returned an empty response.");

    let parsed: {
      document_summary: string;
      type_matches_category: boolean;
      facts: Record<string, unknown>;
      basis: Record<string, string | null>;
    };
    try {
      parsed = JSON.parse(outputText);
    } catch (err) {
      throw new Error(
        `OpenAI returned non-JSON output: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const facts: DocumentFactCandidate[] = [];
    for (const [factKey, value] of Object.entries(parsed.facts ?? {})) {
      if (value === null || value === undefined) continue;
      facts.push({
        factKey,
        value: value as AnswerValue,
        basis: parsed.basis?.[factKey] ?? "",
        confidence: 0.8,
      });
    }

    return {
      facts,
      typeMismatch: parsed.type_matches_category === false,
      documentSummary: parsed.document_summary ?? "",
      providerId: this.id,
      readAt: new Date().toISOString(),
      warnings:
        parsed.type_matches_category === false
          ? [
              `The document does not appear to be a ${input.evidenceType.replace(/_/g, " ")}.`,
            ]
          : [],
    };
  }
}

const SYSTEM_PROMPT = [
  "You read supporting documents a motorist has uploaded to appeal a UK private parking charge.",
  "You report ONLY what the document itself visibly shows.",
  "You NEVER infer, assume, complete or normalise anything that is not visibly present.",
  "You NEVER decide whether the appeal should succeed, which legal grounds apply, or which rules are relevant.",
  "If the document does not show a field, return null for it. Returning null is always acceptable and is better than a guess.",
  "For every non-null field you must also give the wording or feature of the document that supports it.",
  "You must return valid JSON matching the provided schema exactly.",
].join(" ");

function userPrompt(evidenceType: string): string {
  return [
    `This document was uploaded as: ${evidenceType.replace(/_/g, " ")}.`,
    "Read it and report only the fields in the schema that the document actually shows.",
    "Set type_matches_category to false if the document is not really what the category says.",
    "Use null for every field the document does not show. Do not guess.",
  ].join(" ");
}

function toBase64(bytes: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  if (B && typeof B.from === "function") return B.from(bytes).toString("base64");
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
  // eslint-disable-next-line no-undef
  return typeof btoa !== "undefined" ? btoa(s) : "";
}

function normaliseMime(mime: string | undefined, filename: string): string {
  const lc = (mime ?? "").toLowerCase();
  if (lc.includes("pdf")) return "application/pdf";
  if (lc.includes("jpeg") || lc.includes("jpg")) return "image/jpeg";
  if (lc.includes("png")) return "image/png";
  const name = (filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return lc || "application/octet-stream";
}
