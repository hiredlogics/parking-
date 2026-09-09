import type { Route, Rule, RuleEvaluation, RuleInput, RuleTraceEntry } from "@/types";
import { RULES } from "./rules";

/**
 * Deterministic rules engine.
 *
 * Given a confirmed PCN, all customer answers and evidence, evaluates every
 * rule in the master trigger table (Master Developer Pack, Part 6) and
 * returns the matched paragraph IDs, active routes and a full trace.
 *
 * This function is a pure function of its input. No AI. No network calls.
 * No mutation of the input.
 *
 * Universal paragraphs (Part 9):
 *   - PP-INTRO-001 (trigger: registered_keeper = YES) — Part 9 rule 1
 *     says "Always start with PP-INTRO-001". The engine therefore adds
 *     PP-INTRO-001 whenever the appellant is a registered keeper,
 *     regardless of whether the driver has been identified.
 *   - PP-INTRO-002 is only added when the driver has not been identified
 *     (emitted by PP-R001).
 *   - PP-EV-001 is included whenever evidence is enclosed with the appeal.
 *   - PP-END-001 is always included as the closing.
 *
 * Deduplication is by paragraph ID (Set semantics). We do not remove
 * paragraphs that share a factual anchor: the pack explicitly assembles
 * PP-PAY-001 + PP-KEY-001 together (Example A) even though both state that
 * a payment was made.
 */
export function evaluate(input: RuleInput, rules: Rule[] = RULES): RuleEvaluation {
  const decisionTrace: RuleTraceEntry[] = [];
  const matchedRuleIds: string[] = [];
  const matchedParagraphSet = new Set<string>();
  const activeRoutes = new Set<Route>();
  const warnings: string[] = [];

  for (const rule of rules) {
    if (rule.active === false) continue;
    const result = rule.test(input);
    const entry: RuleTraceEntry = {
      ruleId: rule.id,
      matched: result.matched,
      reason: result.reason,
      paragraphIds: result.matched ? [...rule.paragraphIds] : [],
      route: rule.route,
    };
    decisionTrace.push(entry);
    if (result.matched) {
      matchedRuleIds.push(rule.id);
      if (rule.route) activeRoutes.add(rule.route);
      for (const pid of rule.paragraphIds) matchedParagraphSet.add(pid);
    }
  }

  // Part 9 rule 1 — always start with PP-INTRO-001 on a keeper appeal.
  // The paragraph's own trigger is `registered_keeper = YES`, so this
  // fires independently of whether the driver has been identified.
  if (input.answers.core.registered_keeper === "YES") {
    matchedParagraphSet.add("PP-INTRO-001");
  }

  // If any evidence is enclosed, add the generic supporting-evidence
  // paragraph (PP-EV-001). This is separate from category-specific
  // evidence paragraphs like PP-PAY-002 which are added by their own rules.
  if (input.evidence.length > 0) {
    matchedParagraphSet.add("PP-EV-001");
  }

  // Always close with PP-END-001 (final assembly).
  matchedParagraphSet.add("PP-END-001");

  // Part 9 rule 7: never combine consideration + grace as one allowance.
  const bothConsAndGrace =
    activeRoutes.has("CONSIDERATION_ROUTE") && activeRoutes.has("GRACE_ROUTE");
  if (bothConsAndGrace) {
    warnings.push(
      "Consideration and grace are both active. Per pack rule 7 they are kept as separate grounds and not combined into a single allowance.",
    );
  }

  if (activeRoutes.size === 0) {
    warnings.push(
      "No routes activated by the current answers. Consider revisiting the customer's answers before generating the appeal.",
    );
  }

  return {
    matchedRuleIds,
    matchedParagraphIds: Array.from(matchedParagraphSet),
    activeRoutes: Array.from(activeRoutes),
    warnings,
    decisionTrace,
  };
}
