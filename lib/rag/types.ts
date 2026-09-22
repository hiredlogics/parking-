/**
 * Separate rules vector store for RAG.
 *
 * Rules / KB propositions live here as embeddable chunks — not baked
 * into the LLM system prompt. At draft time we embed a short case
 * query, retrieve the top matching chunks, and inject only those into
 * the user message (classic RAG).
 */

export interface RuleChunk {
  id: string;
  /** Source family — keeps Master Pack rules separate from KB modules. */
  source: "kb_module" | "master_rule" | "paragraph";
  /** Stable source id (module id / rule id / paragraph id). */
  sourceId: string;
  /** Route hint when known (for soft filtering). */
  route: string | null;
  /** Text embedded and shown to the model. */
  text: string;
}

export interface EmbeddedRuleChunk extends RuleChunk {
  embedding: number[];
}

export interface RagHit {
  chunk: RuleChunk;
  score: number;
}
