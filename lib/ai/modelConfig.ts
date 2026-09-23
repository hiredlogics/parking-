/**
 * Live per-task model resolution.
 *
 * Precedence (highest first): DB `ai_model_config` row (ACTIVE) → the
 * existing services/ai/models.ts chain (in-memory override → per-op env
 * var → OPENAI_MODEL → hard default). This is additive: nothing here
 * changes behaviour for an operation that has no DB row.
 *
 * Short TTL cache so an admin edit reaches every replica within seconds
 * without a DB round trip on every AI call — mirrors lib/kb/catalog.ts.
 */
import { hasDb } from "@/lib/db/pool";
import { listAiModelConfig, type AiModelConfigRow } from "@/lib/config/aiModelRepo";
import { modelFor, type AiOperation } from "@/services/ai/models";

export interface ResolvedModel {
  model: string;
  /** Transport-failure-only fallback. Never consulted for content/validation rejection. */
  fallbackModel: string | null;
  source: "db" | "code";
}

const TTL_MS = 15_000;
let cache: { at: number; byOperation: Map<string, AiModelConfigRow> } | null = null;
let inflight: Promise<Map<string, AiModelConfigRow>> | null = null;

async function loadRows(): Promise<Map<string, AiModelConfigRow>> {
  const rows = await listAiModelConfig();
  return new Map(rows.filter((r) => r.status === "ACTIVE").map((r) => [r.operation, r]));
}

async function getMap(): Promise<Map<string, AiModelConfigRow>> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.byOperation;
  if (inflight) return inflight;
  inflight = loadRows()
    .then((byOperation) => {
      cache = { at: Date.now(), byOperation };
      return byOperation;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Resolve the model (and optional transport-failure fallback) for one operation. */
export async function resolveModel(operation: AiOperation): Promise<ResolvedModel> {
  if (hasDb()) {
    try {
      const row = (await getMap()).get(operation);
      if (row && row.model.trim().length > 0) {
        return { model: row.model.trim(), fallbackModel: row.fallbackModel, source: "db" };
      }
    } catch (err) {
      console.warn(
        `[ai/modelConfig] live model config unavailable for ${operation}, using env/default:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return { model: modelFor(operation), fallbackModel: null, source: "code" };
}

/** Drop the cache — call after an admin edits ai_model_config. */
export function invalidateModelConfigCache(): void {
  cache = null;
}
