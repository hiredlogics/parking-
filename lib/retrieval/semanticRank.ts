/**
 * Hybrid retrieval's semantic-ranking stage.
 *
 * Order matters, and this module only ever runs third:
 *
 *   1. Rule / applicability filter — retrieveKnowledge() decides which
 *      KB modules are legally eligible for THIS case (route, status,
 *      effective dates, source status, prohibited claims, evidence,
 *      use_when facts). This is the only thing that decides eligibility.
 *   2. Metadata filter — this query is scoped with
 *      `source_id = ANY(eligibleModuleIds)`, so a module the rule
 *      filter rejected can never re-enter through a vector match.
 *   3. Vector similarity — pgvector cosine distance over kb_embeddings
 *      orders the ALREADY-eligible chunks by relevance to this case's
 *      facts, so the drafting prompt gets the most relevant few
 *      sentences instead of every eligible module's full text.
 *
 * This is never "vector → top N → LLM": nothing reaches step 3 that
 * did not first survive step 1.
 */
import { getSql, hasDb } from "@/lib/db/pool";
import { embedQuery } from "@/lib/rag/embeddings";

export interface SemanticHit {
  moduleId: string;
  section: string;
  content: string;
  similarity: number;
}

export async function rankKbModulesBySimilarity(input: {
  query: string;
  eligibleModuleIds: string[];
  topK?: number;
}): Promise<SemanticHit[]> {
  if (!hasDb() || input.eligibleModuleIds.length === 0) return [];
  const topK = input.topK ?? 8;

  let queryVec: number[];
  try {
    queryVec = await embedQuery(input.query);
  } catch (err) {
    console.warn("[semantic-rank] query embed failed:", err);
    return [];
  }
  if (queryVec.length === 0) return [];

  const sql = getSql();
  try {
    const rows = await sql.query(
      `SELECT source_id, section, content, 1 - (embedding <=> $1::vector) AS similarity
         FROM kb_embeddings
        WHERE source_kind = 'kb_module'
          AND status = 'ACTIVE'
          AND source_id = ANY($2::text[])
        ORDER BY embedding <=> $1::vector
        LIMIT $3`,
      [`[${queryVec.join(",")}]`, input.eligibleModuleIds, topK],
    );
    const list = Array.isArray(rows) ? rows : (rows as { rows: unknown[] }).rows;
    return (list as Array<Record<string, unknown>>).map((r) => ({
      moduleId: r.source_id as string,
      section: r.section as string,
      content: r.content as string,
      similarity: Number(r.similarity ?? 0),
    }));
  } catch (err) {
    console.warn("[semantic-rank] pgvector query failed:", err);
    return [];
  }
}
