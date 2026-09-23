import OpenAI from "openai";
import type { DocumentTriageResult } from "@/types/triage";
import { modelFor } from "../models";
import { callWithModelFallback } from "../modelFallback";
import { recordAiUsage } from "@/lib/ai/usage";
import { TRIAGE_JSON_SCHEMA, TRIAGE_SYSTEM_PROMPT } from "../prompts/triage";
import type {
  DocumentTriageProvider,
  TriageProviderResult,
} from "./types";

type RawTriage = {
  document_kind: DocumentTriageResult["documentKind"];
  case_stage: DocumentTriageResult["caseStage"];
  sender_name: string | null;
  parking_operator_name: string | null;
  service_decision: DocumentTriageResult["serviceDecision"];
  reason_code: string;
  customer_detail: string;
  confidence: number;
  signals: string[];
};

export class OpenAITriageProvider implements DocumentTriageProvider {
  readonly id: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string; baseURL?: string }) {
    if (!opts.apiKey?.trim()) {
      throw new Error("OpenAITriageProvider requires OPENAI_API_KEY.");
    }
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    this.model = opts.model ?? modelFor("TRIAGE");
    this.id = `openai-triage:${this.model}`;
  }

  async assess(input: {
    file: { name: string; mimeType: string; bytes: Uint8Array };
    extractedHints?: {
      operatorName?: string | null;
      allegedBreach?: string | null;
      parkingLocation?: string | null;
      chargeAmount?: number | null;
    };
    caseId?: string | null;
  }): Promise<TriageProviderResult> {
    const base = { providerId: this.id, model: this.model };
    try {
      const mime = normaliseMime(input.file.mimeType, input.file.name);
      const b64 = toBase64(input.file.bytes);
      const isImage = mime.startsWith("image/");
      const contentItem = isImage
        ? ({
            type: "input_image" as const,
            image_url: `data:${mime};base64,${b64}`,
            detail: "high" as const,
          })
        : ({
            type: "input_file" as const,
            filename: input.file.name || "notice.pdf",
            file_data: `data:${mime};base64,${b64}`,
          });
      const hints = input.extractedHints
        ? `\nExtracted field hints (may be wrong — classify from the document itself):\n${JSON.stringify(input.extractedHints)}`
        : "";

      const { result: response, model } = await callWithModelFallback(
        "TRIAGE",
        (model) =>
          this.client.responses.create({
            model,
            temperature: 0,
            max_output_tokens: 800,
            text: {
              format: {
                type: "json_schema",
                name: TRIAGE_JSON_SCHEMA.name,
                strict: true,
                schema: TRIAGE_JSON_SCHEMA.schema,
              },
            },
            input: [
              {
                role: "system",
                content: [{ type: "input_text", text: TRIAGE_SYSTEM_PROMPT }],
              },
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text:
                      "Classify this uploaded UK parking-related document." +
                      hints,
                  },
                  contentItem,
                ],
              },
            ],
          }),
      );

      await recordAiUsage({
        caseId: input.caseId ?? null,
        operation: "TRIAGE",
        provider: "openai",
        model,
        inputTokens: response.usage?.input_tokens,
        cachedInputTokens:
          response.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: response.usage?.output_tokens,
        requestId: response.id ?? null,
      });

      const raw = (response.output_text ?? "").trim();
      if (!raw) {
        return { ...base, output: null, error: "Empty triage response." };
      }
      const parsed = JSON.parse(raw) as RawTriage;
      return {
        ...base,
        output: {
          documentKind: parsed.document_kind,
          caseStage: parsed.case_stage,
          senderName: parsed.sender_name,
          parkingOperatorName: parsed.parking_operator_name,
          serviceDecision:
            parsed.service_decision === "WRONG_STAGE_REDIRECT"
              ? "NOT_SUPPORTED"
              : parsed.service_decision,
          reasonCode: parsed.reason_code || "TRIAGE_AI",
          detail: parsed.customer_detail,
          confidence:
            typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
          signals: Array.isArray(parsed.signals) ? parsed.signals : [],
          providerId: this.id,
          model,
          assessedAt: new Date().toISOString(),
        },
      };
    } catch (err) {
      return {
        ...base,
        output: null,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  if (B && typeof B.from === "function") {
    return B.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.byteLength; i++) s += String.fromCharCode(bytes[i]);
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
