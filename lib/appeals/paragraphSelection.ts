/**
 * Redundant-paragraph suppression, shared by every drafting path.
 *
 * WHY THIS IS SHARED RATHER THAN LOCAL
 * ------------------------------------
 * Two paths assemble approved wording: the retrieval/AI path
 * (lib/drafting/engine.ts, from `retrieval.blocks`) and the Master Pack
 * rules path (lib/appeals/rulesLetter.ts, from `matchedParagraphIds`).
 * Both draw on the same underlying paragraph text — lib/kb/seed/blocks.ts
 * imports PARAGRAPH_LIBRARY unchanged — so a redundant pair is redundant
 * in both, and suppressing it in only one produces the exact divergence
 * that let a letter pass validation on one path and fail on the other.
 *
 * WHAT COUNTS AS REDUNDANT
 * ------------------------
 * Only pairs that state the SAME point in near-identical terms, where
 * the rules select a general form and a more specific form together.
 * Overlap is measured with the same word-set similarity VAL-REPETITION
 * uses (lib/validation/validators.ts), and at the configured severity a
 * letter carrying both cannot be released at all — so these pairs made
 * whole categories of case unreleasable rather than merely wordy.
 *
 * This drops a duplicate from the SELECTION. It never edits approved
 * wording, which is the Master Pack owner's decision and not this
 * layer's, and it never adds a paragraph the rules did not select.
 */

/**
 * Pairs of approved paragraphs that make the same point.
 *
 * `keep` is the more specific of the two and survives; `drop` only
 * restates it. Suppression applies only when BOTH are present, so a
 * case that selects just one is untouched — which matters, because the
 * dropped paragraph is the right one to use alone when the specific
 * trigger is absent.
 */
const REDUNDANT_PAIRS: ReadonlyArray<{
  keep: string;
  drop: string;
  why: string;
}> = [
  {
    // Both close the keeper-liability argument. PP-POFA-006 ties the
    // unidentified driver to the established failure; PP-POFA-007 only
    // restates the conclusion. Measured overlap 0.75.
    keep: "PP-POFA-006",
    drop: "PP-POFA-007",
    why: "duplicate keeper-liability conclusion",
  },
  {
    /*
     * The keying pair, selected together by the KEYING_ROUTE rules
     * whenever a payment was made and the registration was mis-keyed.
     * Both say a payment was nevertheless made, and both ask the
     * operator to match it against its transaction records; measured
     * overlap 0.86, the highest in the pack.
     *
     * PP-KEY-002 is kept as the more specific: it fires only where a
     * MINOR error is established, it invokes the Code's keying-error
     * requirements, and it reads correctly on its own. This pair was a
     * known, documented content gap that made the entire
     * payment-plus-keying combination unreleasable — see the UAT-1 note
     * in tests/integration/pipelineAccuracy.test.ts.
     */
    keep: "PP-KEY-002",
    drop: "PP-KEY-001",
    why: "duplicate payment-was-made point",
  },
  {
    /*
     * The payment pair. PP-PAY-001 asserts bare that "payment was made
     * in connection with the vehicle's use of the site"; PP-PAY-002 says
     * the same thing and adds that the evidence demonstrates it and that
     * it must be considered before further enforcement. Measured overlap
     * 0.67 — the whole of PP-PAY-001's point is contained in PP-PAY-002.
     *
     * PP-PAY-002 is kept because it is the evidence-backed form, and it
     * is only selected where payment evidence exists. Where there is no
     * evidence, PP-PAY-001 fires alone and is untouched, which is the
     * correct letter for that case.
     */
    keep: "PP-PAY-002",
    drop: "PP-PAY-001",
    why: "bare payment assertion superseded by the evidence-backed form",
  },
];

/** The block/paragraph IDs suppressed for a given selection. */
export function redundantParagraphIds(
  selected: Iterable<string>,
): Set<string> {
  const present = new Set(selected);
  const dropped = new Set<string>();
  for (const { keep, drop } of REDUNDANT_PAIRS) {
    if (present.has(keep) && present.has(drop)) dropped.add(drop);
  }
  return dropped;
}

/**
 * Filter a selection, dropping redundant restatements.
 *
 * Generic over the item type so the block list and the plain ID list can
 * share one implementation rather than two that drift.
 */
export function withoutRedundantParagraphs<T>(
  items: readonly T[],
  idOf: (item: T) => string,
): T[] {
  const dropped = redundantParagraphIds(items.map(idOf));
  if (dropped.size === 0) return [...items];
  return items.filter((item) => !dropped.has(idOf(item)));
}
