import OpenAI from "openai";
import type { ExtractedPcn, ExtractionResult, NoticeRoute } from "@/types";
import type { DocumentExtractionProvider } from "./types";
import { modelFor } from "@/services/ai/models";
import { callWithModelFallback } from "@/services/ai/modelFallback";
import { recordAiUsage } from "@/lib/ai/usage";

/**
 * Real OpenAI vision-based PCN extraction provider.
 *
 * Uses the Responses API with a strict JSON schema so the model can only
 * return exactly the field set we expect. The model is explicitly told:
 *   - to extract only what is visible in the document,
 *   - to return null for anything it cannot read confidently,
 *   - not to make any legal decisions,
 *   - not to select rule IDs or paragraph IDs,
 *   - not to decide whether the appeal should succeed.
 *
 * Supports uploaded PDFs and images (JPEG, PNG). The customer must
 * confirm/correct the extracted values before the deterministic rules
 * engine is allowed to consume them.
 */
export class OpenAIExtractionProvider implements DocumentExtractionProvider {
  readonly id: string;
  readonly displayName = "OpenAI Vision";
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(opts: { apiKey: string; model?: string; baseURL?: string }) {
    if (!opts.apiKey || opts.apiKey.trim().length === 0) {
      throw new Error(
        "OpenAIExtractionProvider requires an apiKey (set the OPENAI_API_KEY environment variable).",
      );
    }
    this.client = new OpenAI({ apiKey: opts.apiKey, baseURL: opts.baseURL });
    // Model choice comes from the central configuration service.
    this.model = opts.model ?? modelFor("EXTRACTION");
    this.id = `openai:${this.model}`;
  }

