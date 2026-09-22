import { OpenAITriageProvider } from "./openaiProvider";
import type { DocumentTriageProvider } from "./types";

let cached: DocumentTriageProvider | null = null;

/**
 * Document triage provider.
 *
 *   TRIAGE_PROVIDER=deterministic → skip AI (tests / offline)
 *   TRIAGE_PROVIDER=openai        → require key
 *   unset → AI when OPENAI_API_KEY set, else null (caller uses deterministic)
 */
export function getTriageProvider(): DocumentTriageProvider | null {
  if (cached) return cached;
  const explicit = (process.env.TRIAGE_PROVIDER ?? "").toLowerCase();
  if (explicit === "deterministic" || explicit === "off") return null;

  const apiKey = process.env.OPENAI_API_KEY;
  if (explicit === "openai") {
    if (!apiKey?.trim()) {
      throw new Error(
        "TRIAGE_PROVIDER=openai but OPENAI_API_KEY is not set.",
      );
    }
    cached = new OpenAITriageProvider({ apiKey });
    return cached;
  }

  if (!apiKey?.trim()) return null;
  cached = new OpenAITriageProvider({ apiKey });
  return cached;
}

export function resetTriageProvider(): void {
  cached = null;
}

export type { DocumentTriageProvider, TriageProviderResult } from "./types";
export { OpenAITriageProvider };
