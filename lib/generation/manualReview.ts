import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

/**
 * Manual review queue (V2 §35).
 *
 * "Do not force AI to manufacture an answer." When a case cannot be
 * generated safely it lands here instead of being released.
 */
export interface ManualReviewRow {
  id: string;
  caseId: string | null;
  reason: string;
  detail: string | null;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

export async function openManualReview(input: {
  caseId?: string | null;
  reason: string;
  detail?: string | null;
}): Promise<string> {
  await ensureSchema();
  const sql = getSql();
  const id = `mr_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  await sql.query(
    `INSERT INTO manual_reviews (id, case_id, reason, detail, status, created_at)
     VALUES ($1,$2,$3,$4,'OPEN',$5)`,
    [
      id,
      input.caseId ?? null,
      input.reason,
      input.detail ?? null,
      new Date().toISOString(),
    ],
  );
  return id;
}

export async function listManualReviews(
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ALL" = "OPEN",
): Promise<ManualReviewRow[]> {
  await ensureSchema();
  const sql = getSql();
  const res =
    status === "ALL"
      ? await sql.query(
          `SELECT * FROM manual_reviews ORDER BY created_at DESC LIMIT 200`,
        )
      : await sql.query(
          `SELECT * FROM manual_reviews WHERE status = $1 ORDER BY created_at DESC LIMIT 200`,
          [status],
        );
  const rows = (Array.isArray(res) ? res : (res as { rows?: unknown[] }).rows ?? []) as Array<
    Record<string, unknown>
  >;
  return rows.map((r) => ({
    id: r.id as string,
    caseId: (r.case_id as string | null) ?? null,
    reason: r.reason as string,
    detail: (r.detail as string | null) ?? null,
    status: r.status as ManualReviewRow["status"],
    createdAt: r.created_at as string,
    resolvedAt: (r.resolved_at as string | null) ?? null,
    resolvedBy: (r.resolved_by as string | null) ?? null,
  }));
}

export async function resolveManualReview(
  id: string,
  resolvedBy: string,
): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  await sql.query(
    `UPDATE manual_reviews
        SET status = 'RESOLVED', resolved_at = $2, resolved_by = $3
      WHERE id = $1`,
    [id, new Date().toISOString(), resolvedBy],
  );
}
