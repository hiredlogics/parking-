import { OpenAIExtractionProvider } from "./openaiProvider";
import { ResilientExtractionProvider } from "./resilientProvider";
import { rulesExtractFromBytes } from "./rulesOcr";
import { MockDocumentExtractionProvider } from "./mockProvider";
import type { DocumentExtractionProvider } from "./types";

let cached: DocumentExtractionProvider | null = null;

/**
 * Extraction provider factory.
 *
 * Selection rules:
 *   - EXTRACTION_PROVIDER=mock → mock (tests only)
 *   - EXTRACTION_PROVIDER=rules → rules/OCR only (emergency / no OpenAI)
 *   - Otherwise OpenAI vision, wrapped with timeout + rules fallback + Redis/memory cache
 *
 * Fallback never invents legal advice — it only pattern-matches notice text
 * so the customer can still reach /appeal/confirm when AI is down.
 */
export function getExtractionProvider(): DocumentExtractionProvider {
  if (cached) return cached;
  const explicit = (process.env.EXTRACTION_PROVIDER ?? "").toLowerCase();

  if (explicit === "mock") {
    cached = new MockDocumentExtractionProvider();
    return cached;
  }

  const aiTimeoutMs = Number(process.env.EXTRACTION_AI_TIMEOUT_MS ?? 45_000);
  const cacheTtlSeconds = Number(process.env.EXTRACTION_CACHE_TTL_SECONDS ?? 3600);
  const disableFallback =
    String(process.env.EXTRACTION_DISABLE_FALLBACK ?? "").toLowerCase() === "1" ||
    String(process.env.EXTRACTION_DISABLE_FALLBACK ?? "").toLowerCase() === "true";

  if (explicit === "rules" || explicit === "ocr") {
    cached = {
      id: "rules-ocr",
      displayName: "Rules OCR",
      extract: async (file) => {
        const bytes =
          file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
        return rulesExtractFromBytes({
          name: file.name,
          mimeType: file.mimeType,
          bytes,
        });
      },
    } satisfies DocumentExtractionProvider;
    return cached;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      "[extraction] OPENAI_API_KEY missing — using rules OCR fallback only.",
    );
    cached = new ResilientExtractionProvider(
      {
        id: "none",
        displayName: "None",
        extract: async () => {
          throw new Error("OpenAI not configured");
        },
      },
      { aiTimeoutMs: 1, cacheTtlSeconds, rulesOnly: true },
    );
    return cached;
  }

  const primary = new OpenAIExtractionProvider({ apiKey });
  cached = new ResilientExtractionProvider(primary, {
    aiTimeoutMs: Number.isFinite(aiTimeoutMs) ? aiTimeoutMs : 45_000,
    cacheTtlSeconds: Number.isFinite(cacheTtlSeconds) ? cacheTtlSeconds : 3600,
    disableFallback,
  });
  return cached;
}

/** Reset the cached provider — for tests that swap env vars. */
export function resetExtractionProvider(): void {
  cached = null;
}

export type { DocumentExtractionProvider };
