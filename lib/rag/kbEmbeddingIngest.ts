/**
 * pgvector ingestion — controlled KB content only, never customer case
 * data (Turn C directive, absolute rule: pgvector is retrieval, not the
 * legal decision engine). Each ACTIVE, admin-approved KB module becomes
 * one or more `kb_embeddings` rows, chunked and embedded with full
 * provenance (source, route, jurisdiction, authority level, version,
 * effective dates) so a retrieval hit can always be traced back to the
 * exact approved module version that produced it.
 *
 * Idempotent via `content_sha256`: re-running after an admin edit only
 * re-embeds chunks whose content actually changed.
 *
 * Batched deliberately: Neon's HTTP driver pays a full request round
 * trip per call, so one row per query for ~200 chunks was minutes of
 * dead time. This does one SELECT, one embedding pass (batched at 64
 * texts/call), one bulk DELETE and a handful of multi-row INSERTs.
 */
import { createHash, randomUUID } from "node:crypto";
import { getSql, hasDb } from "@/lib/db/pool";
import { loadKbCatalog } from "@/lib/kb/catalog";
import { embedTexts, embeddingModelId } from "@/lib/rag/embeddings";
import type { KbModule } from "@/lib/kb/types";

const MAX_CHUNK_CHARS = 2000;
const EMBED_BATCH = 64;
const INSERT_BATCH = 25;

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface Chunk {
  section: string;
  content: string;
}

