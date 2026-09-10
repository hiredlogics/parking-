import { getSql, hasDb } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import { activePricing, estimateCost } from "@/services/ai/pricing";
import type { AiOperation } from "@/services/ai/models";

/**
 * AI usage persistence.
 *
 * One row per real provider call. Recording is best-effort and must
 * never fail the operation it is measuring — losing a cost figure is an
 * inconvenience, losing a customer's extracted PCN is not.
 */

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export interface RecordUsageInput {
  caseId: string | null;
  operation: AiOperation;
  provider: string;
  model: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  requestId?: string | null;
  failed?: boolean;
}

/**
 * Record one provider call.
 *
 * Swallows its own errors on purpose: this is instrumentation.
 */
export async function recordAiUsage(input: RecordUsageInput): Promise<void> {
  if (!hasDb()) return;
  const pricing = activePricing();
  const cost = estimateCost(input.model, {
    inputTokens: input.inputTokens,
    cachedInputTokens: input.cachedInputTokens,
    outputTokens: input.outputTokens,
  }, pricing);

  try {
    await q(
      `INSERT INTO ai_usage
         (id, case_id, operation, provider, model, input_tokens,
          cached_input_tokens, output_tokens, request_id, estimated_cost,
          pricing_version, failed, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        `use_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        input.caseId,
        input.operation,
        input.provider,
        input.model,
        Math.max(0, input.inputTokens ?? 0),
        Math.max(0, input.cachedInputTokens ?? 0),
        Math.max(0, input.outputTokens ?? 0),
        input.requestId ?? null,
        cost,
        pricing.version,
        input.failed ?? false,
        new Date().toISOString(),
      ],
    );
  } catch (err) {
    console.error("[ai/usage] could not record usage:", err);
  }
}

export interface OperationUsage {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

export interface CaseAiUsage {
  caseId: string;
  extraction: OperationUsage;
  questioning: OperationUsage;
  analysis: OperationUsage;
  drafting: OperationUsage;
  validation: OperationUsage;
  total: OperationUsage;
  currency: "GBP";
  pricingVersions: string[];
}

const EMPTY = (): OperationUsage => ({
  calls: 0,
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  estimatedCost: 0,
});

const BUCKETS: Record<AiOperation, keyof Omit<CaseAiUsage, "caseId" | "total" | "currency" | "pricingVersions">> = {
  EXTRACTION: "extraction",
  QUESTION_GENERATION: "questioning",
  ANALYSIS: "analysis",
  DRAFTING: "drafting",
  VALIDATION: "validation",
};

/**
 * Approximate AI cost of one case, broken down by operation.
 *
 * Admin/reporting data. Never shown to a customer.
 */
export async function getCaseAIUsage(caseId: string): Promise<CaseAiUsage> {
  const usage: CaseAiUsage = {
    caseId,
    extraction: EMPTY(),
    questioning: EMPTY(),
    analysis: EMPTY(),
    drafting: EMPTY(),
    validation: EMPTY(),
    total: EMPTY(),
    currency: "GBP",
    pricingVersions: [],
  };
  if (!hasDb()) return usage;

  const rows = await q(
    `SELECT operation, pricing_version,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens,
            SUM(cached_input_tokens) AS cached_input_tokens,
            SUM(output_tokens) AS output_tokens,
            SUM(estimated_cost) AS estimated_cost
       FROM ai_usage
      WHERE case_id = $1
      GROUP BY operation, pricing_version`,
    [caseId],
  );

  const versions = new Set<string>();
  for (const r of rows) {
    const bucket = BUCKETS[r.operation as AiOperation];
    if (!bucket) continue;
    const target = usage[bucket];
    const add = {
      calls: Number(r.calls ?? 0),
      inputTokens: Number(r.input_tokens ?? 0),
      cachedInputTokens: Number(r.cached_input_tokens ?? 0),
      outputTokens: Number(r.output_tokens ?? 0),
      estimatedCost: Number(r.estimated_cost ?? 0),
    };
    for (const k of Object.keys(add) as Array<keyof OperationUsage>) {
      target[k] += add[k];
      usage.total[k] += add[k];
    }
    if (r.pricing_version) versions.add(String(r.pricing_version));
  }

  usage.total.estimatedCost =
    Math.round(usage.total.estimatedCost * 1_000_000) / 1_000_000;
  usage.pricingVersions = [...versions].sort();
  return usage;
}

/** Raw rows for one case, newest first. Admin drill-down. */
export async function listCaseAiUsage(caseId: string) {
  const rows = await q(
    `SELECT * FROM ai_usage WHERE case_id = $1 ORDER BY created_at DESC`,
    [caseId],
  );
  return rows.map((r) => ({
    id: r.id as string,
    operation: r.operation as AiOperation,
    provider: r.provider as string,
    model: r.model as string,
    inputTokens: Number(r.input_tokens ?? 0),
    cachedInputTokens: Number(r.cached_input_tokens ?? 0),
    outputTokens: Number(r.output_tokens ?? 0),
    requestId: (r.request_id as string | null) ?? null,
    estimatedCost: Number(r.estimated_cost ?? 0),
    pricingVersion: r.pricing_version as string,
    failed: Boolean(r.failed),
    createdAt: r.created_at as string,
  }));
}
