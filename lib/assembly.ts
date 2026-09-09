import type { AllAnswers, ConfirmedPcn, EvidenceItem, Paragraph, RuleEvaluation } from "@/types";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import { buildVariableMap, replaceVariables } from "./variables";
import { validateKeeperSafe } from "./keeperSafe";

export interface AssembledAppeal {
  paragraphs: Array<Pick<Paragraph, "id" | "title" | "category" | "priority"> & { text: string }>;
  body: string;
  warnings: string[];
  unresolvedVariables: string[];
  keeperSafe: boolean;
  keeperSafeViolations: Array<{ label: string; excerpt: string }>;
}

/**
 * Assemble the final appeal.
 *
 * Ordering (Master Developer Pack, Part 9):
 *   1. Always start with PP-INTRO-001. PP-INTRO-002 only on the
 *      unidentified-driver keeper route.
 *   2. Only confirmed PoFA defects are inserted.
 *   3. Primary factual grounds come before secondary evidence / signage /
 *      authority grounds — enforced by paragraph priority.
 *   4. Multiple routes may coexist.
 *   5. Suppress repeated facts: the pack achieves this by writing distinct
 *      paragraphs that each add a novel legal or factual point. We simply
 *      deduplicate by paragraph ID (Set semantics). We DO NOT drop
 *      paragraphs that share a factual anchor — Example A explicitly
 *      includes PP-PAY-001 + PP-KEY-001 together.
 *   6-11. Enforced upstream in the rules table.
 *   12. Final output must be a coherent letter without visible rule IDs
 *       or paragraph IDs — the `body` string only contains paragraph
 *       text, not IDs.
 */
export function assembleAppeal(
  pcn: ConfirmedPcn,
  answers: AllAnswers,
  _evidence: EvidenceItem[],
  evaluation: RuleEvaluation,
  paragraphs: Paragraph[] = PARAGRAPH_LIBRARY,
): AssembledAppeal {
  const warnings = [...evaluation.warnings];

  // 1. Materialise selected paragraphs by ID (already deduplicated by
  //    Set semantics in the engine). Inactive paragraphs (toggled off via
  //    the CRM) are dropped even if a rule matched them.
  const byId = new Map(paragraphs.map((p) => [p.id, p]));
  const selected: Paragraph[] = [];
  for (const id of evaluation.matchedParagraphIds) {
    const p = byId.get(id);
    if (p && p.active) selected.push(p);
  }

  // 2. Sort by priority (stable — intro < primary < secondary < closing).
  selected.sort((a, b) => a.priority - b.priority);

  // 3. Variable replacement.
  const vars = buildVariableMap(pcn, answers);
  const unresolvedAll: string[] = [];
  const filledParas = selected.map((p) => {
    const { text, unresolved } = replaceVariables(p.text, vars);
    unresolvedAll.push(...unresolved);
    return {
      id: p.id,
      title: p.title,
      category: p.category,
      priority: p.priority,
      text,
    };
  });

  // 4. Compose the body. No rule IDs. No paragraph IDs.
  const body = filledParas.map((p) => p.text).join("\n\n");

  // 5. Keeper-safe validation on the FINAL text.
  const safety = validateKeeperSafe(body);

  if (unresolvedAll.length > 0) {
    warnings.push(
      `Unresolved variables in the assembled appeal: ${Array.from(new Set(unresolvedAll)).join(", ")}. Generation must be blocked until these are provided or the affected paragraphs are removed.`,
    );
  }

  if (!safety.ok) {
    warnings.push(
      `Keeper-safe validation failed with ${safety.violations.length} violation(s). Generation must be blocked.`,
    );
  }

  return {
    paragraphs: filledParas,
    body,
    warnings,
    unresolvedVariables: Array.from(new Set(unresolvedAll)),
    keeperSafe: safety.ok,
    keeperSafeViolations: safety.violations,
  };
}

/**
 * Utility for tests / previews — get paragraphs by ID in library order.
 */
export function orderParagraphs(ids: string[]): Paragraph[] {
  const set = new Set(ids);
  return PARAGRAPH_LIBRARY.filter((p) => set.has(p.id) && p.active).sort(
    (a, b) => a.priority - b.priority,
  );
}
