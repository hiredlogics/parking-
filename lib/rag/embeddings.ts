import OpenAI from "openai";
import { openAiApiKey } from "@/services/ai/models";

const EMBED_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";

/** Cosine similarity for unit-ish vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = openAiApiKey();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY required for rule embeddings.");
  }
  const client = new OpenAI({ apiKey });
  const cleaned = texts.map((t) => t.replace(/\s+/g, " ").trim().slice(0, 8000));
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: cleaned,
  });
  return res.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v ?? [];
}

export function embeddingModelId(): string {
  return EMBED_MODEL;
}
