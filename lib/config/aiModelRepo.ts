/**
 * Live AI model configuration repository — the admin-editable replacement
 * for the process-local override Map in services/ai/models.ts.
 *
 * A row here takes precedence over env vars and hard defaults, and is
 * visible to every process/replica immediately (subject to the short TTL
 * cache in lib/ai/modelConfig.ts), unlike the old in-memory override.
 */
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type { AiOperation } from "@/services/ai/models";

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export interface AiModelConfigRow {
  operation: string;
  model: string;
  fallbackModel: string | null;
  status: string;
  notes: string | null;
  updatedBy: string | null;
  version: number;
  updatedAt: string;
}

function rowToConfig(r: Row): AiModelConfigRow {
  return {
    operation: r.operation as string,
    model: r.model as string,
    fallbackModel: (r.fallback_model as string | null) ?? null,
    status: (r.status as string) ?? "ACTIVE",
    notes: (r.notes as string | null) ?? null,
    updatedBy: (r.updated_by as string | null) ?? null,
    version: Number(r.version ?? 1),
    updatedAt: r.updated_at as string,
  };
}

export async function listAiModelConfig(): Promise<AiModelConfigRow[]> {
  const rows = await q(`SELECT * FROM ai_model_config ORDER BY operation`);
  return rows.map(rowToConfig);
}

export async function getAiModelConfig(
  operation: string,
): Promise<AiModelConfigRow | null> {
  const rows = await q(`SELECT * FROM ai_model_config WHERE operation = $1`, [
    operation,
  ]);
  return rows[0] ? rowToConfig(rows[0]) : null;
}

/**
 * Set (or replace) the live model config for one operation.
 *
 * `model` is a vetted string, not free text, at the API-route boundary —
 * this repo function trusts its caller the same way every other
 * adminRepo function does.
 */
export async function setAiModelConfig(input: {
  operation: AiOperation;
  model: string;
  fallbackModel?: string | null;
  notes?: string | null;
  updatedBy?: string | null;
}): Promise<AiModelConfigRow> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO ai_model_config (
       operation, model, fallback_model, status, notes, updated_by, version, created_at, updated_at
     ) VALUES ($1,$2,$3,'ACTIVE',$4,$5,1,$6,$6)
     ON CONFLICT (operation) DO UPDATE SET
       model = EXCLUDED.model,
       fallback_model = EXCLUDED.fallback_model,
       status = 'ACTIVE',
       notes = EXCLUDED.notes,
       updated_by = EXCLUDED.updated_by,
       version = ai_model_config.version + 1,
       updated_at = EXCLUDED.updated_at`,
    [
      input.operation,
      input.model.trim(),
      input.fallbackModel?.trim() || null,
      input.notes ?? null,
      input.updatedBy ?? null,
      now,
    ],
  );
  const row = await getAiModelConfig(input.operation);
  if (!row) throw new Error("setAiModelConfig failed");
  return row;
}

/** Revert an operation to env-var/default resolution (services/ai/models.ts). */
export async function clearAiModelConfig(operation: string): Promise<void> {
  await q(`DELETE FROM ai_model_config WHERE operation = $1`, [operation]);
}
