/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activePricing,
  estimateCost,
  rateFor,
} from "@/services/ai/pricing";
import {
  AI_OPERATIONS,
  clearModelOverrides,
  envKeyFor,
  modelConfiguration,
  modelFor,
  setModelOverride,
} from "@/services/ai/models";

/**
 * AI-3 and AI-4 — model configuration, usage and cost.
 */

let rows: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db/schema", () => ({ ensureSchema: async () => {} }));
vi.mock("@/lib/db/pool", () => ({
  hasDb: () => true,
  getSql: () => ({
    query: async (text: string, params: unknown[]) => {
      if (text.includes("INSERT INTO ai_usage")) {
        rows.push({
          case_id: params[1], operation: params[2], provider: params[3],
          model: params[4], input_tokens: params[5],
          cached_input_tokens: params[6], output_tokens: params[7],
          request_id: params[8], estimated_cost: params[9],
          pricing_version: params[10],
        });
        return { rows: [] };
      }
      if (text.includes("GROUP BY operation")) {
        const byOp = new Map<string, Record<string, number | string>>();
        for (const r of rows.filter((x) => x.case_id === params[0])) {
          const key = `${r.operation}|${r.pricing_version}`;
          const cur = byOp.get(key) ?? {
            operation: r.operation as string,
            pricing_version: r.pricing_version as string,
            calls: 0, input_tokens: 0, cached_input_tokens: 0,
            output_tokens: 0, estimated_cost: 0,
          };
          cur.calls = (cur.calls as number) + 1;
          cur.input_tokens = (cur.input_tokens as number) + Number(r.input_tokens);
          cur.cached_input_tokens =
            (cur.cached_input_tokens as number) + Number(r.cached_input_tokens);
          cur.output_tokens = (cur.output_tokens as number) + Number(r.output_tokens);
          cur.estimated_cost =
            (cur.estimated_cost as number) + Number(r.estimated_cost);
          byOp.set(key, cur);
        }
        return { rows: [...byOp.values()] };
      }
      if (text.includes("SELECT * FROM ai_usage")) {
        return { rows: rows.filter((r) => r.case_id === params[0]) };
      }
      return { rows: [] };
    },
  }),
}));

const { recordAiUsage, getCaseAIUsage, listCaseAiUsage } = await import(
  "@/lib/ai/usage"
);

beforeEach(() => {
  rows = [];
  clearModelOverrides();
  for (const op of AI_OPERATIONS) delete process.env[envKeyFor(op)];
  delete process.env.OPENAI_MODEL;
});
afterEach(() => {
  clearModelOverrides();
  delete process.env.OPENAI_MODEL;
});

/* ==================== AI-3 model configuration ==================== */

describe("Central model configuration", () => {
  it("covers all six operations", () => {
    expect([...AI_OPERATIONS].sort()).toEqual(
      ["ANALYSIS", "DRAFTING", "EXTRACTION", "QUESTION_GENERATION", "TRIAGE", "VALIDATION"].sort(),
    );
  });

  it("uses the client's env var names", () => {
    expect(envKeyFor("EXTRACTION")).toBe("OPENAI_EXTRACTION_MODEL");
    expect(envKeyFor("TRIAGE")).toBe("OPENAI_TRIAGE_MODEL");
    expect(envKeyFor("QUESTION_GENERATION")).toBe("OPENAI_QUESTION_MODEL");
    expect(envKeyFor("ANALYSIS")).toBe("OPENAI_ANALYSIS_MODEL");
    expect(envKeyFor("DRAFTING")).toBe("OPENAI_DRAFTING_MODEL");
    expect(envKeyFor("VALIDATION")).toBe("OPENAI_VALIDATION_MODEL");
  });

  it("falls back to the verified shipped defaults", () => {
    // Verified against the project's OpenAI account before being set.
    expect(modelFor("DRAFTING")).toBe("gpt-5.4");
    expect(modelFor("EXTRACTION")).toBe("gpt-5.4-mini");
    expect(modelFor("QUESTION_GENERATION")).toBe("gpt-5.4-mini");
  });

  it("reads the operation's own environment variable", () => {
    process.env.OPENAI_DRAFTING_MODEL = "gpt-4o";
    expect(modelFor("DRAFTING")).toBe("gpt-4o");
    // Other operations are unaffected.
    expect(modelFor("EXTRACTION")).toBe("gpt-5.4-mini");
  });

  it("supports a single global override", () => {
    process.env.OPENAI_MODEL = "gpt-5.4-mini";
    expect(modelFor("ANALYSIS")).toBe("gpt-5.4-mini");
  });

  it("prefers a specific key over the global one", () => {
    process.env.OPENAI_MODEL = "gpt-4o";
    process.env.OPENAI_DRAFTING_MODEL = "gpt-5.4-pro";
    expect(modelFor("DRAFTING")).toBe("gpt-5.4-pro");
  });

  it("lets a runtime override win, for a future admin screen", () => {
    process.env.OPENAI_QUESTION_MODEL = "gpt-4o";
    setModelOverride("QUESTION_GENERATION", "gpt-5.4-nano");
    expect(modelFor("QUESTION_GENERATION")).toBe("gpt-5.4-nano");
    setModelOverride("QUESTION_GENERATION", null);
    expect(modelFor("QUESTION_GENERATION")).toBe("gpt-4o");
  });

  it("reports where each model came from", () => {
    process.env.OPENAI_EXTRACTION_MODEL = "gpt-5.4-mini";
    setModelOverride("DRAFTING", "gpt-5.4");
    const cfg = modelConfiguration();
    expect(cfg.find((c) => c.operation === "EXTRACTION")?.source).toBe("env");
    expect(cfg.find((c) => c.operation === "DRAFTING")?.source).toBe("override");
    expect(cfg.find((c) => c.operation === "ANALYSIS")?.source).toBe("default");
  });
});

