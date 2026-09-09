export type ParagraphCategory =
  | "intro"
  | "pofa"
  | "payment"
  | "keying"
  | "consideration"
  | "grace"
  | "anpr"
  | "authorisation"
  | "signage"
  | "landowner"
  | "evidence"
  | "closing";

/**
 * An approved paragraph from the Master Developer Pack, Part 8.
 * Text is canonical: it MUST NOT be rewritten by code. The system only:
 *   1. selects paragraphs by trigger,
 *   2. substitutes {{variables}}, and
 *   3. deduplicates by paragraph ID (via a Set — never by rewriting).
 */
export interface Paragraph {
  id: string;
  /** Human-readable title (from PDF heading). */
  title: string;
  /** Free-form trigger description from the pack (used in decisionTrace). */
  trigger: string;
  /** Canonical text, exactly as approved. */
  text: string;
  category: ParagraphCategory;
  /** Lower priority is emitted earlier in the assembled letter. */
  priority: number;
  active: boolean;
}
