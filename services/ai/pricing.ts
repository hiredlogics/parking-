/**
 * Versioned AI pricing.
 *
 * Rates change, and a historic cost must not silently re-price when
 * they do — so every usage row records the pricing version it was
 * costed under. Changing rates means adding a version, never editing
 * an existing one.
 *
 * Rates are per MILLION tokens, in GBP. `PRICING_VERSION` and the rates
 * can be overridden by environment so a rate change needs no deploy.
 */

export interface ModelRate {
  /** GBP per million input tokens. */
  input: number;
  /** GBP per million cached input tokens, where the provider bills less. */
  cachedInput: number;
  /** GBP per million output tokens. */
  output: number;
}

export interface PricingTable {
  version: string;
  currency: "GBP";
  rates: Record<string, ModelRate>;
  /** Used when the model is not in the table. */
  fallback: ModelRate;
}

/**
 * 2026-09 rates. Approximate GBP conversions of published USD list
 * prices — this produces an ESTIMATE for internal reporting, not an
 * invoice reconciliation.
 */
const V_2026_09: PricingTable = {
  version: "2026-09",
  currency: "GBP",
  rates: {
    "gpt-4o": { input: 2.0, cachedInput: 1.0, output: 8.0 },
    "gpt-4o-mini": { input: 0.12, cachedInput: 0.06, output: 0.48 },
    "gpt-5.4": { input: 1.0, cachedInput: 0.1, output: 8.0 },
    "gpt-5.4-mini": { input: 0.2, cachedInput: 0.02, output: 1.6 },
  },
  fallback: { input: 2.0, cachedInput: 1.0, output: 8.0 },
};

const TABLES: Record<string, PricingTable> = {
  [V_2026_09.version]: V_2026_09,
};

export function activePricing(): PricingTable {
  const requested = process.env.AI_PRICING_VERSION?.trim();
  if (requested && TABLES[requested]) return TABLES[requested];
  return V_2026_09;
}

export function rateFor(model: string, table = activePricing()): ModelRate {
  // Match the longest configured prefix, so "gpt-4o-2026-08-01" costs
  // as "gpt-4o" rather than silently falling back.
  const keys = Object.keys(table.rates).sort((a, b) => b.length - a.length);
  const hit = keys.find((k) => model === k || model.startsWith(k));
  return hit ? table.rates[hit] : table.fallback;
}

export interface TokenCounts {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
}

/** Estimated GBP cost of one call. */
export function estimateCost(
  model: string,
  tokens: TokenCounts,
  table = activePricing(),
): number {
  const rate = rateFor(model, table);
  const input = Math.max(0, tokens.inputTokens ?? 0);
  const cached = Math.max(0, tokens.cachedInputTokens ?? 0);
  const output = Math.max(0, tokens.outputTokens ?? 0);
  // Cached tokens are billed separately, so they are not also counted
  // as ordinary input.
  const uncached = Math.max(0, input - cached);

  const cost =
    (uncached / 1_000_000) * rate.input +
    (cached / 1_000_000) * rate.cachedInput +
    (output / 1_000_000) * rate.output;

  // Sub-penny precision matters when a case makes several small calls.
  return Math.round(cost * 1_000_000) / 1_000_000;
}
