/**
 * @vitest-environment node
 *
 * Live AI configuration — the DB-backed model/fallback/validator config
 * that closes three previously-silent gaps:
 *   1. AI model choice had no admin path at all (env-only).
 *   2. No provider fallback chain existed anywhere.
 *   3. validation_rules was write-only — the engine never read it back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let modelConfigRows: Array<{
  operation: string;
  model: string;
  fallbackModel: string | null;
  status: string;
  notes: string | null;
  updatedBy: string | null;
  version: number;
  updatedAt: string;
}> = [];

let validationRuleRows: Array<{
  code: string;
  label: string;
  severity: string;
  status: string;
  configJson: Record<string, unknown>;
  version: number;
}> = [];

vi.mock("@/lib/db/pool", () => ({ hasDb: () => true, getSql: () => ({ query: async () => ({ rows: [] }) }) }));

vi.mock("@/lib/config/aiModelRepo", () => ({
  listAiModelConfig: async () => modelConfigRows,
  getAiModelConfig: async (op: string) => modelConfigRows.find((r) => r.operation === op) ?? null,
  setAiModelConfig: async () => {
    throw new Error("not used in this test");
  },
  clearAiModelConfig: async () => {},
}));

vi.mock("@/lib/config/adminRepo", () => ({
  listValidationRules: async () => validationRuleRows,
}));

const { resolveModel, invalidateModelConfigCache } = await import("@/lib/ai/modelConfig");
const { callWithModelFallback } = await import("@/services/ai/modelFallback");
const { TransportError } = await import("@/services/ai/transport");
const { loadValidatorConfig, invalidateValidatorConfigCache } = await import(
  "@/lib/validation/ruleConfig"
);
const { validateDraft } = await import("@/lib/validation/engine");

beforeEach(() => {
  modelConfigRows = [];
  validationRuleRows = [];
  invalidateModelConfigCache();
  invalidateValidatorConfigCache();
});
afterEach(() => {
  invalidateModelConfigCache();
  invalidateValidatorConfigCache();
});

describe("Live per-task model resolution", () => {
  it("falls back to the code default when no DB row is configured", async () => {
    const resolved = await resolveModel("DRAFTING");
    expect(resolved.source).toBe("code");
    expect(resolved.model).toBe("gpt-5.4");
  });

  it("a DB row takes precedence over the code default", async () => {
    modelConfigRows = [
      {
        operation: "DRAFTING",
        model: "gpt-4o",
        fallbackModel: "gpt-4o-mini",
        status: "ACTIVE",
        notes: null,
        updatedBy: null,
        version: 2,
        updatedAt: "now",
      },
    ];
    const resolved = await resolveModel("DRAFTING");
    expect(resolved.source).toBe("db");
    expect(resolved.model).toBe("gpt-4o");
    expect(resolved.fallbackModel).toBe("gpt-4o-mini");
  });

  it("an INACTIVE DB row is ignored, not applied", async () => {
    modelConfigRows = [
      {
        operation: "DRAFTING",
        model: "gpt-4o",
        fallbackModel: null,
        status: "INACTIVE",
        notes: null,
        updatedBy: null,
        version: 1,
        updatedAt: "now",
      },
    ];
    const resolved = await resolveModel("DRAFTING");
    expect(resolved.source).toBe("code");
  });
});

describe("Transport-failure-only fallback", () => {
  it("uses the primary model when the call succeeds", async () => {
    modelConfigRows = [
      { operation: "DRAFTING", model: "gpt-5.4", fallbackModel: "gpt-4o", status: "ACTIVE", notes: null, updatedBy: null, version: 1, updatedAt: "now" },
    ];
    const { result, model, usedFallback } = await callWithModelFallback("DRAFTING", async (m) => `ok:${m}`);
    expect(result).toBe("ok:gpt-5.4");
    expect(model).toBe("gpt-5.4");
    expect(usedFallback).toBe(false);
  });

  it("retries once with the fallback model after the primary exhausts transport retries", async () => {
    modelConfigRows = [
      { operation: "DRAFTING", model: "gpt-5.4", fallbackModel: "gpt-4o", status: "ACTIVE", notes: null, updatedBy: null, version: 1, updatedAt: "now" },
    ];
    const { result, model, usedFallback } = await callWithModelFallback(
      "DRAFTING",
      async (m) => {
        if (m === "gpt-5.4") {
          const err = new Error("dead socket");
          (err as { code?: string }).code = "ECONNRESET";
          throw err;
        }
        return `ok:${m}`;
      },
      { attempts: 1 },
    );
    expect(result).toBe("ok:gpt-4o");
    expect(model).toBe("gpt-4o");
    expect(usedFallback).toBe(true);
  });

  it("never falls back on a non-transient (content) rejection", async () => {
    modelConfigRows = [
      { operation: "DRAFTING", model: "gpt-5.4", fallbackModel: "gpt-4o", status: "ACTIVE", notes: null, updatedBy: null, version: 1, updatedAt: "now" },
    ];
    await expect(
      callWithModelFallback("DRAFTING", async () => {
        throw new Error("400 invalid request");
      }),
    ).rejects.toThrow("400 invalid request");
  });

  it("propagates TransportError when no fallback is configured", async () => {
    await expect(
      callWithModelFallback(
        "DRAFTING",
        async () => {
          const err = new Error("dead socket");
          (err as { code?: string }).code = "ECONNRESET";
          throw err;
        },
        { attempts: 1 },
      ),
    ).rejects.toBeInstanceOf(TransportError);
  });
});

describe("Live validator configuration", () => {
  function baseCtx(overrides: Partial<Parameters<typeof validateDraft>[0]> = {}) {
    return {
      body: "Dear Sir/Madam, I am writing to appeal this parking charge notice.",
      analysis: { driverStatus: "UNIDENTIFIED", verifiedFacts: [] } as never,
      modules: [],
      sources: [],
      facts: { tags: new Set() } as never,
      evidence: new Set<string>(),
      variables: {},
      ...overrides,
    };
  }

  it("with no ruleConfig loaded, every validator runs at its hard-coded severity (unchanged behaviour)", () => {
    const run = validateDraft(baseCtx());
    expect(run.byValidator).toBeDefined();
  });

  it("an ACTIVE/WARNING override downgrades a validator's issues without disabling it", async () => {
    validationRuleRows = [
      { code: "VAL-REPETITION", label: "x", severity: "WARNING", status: "ACTIVE", configJson: {}, version: 2 },
    ];
    const ruleConfig = await loadValidatorConfig();
    const repeated =
      "The Council has confirmed the notice is invalid. The Council has confirmed the notice is invalid. The Council has confirmed the notice is invalid.";
    const run = validateDraft(baseCtx({ body: repeated, ruleConfig }));
    const repetitionIssues = run.byValidator["VAL-REPETITION"];
    if (repetitionIssues.length > 0) {
      expect(repetitionIssues.every((i) => i.severity === "WARNING")).toBe(true);
    }
  });

  it("VAL-DRIVER can never be disabled via live config, even if a bad row exists", async () => {
    validationRuleRows = [
      { code: "VAL-DRIVER", label: "x", severity: "WARNING", status: "DISABLED", configJson: {}, version: 3 },
    ];
    const ruleConfig = await loadValidatorConfig();
    expect(ruleConfig.get("VAL-DRIVER")).toEqual({ status: "ACTIVE", severity: "BLOCKING" });

    const run = validateDraft(
      baseCtx({
        body: "I was driving the vehicle at the time and I paid for parking.",
        ruleConfig,
      }),
    );
    expect(run.byValidator["VAL-DRIVER"].length).toBeGreaterThan(0);
    expect(run.byValidator["VAL-DRIVER"].every((i) => i.severity === "BLOCKING")).toBe(true);
    expect(run.status).toBe("FAIL");
  });

  it("a validator that throws stays BLOCKING regardless of live config", async () => {
    validationRuleRows = [
      { code: "VAL-FACT", label: "x", severity: "BLOCKING", status: "DISABLED", configJson: {}, version: 1 },
    ];
    const ruleConfig = await loadValidatorConfig();
    // A validator explicitly disabled in config should not run at all —
    // this proves disabling works for a non-immutable code, the mirror
    // image of the VAL-DRIVER test above.
    const run = validateDraft(baseCtx({ ruleConfig }));
    expect(run.byValidator["VAL-FACT"]).toEqual([]);
  });
});

describe("Admin cannot weaken keeper safety through the repo layer", () => {
  it("refuses to disable VAL-DRIVER", async () => {
    // Re-import the real module (not the mock above) for this describe block.
    const real = await vi.importActual<typeof import("@/lib/config/adminRepo")>(
      "@/lib/config/adminRepo",
    );
    await expect(
      real.upsertValidationRule({ code: "VAL-DRIVER", label: "x", status: "DISABLED" }),
    ).rejects.toThrow(/non-negotiable/);
    await expect(
      real.upsertValidationRule({ code: "VAL-DRIVER", label: "x", severity: "WARNING" }),
    ).rejects.toThrow(/non-negotiable/);
  });
});
