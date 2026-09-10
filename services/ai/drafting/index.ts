import { refuseInProduction } from "@/lib/config/production";
import { DeterministicDraftingProvider } from "./deterministicProvider";
import { OpenAIDraftingProvider } from "./openaiProvider";
import type { DraftingProvider } from "../types";

let cached: DraftingProvider | null = null;

/**
 * Drafting provider factory.
 *
 * Selection rules:
 *   1. DRAFTING_PROVIDER=deterministic  → always the deterministic
 *      fallback. Used by tests and for offline demos.
 *   2. DRAFTING_PROVIDER=openai         → force the AI provider; throws
 *      if OPENAI_API_KEY is absent, so a misconfiguration is loud.
 *   3. unset → AI provider when OPENAI_API_KEY exists, otherwise the
 *      deterministic fallback.
 *
 * Unlike extraction — where falling back to fixture data would be
 * dishonest and is therefore forbidden — falling back here is safe: the
 * deterministic provider emits only approved wording. It simply is not
 * bespoke, and it reports that fact.
 */
export function getDraftingProvider(): DraftingProvider {
  if (cached) return cached;
  const explicit = (process.env.DRAFTING_PROVIDER ?? "").toLowerCase();

  if (explicit === "deterministic") {
    cached = new DeterministicDraftingProvider();
    return cached;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (explicit === "openai") {
    if (!apiKey || apiKey.trim().length === 0) {
      throw new Error(
        "DRAFTING_PROVIDER=openai but OPENAI_API_KEY is not set. Set the key or use DRAFTING_PROVIDER=deterministic.",
      );
    }
    cached = new OpenAIDraftingProvider({ apiKey });
    return cached;
  }

  if (!apiKey || apiKey.trim().length === 0) {
    /*
     * The deterministic provider emits only approved wording, so this
     * fallback is safe. It is not bespoke, though, and selling a
     * customer template prose because a key was forgotten is not
     * acceptable — production must choose it deliberately.
     */
    refuseInProduction(
      "OPENAI_API_KEY",
      "Drafting would silently fall back to non-bespoke template prose. Set OPENAI_API_KEY, or set DRAFTING_PROVIDER=deterministic to accept template output deliberately.",
    );
  }

  cached = apiKey && apiKey.trim().length > 0
    ? new OpenAIDraftingProvider({ apiKey })
    : new DeterministicDraftingProvider();
  return cached;
}

/** Reset the cached provider — tests only. */
export function resetDraftingProvider(): void {
  cached = null;
}

export { DeterministicDraftingProvider, OpenAIDraftingProvider };
