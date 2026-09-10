/**
 * Central OpenAI model configuration.
 *
 * MASTER V2 Part 15: "Admin can update modules, Code versions and
 * drafting/validation instructions without rebuilding the application."
 * Model choice is part of that. Model names previously lived inline in
 * three provider constructors with three different env var names, so
 * changing one meant a code change and a deploy.
 *
 * This is the single server-side source. Nothing here is exposed to the
 * browser, and no model string appears anywhere else in the codebase.
 *
 * Resolution order, cheapest first:
 *   1. a runtime override (the seam a future admin screen writes to)
 *   2. the operation's own environment variable
 *   3. OPENAI_MODEL, for a single global override
 *   4. the shipped default
 */

export type AiOperation =
  | "EXTRACTION"
  | "QUESTION_GENERATION"
  | "ANALYSIS"
  | "DRAFTING"
  | "VALIDATION";

export const AI_OPERATIONS: readonly AiOperation[] = [
  "EXTRACTION",
  "QUESTION_GENERATION",
  "ANALYSIS",
  "DRAFTING",
  "VALIDATION",
] as const;

const ENV_KEYS: Record<AiOperation, string> = {
  EXTRACTION: "OPENAI_EXTRACTION_MODEL",
  QUESTION_GENERATION: "OPENAI_QUESTION_MODEL",
  ANALYSIS: "OPENAI_ANALYSIS_MODEL",
  DRAFTING: "OPENAI_DRAFTING_MODEL",
  VALIDATION: "OPENAI_VALIDATION_MODEL",
};

/**
 * Shipped defaults.
 *
 * These IDs were verified against the project's own OpenAI account
 * before being set here — `gpt-5.4` and `gpt-5.4-mini` both exist.
 * They are not guesses.
 *
 * ANALYSIS and VALIDATION are configured for completeness but have NO
 * call sites: PoFA chronology, date arithmetic, Code applicability,
 * route applicability, source governance and release validation are
 * all deterministic code and must stay that way. A configured model
 * name is not permission to replace them.
 */
const DEFAULTS: Record<AiOperation, string> = {
  // Vision extraction — the cheaper model handles a PCN comfortably.
  EXTRACTION: "gpt-5.4-mini",
  // One short question at a time; wording quality matters more than depth.
  QUESTION_GENERATION: "gpt-5.4-mini",
  // Configured only. Deterministic today.
  ANALYSIS: "gpt-5.4",
  // The bespoke appeal. The one place the stronger model earns its cost.
  DRAFTING: "gpt-5.4",
  // Configured only. Deterministic today.
  VALIDATION: "gpt-5.4",
};

/** Runtime overrides. The seam a future admin screen writes through. */
const overrides = new Map<AiOperation, string>();

export function modelFor(operation: AiOperation): string {
  const override = overrides.get(operation);
  if (override && override.trim().length > 0) return override.trim();

  const specific = process.env[ENV_KEYS[operation]];
  if (specific && specific.trim().length > 0) return specific.trim();

  const global = process.env.OPENAI_MODEL;
  if (global && global.trim().length > 0) return global.trim();

  return DEFAULTS[operation];
}

/**
 * Override a model at runtime.
 *
 * Intended for an admin configuration screen. Pass null to clear and
 * fall back to environment/default.
 */
export function setModelOverride(
  operation: AiOperation,
  model: string | null,
): void {
  if (model === null || model.trim().length === 0) {
    overrides.delete(operation);
    return;
  }
  overrides.set(operation, model.trim());
}

/** Clear every override — tests, and an admin "reset to defaults". */
export function clearModelOverrides(): void {
  overrides.clear();
}

/** Current resolved configuration. Server-side only. */
export function modelConfiguration(): Array<{
  operation: AiOperation;
  model: string;
  envKey: string;
  source: "override" | "env" | "global" | "default";
}> {
  return AI_OPERATIONS.map((operation) => {
    const envKey = ENV_KEYS[operation];
    let source: "override" | "env" | "global" | "default" = "default";
    if (overrides.get(operation)) source = "override";
    else if (process.env[envKey]?.trim()) source = "env";
    else if (process.env.OPENAI_MODEL?.trim()) source = "global";
    return { operation, model: modelFor(operation), envKey, source };
  });
}

/** The env var name for an operation, for error messages and docs. */
export function envKeyFor(operation: AiOperation): string {
  return ENV_KEYS[operation];
}

/**
 * The API key. Server-side only.
 *
 * Never returned through an API, never logged, never prefixed
 * NEXT_PUBLIC_, never stored against a case.
 */
export function openAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}
