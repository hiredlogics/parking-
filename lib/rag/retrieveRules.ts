import { loadKbCatalog } from "@/lib/kb/catalog";
import { RULES } from "@/rules/rules";
import type { RuleChunk } from "./types";
import {
  ensureRulesVectorStore,
  resetRulesVectorStore,
  searchRulesVectorStore,
} from "./vectorStore";

/**
 * Build rule chunks from the separate knowledge sources
 * (KB modules + Master Pack rule descriptions). Paragraph bodies stay
 * in the deterministic pack path; this store holds propositions/rules
 * for RAG retrieval only.
 */
export async function buildRuleChunks(): Promise<RuleChunk[]> {
  const chunks: RuleChunk[] = [];

  try {
    const catalog = await loadKbCatalog();
    for (const m of catalog.modules) {
      if (m.status !== "ACTIVE") continue;
      const text = [
        m.topic,
        m.coreProposition,
        m.legalBasis ?? "",
        ...(m.aiMustCheck ?? []),
        m.draftingNotes ?? "",
      ]
        .filter(Boolean)
        .join("\n")
        .trim();
      if (text.length < 40) continue;
      chunks.push({
        id: `kb:${m.moduleId}`,
        source: "kb_module",
        sourceId: m.moduleId,
        route: typeof m.routeFamily === "string" ? m.routeFamily : null,
        text: text.slice(0, 4000),
      });
    }
  } catch (err) {
    console.warn("[rag] KB catalog unavailable for indexing:", err);
  }

  for (const r of RULES) {
    const text = `${r.id}: ${r.description}`.trim();
    if (text.length < 20) continue;
    chunks.push({
      id: `rule:${r.id}`,
      source: "master_rule",
      sourceId: r.id,
      route: r.route ? String(r.route) : null,
      text,
    });
  }

  return chunks;
}

export async function warmRulesVectorStore(): Promise<number> {
  const chunks = await buildRuleChunks();
  resetRulesVectorStore();
  await ensureRulesVectorStore(chunks);
  return chunks.length;
}

/**
 * RAG retrieve: case summary → top matching rules from the vector store.
 * Returned text is safe to inject into the drafting prompt as retrieved
 * context (still subject to existing validators).
 */
export async function retrieveRulesForCase(input: {
  query: string;
  routes?: string[];
  topK?: number;
}): Promise<{ texts: string[]; ids: string[] }> {
  const chunks = await buildRuleChunks();
  await ensureRulesVectorStore(chunks);
  const hits = await searchRulesVectorStore({
    query: input.query,
    topK: input.topK ?? 8,
    routeAllowlist: input.routes ?? null,
  });
  return {
    texts: hits.map((h) => h.chunk.text),
    ids: hits.map((h) => h.chunk.sourceId),
  };
}

export function buildCaseRagQuery(parts: {
  allegedBreach?: string | null;
  operatorName?: string | null;
  routes?: string[];
  circumstanceTags?: string[];
  findings?: string[];
}): string {
  return [
    "UK private parking initial operator appeal.",
    parts.operatorName ? `Operator: ${parts.operatorName}.` : "",
    parts.allegedBreach ? `Allegation: ${parts.allegedBreach}.` : "",
    parts.routes?.length ? `Routes: ${parts.routes.join(", ")}.` : "",
    parts.circumstanceTags?.length
      ? `Circumstances: ${parts.circumstanceTags.join(", ")}.`
      : "",
    parts.findings?.length ? `Findings: ${parts.findings.join("; ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