/* ========================= AI-4 pricing ========================= */

describe("Versioned pricing", () => {
  it("has a version, so historic costs cannot silently re-price", () => {
    expect(activePricing().version).toMatch(/^\d{4}-\d{2}$/);
  });

  it("matches a dated model name to its base rate", () => {
    // "gpt-4o-2026-08-01" must cost as gpt-4o, not fall back.
    expect(rateFor("gpt-4o-2026-08-01").input).toBe(rateFor("gpt-4o").input);
  });

  it("falls back for an unknown model rather than costing zero", () => {
    expect(rateFor("some-new-model").input).toBeGreaterThan(0);
  });

  it("bills cached input at the cheaper rate", () => {
    const full = estimateCost("gpt-4o", { inputTokens: 1_000_000 });
    const cached = estimateCost("gpt-4o", {
      inputTokens: 1_000_000,
      cachedInputTokens: 1_000_000,
    });
    expect(cached).toBeLessThan(full);
  });

  it("does not double-count cached tokens as ordinary input", () => {
    const rate = rateFor("gpt-4o");
    const cost = estimateCost("gpt-4o", {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
    });
    const expected = 0.6 * rate.input + 0.4 * rate.cachedInput;
    expect(cost).toBeCloseTo(expected, 5);
  });

  it("costs nothing for zero tokens", () => {
    expect(estimateCost("gpt-4o", {})).toBe(0);
  });
});

/* ====================== AI-4 usage tracking ====================== */

describe("Case AI usage", () => {
  it("records a call and reports it under the right operation", async () => {
    await recordAiUsage({
      caseId: "case_1", operation: "EXTRACTION", provider: "openai",
      model: "gpt-4o", inputTokens: 2000, outputTokens: 500,
      requestId: "req_1",
    });
    const usage = await getCaseAIUsage("case_1");
    expect(usage.extraction.calls).toBe(1);
    expect(usage.extraction.inputTokens).toBe(2000);
    expect(usage.extraction.estimatedCost).toBeGreaterThan(0);
  });

  it("totals a complete appeal across every operation", async () => {
    await recordAiUsage({
      caseId: "case_1", operation: "EXTRACTION", provider: "openai",
      model: "gpt-4o", inputTokens: 3000, outputTokens: 400,
    });
    await recordAiUsage({
      caseId: "case_1", operation: "QUESTION_GENERATION", provider: "openai",
      model: "gpt-4o", inputTokens: 1200, outputTokens: 150,
    });
    await recordAiUsage({
      caseId: "case_1", operation: "QUESTION_GENERATION", provider: "openai",
      model: "gpt-4o", inputTokens: 1400, outputTokens: 160,
    });
    await recordAiUsage({
      caseId: "case_1", operation: "DRAFTING", provider: "openai",
      model: "gpt-4o", inputTokens: 6000, outputTokens: 1800,
    });

    const usage = await getCaseAIUsage("case_1");
    expect(usage.questioning.calls).toBe(2);
    expect(usage.total.calls).toBe(4);
    expect(usage.total.estimatedCost).toBeCloseTo(
      usage.extraction.estimatedCost +
        usage.questioning.estimatedCost +
        usage.drafting.estimatedCost,
      6,
    );
    expect(usage.currency).toBe("GBP");
  });

  it("reports zero for deterministic operations rather than inventing tokens", async () => {
    await recordAiUsage({
      caseId: "case_1", operation: "DRAFTING", provider: "openai",
      model: "gpt-4o", inputTokens: 100, outputTokens: 100,
    });
    const usage = await getCaseAIUsage("case_1");
    // Analysis and validation are deterministic — no call, no row.
    expect(usage.analysis.calls).toBe(0);
    expect(usage.validation.calls).toBe(0);
    expect(usage.analysis.estimatedCost).toBe(0);
  });

  it("keeps cases separate", async () => {
    await recordAiUsage({
      caseId: "case_1", operation: "EXTRACTION", provider: "openai",
      model: "gpt-4o", inputTokens: 1000,
    });
    await recordAiUsage({
      caseId: "case_2", operation: "EXTRACTION", provider: "openai",
      model: "gpt-4o", inputTokens: 9000,
    });
    expect((await getCaseAIUsage("case_1")).extraction.inputTokens).toBe(1000);
    expect((await getCaseAIUsage("case_2")).extraction.inputTokens).toBe(9000);
  });

  it("records the pricing version against each figure", async () => {
    await recordAiUsage({
      caseId: "case_1", operation: "DRAFTING", provider: "openai",
      model: "gpt-4o", inputTokens: 100,
    });
    const usage = await getCaseAIUsage("case_1");
    expect(usage.pricingVersions).toContain(activePricing().version);
  });

  it("returns an empty report for a case with no AI calls", async () => {
    const usage = await getCaseAIUsage("case_none");
    expect(usage.total.calls).toBe(0);
    expect(usage.total.estimatedCost).toBe(0);
  });

  it("exposes the individual calls for admin drill-down", async () => {
    await recordAiUsage({
      caseId: "case_1", operation: "DRAFTING", provider: "openai",
      model: "gpt-4o", inputTokens: 500, outputTokens: 200,
      requestId: "req_x",
    });
    const list = await listCaseAiUsage("case_1");
    expect(list).toHaveLength(1);
    expect(list[0].requestId).toBe("req_x");
  });
});
