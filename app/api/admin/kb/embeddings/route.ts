import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { fail } from "@/lib/api/envelope";
import { getSql, hasDb } from "@/lib/db/pool";
import { ingestKbEmbeddings } from "@/lib/rag/kbEmbeddingIngest";
import { seedModuleEdges } from "@/lib/kb/edges";
import { insertAuditEvent } from "@/lib/kb/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Embedding a few hundred chunks takes longer than a normal request. */
export const maxDuration = 300;

/**
 * Build the semantic index over the knowledge base.
 *
 * `ingestKbEmbeddings()` shipped with ZERO callers anywhere in the
 * repository. `kb_embeddings` was created by the schema and never
 * written to, so `rankKbModulesBySimilarity` — called on every draft —
 * always returned an empty array. The semantic layer was dead code that
 * looked live.
 *
 * This is its caller. Safe to call repeatedly: ingestion is idempotent
 * via `content_sha256`, so a re-run after an admin edit only re-embeds
 * chunks whose content actually changed.
 */
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  try {
    const summary = await ingestKbEmbeddings();
    // Edges are seeded here rather than in the schema migration because
    // they are content, not structure, and the seed is insert-if-absent
    // so an administrator's own edges are never clobbered.
    const edgesSeeded = await seedModuleEdges();

    await insertAuditEvent({
      eventType: "KB_EMBEDDINGS_INGESTED",
      actorId: auth.session.userId,
      payload: { ...summary, edgesSeeded },
    });

    return NextResponse.json({
      success: true,
      data: { ...summary, edgesSeeded },
    });
  } catch (err) {
    console.error("[api/admin/kb/embeddings] ingest failed:", err);
    return fail(
      "KB_INGEST_FAILED",
      err instanceof Error ? err.message : "Embedding ingestion failed.",
      500,
    );
  }
}

/**
 * Report the index state without changing it, so an operator can check
 * whether embeddings are populated before paying for an embedding pass.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  if (!hasDb()) {
    return NextResponse.json({
      success: true,
      data: { configured: false, rows: 0, withVector: 0, annIndex: false },
    });
  }

  try {
    const sql = getSql();
    const res = await sql.query(
      `SELECT
         count(*)::int AS rows,
         count(embedding)::int AS with_vector,
         (SELECT count(*)::int FROM pg_indexes
            WHERE indexname = 'kb_embeddings_ann_idx') AS ann
       FROM kb_embeddings`,
    );
    const rows = (
      Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
    ) as Array<Record<string, unknown>>;
    const r = rows[0] ?? {};
    return NextResponse.json({
      success: true,
      data: {
        configured: true,
        rows: Number(r.rows ?? 0),
        withVector: Number(r.with_vector ?? 0),
        annIndex: Number(r.ann ?? 0) > 0,
      },
    });
  } catch (err) {
    console.error("[api/admin/kb/embeddings] status failed:", err);
    return fail(
      "KB_STATUS_FAILED",
      err instanceof Error ? err.message : "Could not read embedding status.",
      500,
    );
  }
}
