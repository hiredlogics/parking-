import type { RouteFamily } from "@/types/caseState";
import { ALL_KB_MODULES } from "@/lib/kb/seed";
import { LEGAL_SOURCES } from "@/lib/kb/seed/sources";
import { NON_BINDING_STATUSES } from "@/lib/kb/types";
import type { KbModule } from "@/lib/kb/types";
import { moduleAllowed } from "@/lib/retrieval/gates";
import type { KnownFacts } from "@/lib/questions/types";
import type { FactRequirement } from "@/lib/questions/requirements";
import type { PofaAnalysis } from "@/lib/analysis/types";

/**
 * Controlled retrieval during questioning (MASTER V2 §K).
 *
 * The question generator needs to understand WHY a factual uncertainty
 * matters, or it will invent a reason. But it must not perform broad
 * legal RAG either — that is how models start inventing requirements.
 *
 * So this is deliberately narrow:
 *
 *   target fact + its route
 *        → approved ACTIVE modules for that route
 *        → filtered by effective date, jurisdiction, source status
 *        → the fact-level gates the retrieval layer already uses
 *        → the smallest useful summary
 *
 * The KB decides what is legally relevant. The model only decides
 * wording. No module or source ID is ever included, so nothing
 * identifying the knowledge base can reach a customer even if the
 * model tried to echo its context.
 */

export interface QuestionKnowledge {
  /** Plain topic, e.g. "Payment". Safe, non-identifying. */
  topic: string;
  /** What the module is permitted to argue. */
  proposition: string;
  /** Points the analysis must verify — why the fact matters. */
  mustCheck: string[];
  /** Evidence that would support this ground. */
  evidenceHelps: string[];
}

export interface RetrieveForQuestionInput {
  requirement: FactRequirement;
  facts: KnownFacts;
  evidenceTypes: string[];
  parkingEventDate?: string | null;
  jurisdiction?: string | null;
  /**
   * Deterministic PoFA state. Some module gates depend on it, and it is
   * computed in code — never guessed by a model.
   */
  pofa: PofaAnalysis;
  /** Injectable for tests. */
  modules?: KbModule[];
}

/** Sources that may never be presented as current law. */
const BLOCKED_SOURCE_IDS = new Set(
  LEGAL_SOURCES.filter((s) => NON_BINDING_STATUSES.includes(s.status)).map(
    (s) => s.sourceId,
  ),
);

function withinEffectiveWindow(
  module: KbModule,
  eventDate: string | null | undefined,
): boolean {
  if (!eventDate) return true;
  const t = Date.parse(eventDate);
  if (Number.isNaN(t)) return true;
  if (module.effectiveFrom && Date.parse(module.effectiveFrom) > t) return false;
  if (module.effectiveTo && Date.parse(module.effectiveTo) < t) return false;
  return true;
}

/**
 * Minimal approved knowledge for one target fact.
 *
 * Returns at most a couple of entries — enough to explain the issue,
 * not enough to draft from.
 */
export function retrieveForQuestion(
  input: RetrieveForQuestionInput,
): QuestionKnowledge[] {
  const route = input.requirement.route;
  // Triage and scope questions serve no legal route; there is nothing
  // to retrieve and nothing for the model to misread.
  if (route === "TRIAGE" || route === "SCOPE") return [];

  const all = input.modules ?? ALL_KB_MODULES;
  const cited = new Set(input.requirement.kbModules);

  const eligible = all.filter((m) => {
    // Governance modules are never drafting or questioning material.
    if (m.routeFamily === "GOVERNANCE") return false;
    if (m.status !== "ACTIVE") return false;
    if (m.routeFamily !== (route as RouteFamily)) return false;
    if (!withinEffectiveWindow(m, input.parkingEventDate)) return false;
    // A module resting only on non-binding material cannot inform a
    // question about what the law requires.
    if (
      m.sourceIds.length > 0 &&
      m.sourceIds.every((id) => BLOCKED_SOURCE_IDS.has(id))
    ) {
      return false;
    }
    // Reuse the same fact-level gates the drafting retrieval applies,
    // so questioning and drafting cannot disagree about relevance.
    return moduleAllowed(m.moduleId, {
      facts: input.facts,
      pofa: input.pofa,
      evidence: new Set(input.evidenceTypes),
    });
  });

  // Prefer the modules the requirement itself names — that is the
  // traceable link between "this fact is material" and "because of
  // this reviewed proposition".
  const ordered = [
    ...eligible.filter((m) => cited.has(m.moduleId)),
    ...eligible.filter((m) => !cited.has(m.moduleId)),
  ];

  return ordered.slice(0, 2).map((m) => ({
    topic: m.topic,
    proposition: m.coreProposition,
    mustCheck: m.aiMustCheck.slice(0, 3),
    evidenceHelps: m.evidenceNeeded.slice(0, 3),
  }));
}

/**
 * Why this fact matters, in one short line for the prompt.
 *
 * Falls back to the requirement's own rationale when no module
 * survives the filters — the rationale is itself reviewed text from the
 * requirement map, so the model is never left to invent a reason.
 */
export function whyFactMatters(
  requirement: FactRequirement,
  knowledge: QuestionKnowledge[],
): string {
  if (knowledge.length === 0) return requirement.rationale;
  return `${requirement.rationale} Relevant approved position: ${knowledge[0].proposition}`;
}