/** Split a module's controlled content into retrievable chunks. */
function chunksForModule(m: KbModule): Chunk[] {
  const chunks: Chunk[] = [];
  const core = [m.topic, m.coreProposition].filter(Boolean).join("\n");
  if (core.trim().length > 0) chunks.push({ section: "core_proposition", content: core });

  if (m.legalBasis) chunks.push({ section: "legal_basis", content: m.legalBasis });

  if (m.aiMustCheck.length > 0) {
    chunks.push({ section: "ai_must_check", content: m.aiMustCheck.join("\n") });
  }

  if (m.draftingNotes) {
    // Long drafting notes split at paragraph boundaries so no single
    // embedding call exceeds a sane size or mixes unrelated guidance.
    const paras = m.draftingNotes.split(/\n{2,}/).filter((p) => p.trim().length > 0);
    let buf = "";
    for (const p of paras) {
      if ((buf + "\n\n" + p).length > MAX_CHUNK_CHARS && buf) {
        chunks.push({ section: "drafting_notes", content: buf });
        buf = p;
      } else {
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) chunks.push({ section: "drafting_notes", content: buf });
  }

  return chunks.filter((c) => c.content.trim().length >= 20);
}

export interface IngestSummary {
  modulesScanned: number;
  chunksConsidered: number;
  embedded: number;
  skippedUnchanged: number;
  removedStale: number;
}

/**
 * Ingest all ACTIVE KB modules into `kb_embeddings`. Safe to call
 * repeatedly (e.g. after every KB admin save, or on a schedule).
 */
export async function ingestKbEmbeddings(): Promise<IngestSummary> {
  if (!hasDb()) {
    return { modulesScanned: 0, chunksConsidered: 0, embedded: 0, skippedUnchanged: 0, removedStale: 0 };
  }
  const sql = getSql();
  const catalog = await loadKbCatalog();
  const modules = catalog.modules.filter((m) => m.status === "ACTIVE");
  const moduleById = new Map(modules.map((m) => [m.moduleId, m]));

  const existingRows = await sql.query(
    `SELECT id, source_id, section, chunk_index, content_sha256 FROM kb_embeddings WHERE source_kind = 'kb_module'`,
  );
  const existing = Array.isArray(existingRows) ? existingRows : (existingRows as { rows: unknown[] }).rows;
  const existingByKey = new Map<string, { id: string; hash: string }>();
  for (const r of existing as Array<Record<string, unknown>>) {
    existingByKey.set(`${r.source_id}:${r.section}:${r.chunk_index}`, {
      id: r.id as string,
      hash: r.content_sha256 as string,
    });
  }

  let chunksConsidered = 0;
  let skippedUnchanged = 0;
  const now = new Date().toISOString();
  const keysWritten = new Set<string>();
  const toEmbed: Array<{
    moduleId: string;
    chunk: Chunk;
    hash: string;
    index: number;
    key: string;
  }> = [];

  for (const m of modules) {
    chunksForModule(m).forEach((chunk, index) => {
      chunksConsidered += 1;
      const key = `${m.moduleId}:${chunk.section}:${index}`;
      keysWritten.add(key);
      const hash = sha256(chunk.content);
      const prior = existingByKey.get(key);
      if (prior && prior.hash === hash) {
        skippedUnchanged += 1;
        return;
      }
      toEmbed.push({ moduleId: m.moduleId, chunk, hash, index, key });
    });
  }

  // ---- Embed everything that's new or changed, batched ----
  const vectors: number[][] = [];
  for (let i = 0; i < toEmbed.length; i += EMBED_BATCH) {
    const slice = toEmbed.slice(i, i + EMBED_BATCH);
    try {
      const batchVectors = await embedTexts(slice.map((c) => c.chunk.content));
      vectors.push(...batchVectors);
    } catch (err) {
      console.warn(`[kb-ingest] embedding batch failed:`, err);
      vectors.push(...slice.map(() => []));
    }
  }

  // ---- Bulk-delete stale prior rows (changed chunks + pruned keys) ----
  const idsToDelete: string[] = [];
  for (const t of toEmbed) {
    const prior = existingByKey.get(t.key);
    if (prior) idsToDelete.push(prior.id);
  }
  for (const [key, row] of existingByKey) {
    if (!keysWritten.has(key)) idsToDelete.push(row.id);
  }
  if (idsToDelete.length > 0) {
    await sql.query(`DELETE FROM kb_embeddings WHERE id = ANY($1::text[])`, [idsToDelete]);
  }
  const removedStale = idsToDelete.length - toEmbed.filter((t) => existingByKey.has(t.key)).length;

  // ---- Bulk-insert new rows, batched ----
  let embedded = 0;
  const rows: Array<{ t: (typeof toEmbed)[number]; vector: number[] }> = [];
  for (let i = 0; i < toEmbed.length; i++) {
    const vector = vectors[i];
    if (vector && vector.length > 0) rows.push({ t: toEmbed[i]!, vector });
  }

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const slice = rows.slice(i, i + INSERT_BATCH);
    const cols = [
      "id", "source_kind", "source_id", "document_id", "page", "section", "chunk_index",
      "content", "content_sha256", "route_family", "topic", "jurisdiction",
      "authority_level", "ata_applicability", "status", "version",
      "effective_from", "effective_to", "embedding", "embedding_model",
      "created_at", "updated_at",
    ];
    const params: unknown[] = [];
    const valueGroups: string[] = [];
    for (const { t, vector } of slice) {
      const m = moduleById.get(t.moduleId)!;
      const base = params.length;
      params.push(
        `kbe_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
        "kb_module",
        t.moduleId,
        null,
        null,
        t.chunk.section,
        t.index,
        t.chunk.content,
        t.hash,
        typeof m.routeFamily === "string" ? m.routeFamily : null,
        m.topic,
        "ENGLAND_WALES",
        null,
        "ALL",
        m.status,
        m.version,
        m.effectiveFrom,
        m.effectiveTo,
        `[${vector.join(",")}]`,
        embeddingModelId(),
        now,
      );
      const placeholders = cols
        .map((_, ci) => (ci === cols.length - 1 ? `$${base + 21}` : `$${base + ci + 1}`))
        .join(",");
      valueGroups.push(`(${placeholders})`);
      embedded += 1;
    }
    await sql.query(
      `INSERT INTO kb_embeddings (${cols.join(", ")}) VALUES ${valueGroups.join(", ")}`,
      params,
    );
  }

  return { modulesScanned: modules.length, chunksConsidered, embedded, skippedUnchanged, removedStale };
}
