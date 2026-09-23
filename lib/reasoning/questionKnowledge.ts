import type { RouteFamily } from "@/types/caseState";
import { NON_BINDING_STATUSES } from "@/lib/kb/types";
import type { KbModule, LegalSource } from "@/lib/kb/types";
import {
  modulesForRetrieval,
  sourcesForRetrieval,
} from "@/lib/kb/catalog";
import { moduleAllowed } from "@/lib/retrieval/gates";
import type { KnownFacts } from "@/lib/facts/types";
import type { FactRequirement } from "@/lib/facts/requirements";
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
 *
 * Catalog: the same loadKbCatalog() repository as drafting. Callers
 * must pass modules (and ideally sources) from that catalog in
 * production — see modulesForRetrieval.
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
  /** Injectable for tests / live catalog. Same source as drafting. */
  modules?: KbModule[];
  /** Injectable sources — blocked-status set is derived from these. */
  sources?: LegalSource[];
}

function blockedSourceIds(sources: LegalSource[]): Set<string> {
  return new Set(
    sources
      .filter((s) => NON_BINDING_STATUSES.includes(s.status))
      .map((s) => s.sourceId),
  );
}

/**
 * Effective-date window — aligned with lib/retrieval/engine.ts so
 * questioning and drafting cannot disagree about which version applies.
 */
function withinEffectiveWindow(
  module: KbModule,
  eventDate: string | null | undefined,
): boolean {
  if (!module.effectiveFrom && !module.effectiveTo) return true;
  if (!eventDate) return false;
  const t = Date.parse(eventDate);
  if (Number.isNaN(t)) return false;
  if (module.effectiveFrom && Date.parse(module.effectiveFrom) > t) return false;
  if (module.effectiveTo && Date.parse(module.effectiveTo) <= t) return false;
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

  const all = modulesForRetrieval(input.modules);
  const sources = sourcesForRetrieval(input.sources);
  const blocked = blockedSourceIds(sources);
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
      m.sourceIds.every((id) => blocked.has(id))
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
  ].slice(0, 2);

  return ordered.map((m) => ({
    topic: m.topic,
    proposition: m.coreProposition,
    mustCheck: m.aiMustCheck.slice(0, 4),
    evidenceHelps: m.evidenceNeeded.slice(0, 4),
  }));
}
