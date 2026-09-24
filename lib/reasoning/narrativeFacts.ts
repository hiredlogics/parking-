/**
 * Clear factual assertions read from the customer's free-text account.
 *
 * V2: when the customer has already stated a concrete fact in their own
 * words (e.g. "I left and returned"), Case Intelligence must treat that
 * as an established CUSTOMER_FACT and not re-ask it. Ambiguous prose
 * still only opens tags via classifyNarrative — this module only lifts
 * high-confidence, inspectable extractions.
 */
import type { AnswerValue } from "@/lib/facts/types";
import { FACT } from "@/lib/facts/facts";

export interface NarrativeFactHit {
  field: string;
  value: AnswerValue;
  phrase: string;
}

const WORD_NUM: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  twice: 2,
};

/**
 * Extract assertable facts from free text. Never overrides an existing
 * answer — callers must skip keys already known.
 */
export function factsFromNarrative(
  text: string | null | undefined,
): NarrativeFactHit[] {
  const input = (text ?? "").trim();
  if (input.length < 8) return [];

  const hits: NarrativeFactHit[] = [];

  const leftReturned =
    /\bleft\s+and\s+(?:returned|came\s+back)\b/i.exec(input) ||
    /\bleft\s+(?:the\s+)?(?:site|car\s*park|park(?:ing)?)\b.{0,40}\b(?:returned|came\s+back)\b/i.exec(
      input,
    ) ||
    /\bwent\s+(?:out|away|off)\b.{0,40}\bcame\s+back\b/i.exec(input) ||
    /\bnot\s+(?:there\s+)?continuously\b/i.exec(input) ||
    /\bcame\s+back\s+(?:later|again)\b/i.exec(input) ||
    /\breturned\s+(?:later|again|to\s+(?:the\s+)?(?:site|car\s*park))\b/i.exec(
      input,
    );

  if (leftReturned) {
    hits.push({
      field: FACT.CONTINUOUS_PRESENCE,
      value: "NO",
      phrase: leftReturned[0],
    });
  }

  const visits =
    /\b(\d+|two|three|four|five|twice)\s+(?:separate\s+)?(?:visits?|trips?)\b/i.exec(
      input,
    );
  if (visits) {
    const raw = visits[1].toLowerCase();
    const n = WORD_NUM[raw] ?? Number(raw);
    if (Number.isFinite(n) && n >= 2) {
      hits.push({
        field: FACT.VISIT_COUNT,
        value: n,
        phrase: visits[0],
      });
      if (!hits.some((h) => h.field === FACT.CONTINUOUS_PRESENCE)) {
        hits.push({
          field: FACT.CONTINUOUS_PRESENCE,
          value: "NO",
          phrase: visits[0],
        });
      }
    }
  }

  const stayedWholeTime =
    /\b(?:was|stayed)\s+(?:there\s+)?(?:continuously|the\s+whole\s+time)\b/i.exec(
      input,
    ) || /\bdid\s+not\s+leave\b/i.exec(input);
  if (
    stayedWholeTime &&
    !hits.some((h) => h.field === FACT.CONTINUOUS_PRESENCE)
  ) {
    hits.push({
      field: FACT.CONTINUOUS_PRESENCE,
      value: "YES",
      phrase: stayedWholeTime[0],
    });
  }

  return hits;
}
