import { requireAdmin } from "@/lib/auth/require-admin";
import { ok, fail, readJson } from "@/lib/api/envelope";
import { required, str, optStr, enumOf, ValidationError } from "@/lib/api/validate";
import {
  listAiModelConfig,
  setAiModelConfig,
  clearAiModelConfig,
} from "@/lib/config/aiModelRepo";
import { invalidateModelConfigCache } from "@/lib/ai/modelConfig";
import { AI_OPERATIONS, modelFor, envKeyFor, type AiOperation } from "@/services/ai/models";
import { activePricing } from "@/services/ai/pricing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Vetted model choices — the same set services/ai/pricing.ts knows how
 * to cost. Deliberately not free text: a typo here would silently break
 * every call for that operation until someone noticed.
 */
const VETTED_MODELS = Object.keys(activePricing().rates) as readonly string[];

/**
 * GET — every AI operation's live configuration: the DB override (if
 * any), what it would resolve to without one (env/default), and the
 * env var name a deploy-time override would use.
 *
 * POST — { action: "SET_MODEL", operation, model, fallbackModel?, notes? }
 *         { action: "CLEAR_MODEL", operation }
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  const rows = await listAiModelConfig();
  const byOp = new Map(rows.map((r) => [r.operation, r]));

  const operations = AI_OPERATIONS.map((operation) => {
    const dbRow = byOp.get(operation) ?? null;
    return {
      operation,
      envKey: envKeyFor(operation),
      codeDefault: modelFor(operation),
      dbModel: dbRow?.model ?? null,
      dbFallbackModel: dbRow?.fallbackModel ?? null,
      status: dbRow?.status ?? null,
      notes: dbRow?.notes ?? null,
      version: dbRow?.version ?? null,
      updatedAt: dbRow?.updatedAt ?? null,
      effectiveModel: dbRow?.status === "ACTIVE" && dbRow.model ? dbRow.model : modelFor(operation),
      source: dbRow?.status === "ACTIVE" && dbRow.model ? "db" : "code",
    };
  });

  return ok({ operations, vettedModels: VETTED_MODELS });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return fail("BAD_REQUEST", "Invalid body.", 400);

  const action = String(body.action ?? "").toUpperCase();

  try {
    switch (action) {
      case "SET_MODEL": {
        const operation = required(
          enumOf(body, "operation", AI_OPERATIONS, AI_OPERATIONS[0]),
        ) as AiOperation;
        const model = required(enumOf(body, "model", VETTED_MODELS, VETTED_MODELS[0]));
        const fallbackModelRaw = required(optStr(body, "fallbackModel"));
        if (fallbackModelRaw && !VETTED_MODELS.includes(fallbackModelRaw)) {
          return fail(
            "BAD_FALLBACK_MODEL",
            `fallbackModel must be one of: ${VETTED_MODELS.join(", ")}.`,
            400,
          );
        }
        const notes = required(optStr(body, "notes"));
        const row = await setAiModelConfig({
          operation,
          model,
          fallbackModel: fallbackModelRaw,
          notes,
          updatedBy: auth.session.userId,
        });
        invalidateModelConfigCache();
        return ok({ config: row });
      }
      case "CLEAR_MODEL": {
        const operation = required(str(body, "operation"));
        await clearAiModelConfig(operation);
        invalidateModelConfigCache();
        return ok({ ok: true });
      }
      default:
        return fail("BAD_ACTION", "Unknown action.", 400);
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail("VALIDATION_ERROR", `${err.field}: ${err.message}`, 422);
    }
    throw err;
  }
}
