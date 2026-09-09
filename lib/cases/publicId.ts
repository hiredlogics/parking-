import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

/** Format helper — unit-testable without a live database. */
export function formatPublicCaseId(year: number, sequence: number): string {
  const y = String(year);
  const seq = String(Math.max(1, Math.floor(sequence))).padStart(6, "0");
  return `CASE-${y}-${seq}`;
}

/**
 * Sequential public case IDs: CASE-YYYY-NNNNNN
 *
 * Uses a counter row in system_meta so concurrent creates cannot collide.
 */
export async function nextPublicCaseId(now = new Date()): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const year = now.getUTCFullYear();
  const key = `case_public_seq_${year}`;

  await sql.query(
    `INSERT INTO system_meta (key, value) VALUES ($1, '0')
     ON CONFLICT (key) DO NOTHING`,
    [key],
  );

  const result = (await sql.query(
    `UPDATE system_meta
        SET value = (COALESCE(NULLIF(value, ''), '0')::bigint + 1)::text
      WHERE key = $1
      RETURNING value`,
    [key],
  )) as unknown as Array<{ value: string }> | { rows?: Array<{ value: string }> };

  const list = Array.isArray(result) ? result : result.rows ?? [];
  const n = Number(list[0]?.value ?? 1);
  return formatPublicCaseId(year, Number.isFinite(n) ? n : 1);
}
