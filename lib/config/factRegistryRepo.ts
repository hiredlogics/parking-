/**
 * Admin repository for `case_facts_registry` — the fact vocabulary.
 *
 * The table has existed since the rule-graph schema landed but had no
 * repository, no seed and no reader, so the live vocabulary was still
 * whatever the question bank's option lists happened to say. This is the
 * missing half: the rows are seeded from lib/facts/registry.ts and read
 * back through lib/config/factRegistry.ts.
 *
 * `driver_identifying` is written but never widened here. Keeper safety
 * is not an admin setting, and a fact flagged in the database may never
 * be turned into a driver-identifying question whatever else a row says.
 */
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type {
  FactRegistryEntry,
  FactRegistrySource,
  FactValueType,
} from "@/lib/facts/registry";

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

export interface FactRegistryRow extends FactRegistryEntry {
  evidenceTypes: string[];
  driverIdentifying: boolean;
  status: string;
}

function rowToEntry(r: Row): FactRegistryRow {
  return {
    factKey: r.fact_key as string,
    label: (r.label as string) ?? (r.fact_key as string),
    valueType: ((r.value_type as string) ?? "STRING") as FactValueType,
    allowedValues: asArray(r.allowed_values),
    guidance: (r.question_guidance as string | null) ?? null,
    source: ((r.source as string) ?? "ANSWER") as FactRegistrySource,
    evidenceTypes: asArray(r.evidence_types),
    driverIdentifying: r.driver_identifying === true,
    status: (r.status as string) ?? "ACTIVE",
  };
}

export async function listFactRegistry(
  onlyActive = true,
): Promise<FactRegistryRow[]> {
  const rows = await q(
    `SELECT * FROM case_facts_registry
     ${onlyActive ? `WHERE status = 'ACTIVE'` : ``}
     ORDER BY fact_key`,
  );
  return rows.map(rowToEntry);
}

export async function upsertFactRegistryEntry(input: {
  factKey: string;
  label: string;
  valueType: FactValueType;
  allowedValues?: readonly string[];
  guidance?: string | null;
  source?: FactRegistrySource;
  evidenceTypes?: string[];
  driverIdentifying?: boolean;
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const onConflict = input.seedOnly
    ? `ON CONFLICT (fact_key) DO NOTHING`
    : `ON CONFLICT (fact_key) DO UPDATE SET
         label = EXCLUDED.label,
         value_type = EXCLUDED.value_type,
         allowed_values = EXCLUDED.allowed_values,
         question_guidance = EXCLUDED.question_guidance,
         evidence_types = EXCLUDED.evidence_types,
         driver_identifying = EXCLUDED.driver_identifying,
         source = EXCLUDED.source,
         status = EXCLUDED.status,
         updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO case_facts_registry (
       fact_key, label, value_type, allowed_values, normalisation_json,
       evidence_types, question_guidance, driver_identifying, source,
       status, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,$5,$6,$7,$8,$9,$10,$10)
     ${onConflict}`,
    [
      input.factKey,
      input.label,
      input.valueType,
      JSON.stringify(input.allowedValues ?? []),
      JSON.stringify(input.evidenceTypes ?? []),
      input.guidance ?? null,
      input.driverIdentifying ?? false,
      input.source ?? "ANSWER",
      input.status ?? "ACTIVE",
      now,
    ],
  );
}
