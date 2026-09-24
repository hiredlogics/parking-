/**
 * AppealAnalysis — the only object the LLM may use to draft.
 *
 * Built from Case Intelligence + retrieval. The model does not choose
 * grounds; it receives them already decided.
 */
import type { CaseIntelligence } from "@/lib/cases/caseIntelligence";
import type { PofaAnalysis } from "@/lib/analysis/types";
import type { KbModule, LegalSource } from "@/lib/kb/types";
import type { RouteFamily } from "@/types/caseState";

export interface AppealAnalysis {
  primary_ground: string | null;
  secondary_grounds: string[];
  primary_route: RouteFamily | null;
  secondary_routes: RouteFamily[];
  supporting_facts: Record<string, unknown>;
  evidence_refs: string[];
  applicable_rules: string[];
  knowledge_modules: Array<{ moduleId: string; routeFamily: string; title?: string }>;
  legal_sources: Array<{ sourceId: string; title: string }>;
  prohibited_claims: string[];
  pofa: PofaAnalysis | null;
  code_version: string | null;
}

export function buildAppealAnalysis(input: {
  intelligence: CaseIntelligence;
  modules: KbModule[];
  sources: LegalSource[];
  evidenceRefs?: string[];
}): AppealAnalysis {
  const ci = input.intelligence;
  const supported = ci.supported_grounds ?? [];
  const primary = supported[0] ?? null;
  const secondary = supported.slice(1);

  const supporting_facts: Record<string, unknown> = {
    ...ci.confirmedFacts,
  };
  for (const g of supported) {
    Object.assign(supporting_facts, g.supportingFacts);
  }

  return {
    primary_ground: primary?.code ?? ci.analysis?.primaryRoute ?? null,
    secondary_grounds: secondary.map((g) => g.code),
    primary_route: ci.analysis?.primaryRoute ?? primary?.routeFamily ?? null,
    secondary_routes: ci.analysis?.secondaryRoutes ?? [],
    supporting_facts,
    evidence_refs: input.evidenceRefs ?? ci.evidence ?? [],
    applicable_rules: ci.applicable_rules ?? [],
    knowledge_modules: input.modules.map((m) => ({
      moduleId: m.moduleId,
      routeFamily: String(m.routeFamily),
      title: m.topic,
    })),
    legal_sources: input.sources.map((s) => ({
      sourceId: s.sourceId,
      title: s.title,
    })),
    prohibited_claims: ci.prohibited_claims ?? ci.analysis?.prohibitedClaims ?? [],
    pofa: ci.pofa_analysis ?? ci.pofa,
    code_version: ci.code_version ?? ci.analysis?.codeVersion ?? null,
  };
}
