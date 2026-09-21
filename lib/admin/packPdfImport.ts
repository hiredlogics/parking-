import { extractPrintableText } from "@/services/extraction/rulesOcr";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import { validateKeeperSafe } from "@/lib/keeperSafe";

export interface ParsedPackParagraph {
  id: string;
  title: string;
  text: string;
  /** True when text differs from the compiled pack library. */
  changed: boolean;
  keeperSafe: boolean;
  keeperSafeError?: string;
}

export interface PackPdfParseResult {
  extractedChars: number;
  guidanceText: string;
  paragraphs: ParsedPackParagraph[];
  warnings: string[];
}

const PP_ID_RE = /\b(PP-[A-Z]+-\d+[A-Z]?)\b/g;

/**
 * Parse an uploaded Master Pack / rules PDF into:
 *  - guidance text for the AI drafting prompt supplement
 *  - paragraph updates for known PP-* IDs (rules-engine library)
 *
 * Rule *conditions* stay in code — only wording / guidance is updated.
 */
export function parsePackPdfBytes(
  bytes: Uint8Array,
  mimeType: string,
): PackPdfParseResult {
  const warnings: string[] = [];
  const raw = extractPrintableText(bytes, mimeType).trim();
  if (raw.length < 80) {
    warnings.push(
      "Very little text was extracted. Scanned PDFs may need OCR — paste text manually if needed.",
    );
  }

  const byId = new Map(PARAGRAPH_LIBRARY.map((p) => [p.id, p]));
  const paragraphs: ParsedPackParagraph[] = [];

  // Split on paragraph IDs so each PP-* block can update library wording.
  const ids = [...raw.matchAll(PP_ID_RE)].map((m) => m[1]);
  const uniqueIds = [...new Set(ids)].filter((id) => byId.has(id));

  for (const id of uniqueIds) {
    const pack = byId.get(id)!;
    const idx = raw.indexOf(id);
    if (idx < 0) continue;
    const after = raw.slice(idx + id.length);
    const nextMatch = after.match(/\bPP-[A-Z]+-\d+[A-Z]?\b/);
    const chunk = (nextMatch ? after.slice(0, nextMatch.index) : after)
      .replace(/^[\s:.\-–—]+/, "")
      .trim();

    // Take a reasonable paragraph body (stop at huge blobs).
    const text = chunk
      .split(/\n{2,}/)[0]
      ?.replace(/\s+/g, " ")
      .trim()
      .slice(0, 2500);

    if (!text || text.length < 40) continue;
    // Skip if it's basically the same as the ID line noise.
    if (text === id) continue;

    const safety = validateKeeperSafe(text);
    const changed = text !== pack.text;
    paragraphs.push({
      id,
      title: pack.title,
      text,
      changed,
      keeperSafe: safety.ok,
      keeperSafeError: safety.ok
        ? undefined
        : safety.violations.map((v) => v.label).join("; "),
    });
  }

  if (uniqueIds.length === 0) {
    warnings.push(
      "No known PP-* paragraph IDs found in the PDF. Prompt guidance can still be updated from the full text.",
    );
  }

  const guidanceText = buildGuidanceFromExtract(raw, paragraphs);
  return {
    extractedChars: raw.length,
    guidanceText,
    paragraphs,
    warnings,
  };
}

function buildGuidanceFromExtract(
  raw: string,
  paragraphs: ParsedPackParagraph[],
): string {
  const header = `ADMIN PACK UPDATE (from uploaded rules PDF)
Use the following as additional Master Pack guidance. Prefer this wording when it matches the case facts. Do not invent grounds outside this guidance and the approved library.
`;
  const listed = paragraphs
    .filter((p) => p.changed && p.keeperSafe)
    .slice(0, 40)
    .map((p) => `${p.id} (${p.title}):\n${p.text}`)
    .join("\n\n");

  const trimmedRaw = raw.length > 12000 ? `${raw.slice(0, 12000)}\n…[truncated]` : raw;
  return [header, listed || "(No structured PP-* updates detected.)", "", "--- Source extract ---", trimmedRaw]
    .filter(Boolean)
    .join("\n");
}