  async extract(file: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    hint?: string;
    /** Attributes the call to a case for cost reporting. */
    caseId?: string | null;
  }): Promise<ExtractionResult> {
    const bytes =
      file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    const b64 = toBase64(bytes);
    const mime = normaliseMime(file.mimeType, file.name);
    const isPdf = mime === "application/pdf";
    const isImage = mime.startsWith("image/");
    if (!isPdf && !isImage) {
      throw new Error(
        `OpenAIExtractionProvider only accepts PDF or image inputs; received mime "${file.mimeType}".`,
      );
    }

    const contentItem =
      isImage
        ? ({
            type: "input_image" as const,
            image_url: `data:${mime};base64,${b64}`,
            detail: "high" as const,
          })
        : ({
            type: "input_file" as const,
            filename: file.name || "pcn.pdf",
            file_data: `data:${mime};base64,${b64}`,
          });

    const { result: response, model } = await callWithModelFallback(
      "EXTRACTION",
      (model) =>
        this.client.responses.create({
          model,
          // Keep temperature at 0 for deterministic extraction.
          temperature: 0,
          input: [
            {
              role: "system",
              content: [{ type: "input_text", text: SYSTEM_PROMPT }],
            },
            {
              role: "user",
              content: [
                { type: "input_text", text: USER_PROMPT },
                contentItem,
              ],
            },
          ],
          text: {
            format: {
              type: "json_schema",
              name: "pcn_extraction",
              schema: PCN_JSON_SCHEMA,
              strict: true,
            },
          },
        }),
    );

    await recordAiUsage({
      caseId: file.caseId ?? null,
      operation: "EXTRACTION",
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
      throw new Error("OpenAI returned an empty response.");
    }

    let parsed: RawSchemaOutput;
    try {
      parsed = JSON.parse(outputText) as RawSchemaOutput;
    } catch (err) {
      throw new Error(
        `OpenAI returned non-JSON output: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const raw = toExtractedPcn(parsed);
    const confidence: ExtractionResult["confidence"] = {};

    return {
      raw,
      confidence,
      providerId: this.id,
      extractedAt: new Date().toISOString(),
      warnings: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Schema + prompt
// ---------------------------------------------------------------------------

/**
 * Strict JSON schema for OpenAI's structured output. Every property is
 * declared (required by strict mode) and each field is nullable via
 * `type: [..., "null"]`.
 */
const PCN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "operator_name",
    "pcn_number",
    "vrm",
    "vehicle_make",
    "parking_location",
    "uk_jurisdiction",
    "parking_event_date",
    "notice_issue_date",
    "notice_received_date",
    "notice_route",
    "entry_time",
    "exit_time",
    "total_recorded_duration",
    "charge_amount",
    "alleged_breach",
    "case_stage",
  ],
  properties: {
    operator_name: { type: ["string", "null"], description: "Private parking operator name, e.g. Euro Car Parks." },
    pcn_number: { type: ["string", "null"], description: "Parking Charge Notice reference / number." },
    vrm: { type: ["string", "null"], description: "Vehicle Registration Mark, e.g. AB12 CDE." },
    vehicle_make: { type: ["string", "null"], description: "Vehicle make, e.g. Ford, VW. Only if visibly stated." },
    parking_location: { type: ["string", "null"], description: "Site or location name and/or address — include town and postcode when printed." },
    uk_jurisdiction: {
      type: ["string", "null"],
      enum: ["ENGLAND_WALES", "SCOTLAND", "NORTHERN_IRELAND", "UNKNOWN", null],
      description:
        "Which UK nation the parking event occurred in, based on the site address, town, postcode, or explicit nation wording on the notice. ENGLAND_WALES covers both England and Wales. Use UNKNOWN only when the document gives no usable geographic signal.",
    },
    parking_event_date: {
      type: ["string", "null"],
      description:
        "Date of the alleged parking event in ISO YYYY-MM-DD. Return null if unclear.",
    },
    notice_issue_date: {
      type: ["string", "null"],
      description: "Date the notice was issued, in ISO YYYY-MM-DD.",
    },
    notice_received_date: {
      type: ["string", "null"],
      description:
        "Date the keeper received the notice, ISO YYYY-MM-DD. Almost never printed on the notice — expect null.",
    },
    notice_route: {
      type: ["string", "null"],
      enum: ["POSTAL", "WINDSCREEN", "UNKNOWN", null],
      description:
        "How the notice was served. Use POSTAL for a Notice to Keeper posted to the registered keeper; WINDSCREEN for a notice placed on the vehicle; UNKNOWN if unclear.",
    },
    entry_time: {
      type: ["string", "null"],
      description: "ANPR entry time as printed. Prefer HH:MM (24h) or ISO 8601.",
    },
    exit_time: {
      type: ["string", "null"],
      description: "ANPR exit time as printed. Prefer HH:MM (24h) or ISO 8601.",
    },
    total_recorded_duration: {
      type: ["integer", "null"],
      description: "Recorded duration in minutes if stated. Do not compute if not printed.",
    },
    charge_amount: {
      type: ["number", "null"],
      description: "Parking Charge amount in pounds. Numeric, no currency symbol.",
    },
    alleged_breach: {
      type: ["string", "null"],
      description: "Operator's stated reason / contravention, e.g. 'Failure to make a valid payment'.",
    },
    case_stage: {
      type: "string",
      enum: ["INITIAL_OPERATOR_APPEAL"],
      description: "Fixed value for this build.",
    },
  },
} as const;

const SYSTEM_PROMPT = [
  "You are a document-extraction assistant for UK private parking notices.",
  "You only extract facts that are clearly visible in the supplied document.",
  "You NEVER invent, guess, complete or normalise values that are not visibly present.",
  "You NEVER make legal decisions.",
  "You NEVER select rule identifiers or paragraph identifiers.",
  "You NEVER determine whether an appeal should succeed.",
  "If a field cannot be read confidently, return null for that field.",
  "You must return valid JSON matching the provided schema exactly.",
].join(" ");

const USER_PROMPT = [
  "Extract the following fields from the attached UK private parking notice.",
  "Return strict JSON matching the schema. Use null for any field that is not clearly visible.",
  "Dates must be ISO YYYY-MM-DD. Times must be HH:MM 24-hour when possible.",
  "For notice_route: POSTAL if it is a Notice to Keeper sent by post; WINDSCREEN if it was placed on the vehicle; UNKNOWN otherwise.",
  "For charge_amount: numeric in pounds only (no currency symbol).",
  "For uk_jurisdiction: classify the parking event location as ENGLAND_WALES, SCOTLAND, or NORTHERN_IRELAND from the site address, town, postcode, or nation wording on the notice. Use UNKNOWN only if there is no usable geographic signal.",
  "For parking_location: include the fullest site address available (site name, town, postcode).",
  "case_stage must be exactly 'INITIAL_OPERATOR_APPEAL'.",
].join(" ");

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

interface RawSchemaOutput {
  operator_name: string | null;
  pcn_number: string | null;
  vrm: string | null;
  vehicle_make: string | null;
  parking_location: string | null;
  uk_jurisdiction:
    | "ENGLAND_WALES"
    | "SCOTLAND"
    | "NORTHERN_IRELAND"
    | "UNKNOWN"
    | null;
  parking_event_date: string | null;
  notice_issue_date: string | null;
  notice_received_date: string | null;
  notice_route: NoticeRoute | null;
  entry_time: string | null;
  exit_time: string | null;
  total_recorded_duration: number | null;
  charge_amount: number | null;
  alleged_breach: string | null;
  case_stage: "INITIAL_OPERATOR_APPEAL";
}

function toExtractedPcn(o: RawSchemaOutput): ExtractedPcn {
  const undefIfNull = <T>(v: T | null): T | undefined => (v === null ? undefined : v);
  const jurisdiction =
    o.uk_jurisdiction && o.uk_jurisdiction !== "UNKNOWN"
      ? o.uk_jurisdiction
      : o.uk_jurisdiction === "UNKNOWN"
        ? ("UNKNOWN" as const)
        : undefined;
  return {
    operator_name: undefIfNull(o.operator_name),
    pcn_number: undefIfNull(o.pcn_number),
    vrm: undefIfNull(o.vrm)?.toUpperCase().replace(/\s+/g, " ").trim(),
    vehicle_make: undefIfNull(o.vehicle_make),
    parking_location: undefIfNull(o.parking_location),
    uk_jurisdiction: jurisdiction,
    parking_event_date: undefIfNull(o.parking_event_date),
    notice_issue_date: undefIfNull(o.notice_issue_date),
    notice_received_date: undefIfNull(o.notice_received_date),
    notice_route: undefIfNull(o.notice_route) ?? undefined,
    entry_time: undefIfNull(o.entry_time),
    exit_time: undefIfNull(o.exit_time),
    total_recorded_duration: undefIfNull(o.total_recorded_duration),
    charge_amount: undefIfNull(o.charge_amount),
    alleged_breach: undefIfNull(o.alleged_breach),
    case_stage: "INITIAL_OPERATOR_APPEAL",
  };
}

function toBase64(bytes: Uint8Array): string {
  // Node.js runtime — Buffer is available on the server route.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  if (B && typeof B.from === "function") {
    return B.from(bytes).toString("base64");
  }
  // Fallback (shouldn't be hit — this file only runs server-side).
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
  // Fall back on filename.
  const name = (filename ?? "").toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  return lc || "application/octet-stream";
}
