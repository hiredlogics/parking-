import { MockEvidenceUnderstandingProvider } from "./mockProvider";
import { OpenAIEvidenceUnderstandingProvider } from "./openaiProvider";
import type { EvidenceUnderstandingProvider } from "./types";

let cached: EvidenceUnderstandingProvider | null = null;

/**
 * Evidence-reading provider factory.
 *
 *   EVIDENCE_PROVIDER=mock → mock (tests, local sanity checks)
 *   EVIDENCE_PROVIDER=off  → disabled; documents are not read
 *   otherwise              → OpenAI, if a key is configured
 *
 * With no API key the reader is DISABLED rather than falling back to
 * something weaker. There is no rules-based way to read a tenancy
 * agreement, and a fallback that guessed would defeat the point: the
 * case simply keeps whatever the notice, the customer and the
 * evidence-type derivation established, which is exactly the behaviour
 * before this layer existed.
 */
export function getEvidenceUnderstandingProvider(): EvidenceUnderstandingProvider | null {
  const explicit = (process.env.EVIDENCE_PROVIDER ?? "").toLowerCase();
  if (explicit === "off" || explicit === "none") return null;
  if (cached) return cached;

  if (explicit === "mock") {
    cached = new MockEvidenceUnderstandingProvider();
    return cached;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    console.warn(
      "[evidence] OPENAI_API_KEY missing — uploaded documents will not be read.",
    );
    return null;
  }

  cached = new OpenAIEvidenceUnderstandingProvider({ apiKey });
  return cached;
}

/** Reset the cached provider — for tests that swap env vars. */
export function resetEvidenceUnderstandingProvider(): void {
  cached = null;
}

export type { EvidenceUnderstandingProvider };
