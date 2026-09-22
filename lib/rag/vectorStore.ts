import type { EmbeddedRuleChunk, RagHit, RuleChunk } from "./types";
import { cosineSimilarity, embedQuery, embedTexts } from "./embeddings";

/**
 * In-process vector store for approved rules.
 * Built lazily from the KB catalog + Master Pack rule descriptions.
 * Optional Redis/file cache can be layered later; eligibility filters
 * in retrieveKnowledge still gate what may be used.
 */
let store: EmbeddedRuleChunk[] | null = null;
let building: Promise<void> | null = null;

export function resetRulesVectorStore(): void {
  store = null;
  building = null;
}

export function rulesVectorStoreSize(): number {
  return store?.length ?? 0;
}

export async function ensureRulesVectorStore(
  chunks: RuleChunk[],
): Promise<void> {
  if (store && store.length > 0) return;
  if (building) {
    await building;
    return;
  }
  building = (async () => {
    if (chunks.length === 0) {
      store = [];
      return;
    }
    // Batch to stay under embedding API limits.
    const embedded: EmbeddedRuleChunk[] = [];
    const BATCH = 64;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const slice = chunks.slice(i, i + BATCH);
      try {
        const vectors = await embedTexts(slice.map((c) => c.text));
        for (let j = 0; j < slice.length; j++) {
          embedded.push({ ...slice[j]!, embedding: vectors[j] ?? [] });
        }
      } catch (err) {
        console.warn("[rag] embedding batch failed:", err);
        // Lexical-only fallback: empty embedding — scored 0 on cosine.
        for (const c of slice) {
          embedded.push({ ...c, embedding: [] });
        }
      }
    }
    store = embedded;
  })();
  try {
    await building;
  } finally {
    building = null;
  }
}

/**
 * Retrieve top-k rule chunks for a case query.
 * Soft-filter by route when provided (does not invent out-of-route law).
 */
export async function searchRulesVectorStore(input: {
  query: string;
  topK?: number;
  routeAllowlist?: string[] | null;
}): Promise<RagHit[]> {
  if (!store || store.length === 0) return [];
  const topK = input.topK ?? 8;
  let queryVec: number[] = [];
  try {
    queryVec = await embedQuery(input.query);
  } catch (err) {
    console.warn("[rag] query embed failed; lexical fallback:", err);
  }

  const allow = input.routeAllowlist
    ? new Set(input.routeAllowlist.map((r) => r.toUpperCase()))
    : null;

  const scored: RagHit[] = [];
  for (const chunk of store) {
    if (allow && chunk.route && !allow.has(chunk.route.toUpperCase())) {
      continue;
    }
    let score = 0;
    if (queryVec.length > 0 && chunk.embedding.length > 0) {
      score = cosineSimilarity(queryVec, chunk.embedding);
    } else {
      // Cheap lexical overlap fallback when embeddings unavailable.
      score = lexicalScore(input.query, chunk.text);
    }
    scored.push({
      chunk: {
        id: chunk.id,
        source: chunk.source,
        sourceId: chunk.sourceId,
        route: chunk.route,
        text: chunk.text,
      },
      score,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).filter((h) => h.score > 0.15);
}

function lexicalScore(query: string, text: string): number {
  const q = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  );
  if (q.size === 0) return 0;
  const t = text.toLowerCase();
  let hit = 0;
  for (const w of q) if (t.includes(w)) hit += 1;
  return hit / q.size;
}
