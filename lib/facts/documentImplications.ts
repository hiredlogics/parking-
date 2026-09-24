/**
 * Document implications — notice-visible facts must not be re-asked.
 *
 * When the confirmed notice already carries entry/exit times (and/or a
 * recorded duration), the document has established camera-style
 * timing. Asking "does the notice use ANPR images?" is asking the
 * customer to re-interpret the notice.
 *
 * Generic: keyed off known notice fields, not operator names.
 */
import { FACT, factNum, factStr } from "@/lib/facts/facts";
import type { KnownFacts } from "@/lib/facts/types";

/**
 * Facts that become established once related notice fields are present.
 * Value is admitted with provenance `notice` so Adaptive Questions skip it.
 */
export function documentImpliedFacts(facts: KnownFacts): Record<
  string,
  { value: string; reason: string }
> {
  const out: Record<string, { value: string; reason: string }> = {};
  const entry = factStr(facts, FACT.ENTRY_TIME);
  const exit = factStr(facts, FACT.EXIT_TIME);
  const duration = factNum(facts, FACT.TOTAL_RECORDED_DURATION);
  const hasCameraTiming =
    (entry !== null && exit !== null) ||
    (typeof duration === "number" && duration > 0);

  if (hasCameraTiming && !facts.known.has(FACT.ANPR_IMAGES_ON_NOTICE)) {
    out[FACT.ANPR_IMAGES_ON_NOTICE] = {
      value: "YES",
      reason:
        "Notice already records entry/exit times or a camera-derived duration; ANPR imaging on the notice is established from the document.",
    };
  }

  return out;
}

/**
 * Merge document-implied facts into a KnownFacts view.
 * Does not overwrite customer answers or already-known notice values.
 */
export function applyDocumentImplications(facts: KnownFacts): KnownFacts {
  const implied = documentImpliedFacts(facts);
  if (Object.keys(implied).length === 0) return facts;

  const values = { ...facts.values };
  const known = new Set(facts.known);
  const provenance = { ...facts.provenance };

  for (const [key, { value }] of Object.entries(implied)) {
    if (known.has(key)) continue;
    values[key] = value;
    known.add(key);
    provenance[key] = "notice";
  }

  return { ...facts, values, known, provenance };
}

/** True when a fact must not be asked of the customer. */
export function isDocumentEstablished(
  facts: KnownFacts,
  factKey: string,
): boolean {
  const src = facts.provenance[factKey];
  if (src === "notice" || src === "document") return true;
  if (src === "computed" && facts.known.has(factKey)) {
    // Document-implied facts may be marked computed in some paths.
    if (factKey in documentImpliedFacts(facts)) return true;
  }
  // Implied but not yet merged — still treat as document-established.
  return factKey in documentImpliedFacts(facts);
}
