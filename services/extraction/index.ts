import { MockDocumentExtractionProvider } from "./mockProvider";
import { OpenAIExtractionProvider } from "./openaiProvider";
import type { DocumentExtractionProvider } from "./types";

let cached: DocumentExtractionProvider | null = null;

/**
 * Extraction provider factory.
 *
 * Selection rules:
 *   - If `EXTRACTION_PROVIDER=mock` is explicitly set, use the mock
 *     provider. This is only intended for automated tests and local
 *     experimentation.
 *   - Otherwise, use the OpenAI vision provider. `OPENAI_API_KEY` must
 *     be set on the server — the factory throws otherwise, so we can
 *     never silently fall back to fake / demo data.
 *
 * The key is never exposed to the client: this file is imported only
 * by the `/api/extract` Route Handler, which runs on the Node.js
 * server runtime.
 */
export function getExtractionProvider(): DocumentExtractionProvider {
  if (cached) return cached;
  const explicit = (process.env.EXTRACTION_PROVIDER ?? "").toLowerCase();
  if (explicit === "mock") {
    cached = new MockDocumentExtractionProvider();
    return cached;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY is not set. Refusing to fall back to mock extraction. Set OPENAI_API_KEY in your server environment (e.g. .env) or set EXTRACTION_PROVIDER=mock for local tests.",
    );
  }
  cached = new OpenAIExtractionProvider({ apiKey });
  return cached;
}

/**
 * Reset the cached provider — useful in tests that swap env vars between
 * cases. Not intended to be called from application code.
 */
export function resetExtractionProvider(): void {
  cached = null;
}

export type { DocumentExtractionProvider };
