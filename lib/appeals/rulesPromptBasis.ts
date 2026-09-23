import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/facts/types";
import { buildRulesBasedLetter } from "@/lib/appeals/rulesLetter";
import { RULES } from "@/rules";

/**
 * Compact Master Pack basis injected into the AI drafting prompt so the
 * model writes from defined rules + approved paragraph wording — not
 * free legal improvisation.
 *
 * Rule / paragraph IDs may appear in the prompt for grounding; the
 * drafting post-processor strips any that leak into the letter body.
 */
export interface RulesPromptBasis {
  activeRoutes: string[];
  matchedRuleIds: string[];
  matchedRuleDescriptions: string[];
  approvedParagraphTexts: string[];
  assembledBody: string;
}

export async function buildRulesPromptBasis(input: {
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  evidenceTypes?: string[];
}): Promise<RulesPromptBasis> {
  const letter = await buildRulesBasedLetter({
    confirmed: input.confirmed,
    answers: input.answers,
    evidenceTypes: input.evidenceTypes,
  });

  const descriptions: string[] = [];
  const ruleIds: string[] = [];

  for (const r of RULES) {
    if (r.active === false) continue;
    const ownsMatched = r.paragraphIds.some((pid) =>
      letter.matchedParagraphIds.includes(pid),
    );
    const routeActive =
      Boolean(r.route) && letter.activeRoutes.includes(r.route!);
    if (!ownsMatched && !routeActive) continue;
    ruleIds.push(r.id);
    descriptions.push(`${r.id}: ${r.description}`);
  }

  return {
    activeRoutes: letter.activeRoutes,
    matchedRuleIds: [...new Set(ruleIds)].slice(0, 30),
    matchedRuleDescriptions: [...new Set(descriptions)].slice(0, 24),
    approvedParagraphTexts: letter.paragraphs.map((p) => p.text).filter(Boolean),
    assembledBody: letter.body,
  };
}
