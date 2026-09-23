import type { RouteFamily } from "@/types/caseState";
import type {
  DraftingBlock,
  KbModule,
  LegalSource,
  RetrievalOutput,
} from "@/lib/kb/types";
import { NON_BINDING_STATUSES } from "@/lib/kb/types";
import {
  blocksForRetrieval,
  modulesForRetrieval,
  sourcesForRetrieval,
} from "@/lib/kb/catalog";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { KnownFacts } from "@/lib/facts/types";
import { expandEvidenceKinds } from "@/types/evidence";
import { blockAllowed, moduleAllowed, type GateInput } from "./gates";

export const RETRIEVAL_VERSION = "retrieval-v1";

/**
 * Hybrid structured retrieval (AI Legal Knowledge Base V2 §20).
 *
 *   Issue Analysis
 *        -> Structured Filtering
 *        -> Eligible KB Modules
 *        -> Semantic ranking if necessary
 *        -> Approved Context
 *
 * The pack is explicit: "Do NOT rely exclusively on vector similarity."
 * Structured filters run FIRST and are the only thing that decides
 * eligibility. Ranking merely orders what survived, so a module can
 * never enter the drafting context on similarity alone.
 *
 * Filters applied, in order:
 *   1. status = ACTIVE
 *   2. route family in the analysis
 *   3. module effective dates vs parking event date
 *   4. source status — no non-binding source may support a proposition
 *   5. evidence availability (modules needing evidence we don't have are
 *      dropped where the evidence is essential)
 *   6. do_not_use_when exclusions vs prohibited claims
 */

export interface RetrievalInput {
  analysis: IssueAnalysis;
  /**
   * Derived case facts. Required for `use_when` gating — without it only
   * route-family filtering applies, which is too coarse to satisfy KB §20.
   */
  facts?: KnownFacts;
  /** Event date drives effective-date filtering. */
  parkingEventDate?: string | null;
  /** Evidence types actually available. */
  evidenceTypes?: string[];
  /** Override catalogues (tests / admin preview). */
  modules?: KbModule[];
  sources?: LegalSource[];
  blocks?: DraftingBlock[];
}

export interface RetrievalTraceEntry {
  moduleId: string;
  eligible: boolean;
  reason: string;
}

export interface RetrievalResult {
  output: RetrievalOutput;
  /** Approved context handed to the drafting layer. */
  modules: KbModule[];
  /** Blocks the retained modules are permitted to draw on. */
  blocks: DraftingBlock[];
  /** Sources backing the retained modules. */
  sources: LegalSource[];
  /** Full decision trace for the audit record. */
  trace: RetrievalTraceEntry[];
  retrievalVersion: string;
}

function withinEffectiveDates(
  m: KbModule,
  eventDate: string | null | undefined,
): boolean {
  if (!m.effectiveFrom && !m.effectiveTo) return true;
  if (!eventDate) return false;
  const t = Date.parse(eventDate);
  if (Number.isNaN(t)) return false;
  if (m.effectiveFrom && Date.parse(m.effectiveFrom) > t) return false;
  if (m.effectiveTo && Date.parse(m.effectiveTo) <= t) return false;
  return true;
}

/**
 * Modules whose evidence requirement is essential rather than merely
 * helpful. Dropping these without evidence implements VAL-EVIDENCE at
 * retrieval time instead of leaving it to the validator.
 */
export const EVIDENCE_ESSENTIAL: Record<string, string[]> = {
  "KB-BREAK-01": ["recovery_report", "garage_invoice", "roadside_record", "photos", "call_logs"],
  "KB-BREAK-03": ["recovery_report", "call_logs"],
  "KB-RES-01": ["lease", "tenancy", "parking_grant"],
  "KB-RES-02": ["lease", "tenancy", "parking_grant"],
  "KB-RES-03": ["lease", "tenancy", "parking_grant"],
  "KB-RES-04": ["lease", "tenancy", "parking_grant"],
  "KB-RES-06": ["lease", "tenancy", "parking_grant"],
  "KB-EV-01": ["dashcam", "receipt", "location_record", "cctv", "witness"],
};

/** Map a prohibited claim onto the module it would have supported. */
const PROHIBITION_BLOCKS_MODULE: Record<string, string[]> = {
  ALLEGE_POFA_TIMING_FAILURE: ["KB-POFA-02", "KB-POFA-03"],
  ALLEGE_POFA_CONTENT_DEFECT: ["KB-POFA-04"],
  RELY_ON_SCHEDULE_4_KEEPER_LIABILITY: [
    "KB-POFA-01", "KB-POFA-02", "KB-POFA-03", "KB-POFA-04", "KB-POFA-05",
  ],
  ASSERT_RESIDENTIAL_PRIMACY: ["KB-RES-01"],
  ASSERT_UNFETTERED_RIGHT: ["KB-RES-02"],
  ASSERT_DEROGATION_FROM_GRANT: ["KB-RES-04"],
  ASSERT_QUIET_ENJOYMENT: ["KB-RES-05"],
  ASSERT_FRUSTRATION_OR_IMPOSSIBILITY: ["KB-BREAK-02"],
  RAISE_EQUALITY_ACT_GROUND: ["KB-EQ-01", "KB-EQ-02", "KB-EQ-03"],
  ALLEGE_TIMESTAMP_DISCREPANCY: ["KB-ANPR-03"],
  ALLEGE_INCORRECT_ANPR_PAIRING: ["KB-ANPR-01", "KB-ANPR-02"],
  CHALLENGE_SIGNAGE_ADEQUACY: [
    "KB-SIGN-01", "KB-SIGN-02", "KB-SIGN-03", "KB-SIGN-04",
  ],
  ASSERT_PAYMENT_WAS_MADE: ["KB-PAY-01"],
  ASSERT_VALID_PERMIT_HELD: ["KB-AUTH-02"],
  ASSERT_NO_LANDOWNER_AUTHORITY_EXISTS: [],
};

export function retrieveKnowledge(input: RetrievalInput): RetrievalResult {
  // Production refuses the compiled seed when callers omit the catalog.
  // Live paths must await loadKbCatalog() and pass modules/sources/blocks.
  const modules = modulesForRetrieval(input.modules);
  const sources = sourcesForRetrieval(input.sources);
  const allBlocks = blocksForRetrieval(input.blocks);
  const analysis = input.analysis;

  const sourceById = new Map(sources.map((s) => [s.sourceId, s]));
  const blockById = new Map(allBlocks.map((b) => [b.blockId, b]));
  // Upload categories are expanded into the vocabulary the KB names its
  // evidence in, or EVIDENCE_ESSENTIAL below can never match anything a
  // customer is able to supply. See types/evidence.ts.
  const evidence = new Set(expandEvidenceKinds(input.evidenceTypes ?? []));

  // Fact gating is skipped only when no facts were supplied.
  const gate: GateInput | null = input.facts
    ? { facts: input.facts, pofa: analysis.pofa, evidence }
    : null;

  const routesInPlay = new Set<RouteFamily | "GOVERNANCE">([
    ...(analysis.primaryRoute ? [analysis.primaryRoute] : []),
    ...analysis.secondaryRoutes,
  ]);

  // Prohibited claims → module exclusions.
  const excludedByProhibition = new Set<string>();
  for (const claim of analysis.prohibitedClaims) {
    for (const m of PROHIBITION_BLOCKS_MODULE[claim] ?? []) {
      excludedByProhibition.add(m);
    }
  }

  const trace: RetrievalTraceEntry[] = [];
  const retained: KbModule[] = [];

  for (const m of modules) {
    // Governance modules are system rules, never drafting context.
    if (m.routeFamily === "GOVERNANCE") {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: "Governance rule — applied by the system, not retrieved for drafting.",
      });
      continue;
    }

    // 1. status
    if (m.status !== "ACTIVE") {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: `Module status is ${m.status}.`,
      });
      continue;
    }

    // 2. route
    if (!routesInPlay.has(m.routeFamily)) {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: `Route ${m.routeFamily} is not in play for this case.`,
      });
      continue;
    }

    // 3. effective dates
    if (!withinEffectiveDates(m, input.parkingEventDate)) {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: "Module effective dates do not cover the parking event date.",
      });
      continue;
    }

    // 4. source status — a non-binding source cannot support a proposition
    const nonBinding = m.sourceIds
      .map((id) => sourceById.get(id))
      .filter((s): s is LegalSource => Boolean(s))
      .filter((s) => NON_BINDING_STATUSES.includes(s.status));
    if (m.sourceIds.length > 0 && nonBinding.length === m.sourceIds.length) {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: `All supporting sources are non-binding (${nonBinding
          .map((s) => s.status)
          .join(", ")}).`,
      });
      continue;
    }

    // 5. prohibited claims
    if (excludedByProhibition.has(m.moduleId)) {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: "The claim this module would support is prohibited on these facts.",
      });
      continue;
    }

    // 6. essential evidence
    const essential = EVIDENCE_ESSENTIAL[m.moduleId];
    if (essential && !essential.some((e) => evidence.has(e))) {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: "Module requires supporting evidence that is not available.",
      });
      continue;
    }

    // 7. use_when / do_not_use_when fact gate
    if (gate && !moduleAllowed(m.moduleId, gate)) {
      trace.push({
        moduleId: m.moduleId,
        eligible: false,
        reason: "Case facts do not satisfy the module's use_when conditions.",
      });
      continue;
    }

    retained.push(m);
    trace.push({
      moduleId: m.moduleId,
      eligible: true,
      reason: `Eligible for route ${m.routeFamily}.`,
    });
  }

  // ---- Ranking: route order from the analysis, then module ID ----
  const routeRank = new Map<string, number>();
  analysis.assessments.forEach((a, i) => routeRank.set(a.route, i));
  retained.sort((a, b) => {
    const ra = routeRank.get(a.routeFamily) ?? 999;
    const rb = routeRank.get(b.routeFamily) ?? 999;
    return ra - rb || a.moduleId.localeCompare(b.moduleId);
  });

  // ---- Approved blocks: ACTIVE, owned by a retained module, and
  //      permitted by the block's own fact gate. The gate is what stops
  //      wording such as "evidence confirming payment is supplied"
  //      appearing when no evidence exists.
  const blockIds = new Set<string>();
  for (const m of retained) {
    for (const id of m.blockIds) {
      const b = blockById.get(id);
      if (!b || b.status !== "ACTIVE") continue;
      if (gate && !blockAllowed(id, gate)) continue;
      blockIds.add(id);
    }
  }
  const blocks = [...blockIds]
    .map((id) => blockById.get(id))
    .filter((b): b is DraftingBlock => Boolean(b));

  // Intro and closing blocks are always available on a keeper route.
  for (const id of ["PP-INTRO-001", "PP-INTRO-002", "PP-END-001", "PP-END-002", "PP-END-003"]) {
    const b = blockById.get(id);
    if (!b || b.status !== "ACTIVE") continue;
    if (id === "PP-INTRO-002" && analysis.driverStatus !== "UNIDENTIFIED") continue;
    if (!blocks.some((x) => x.blockId === id)) blocks.push(b);
  }

  // ---- Sources backing the retained modules ----
  const usedSourceIds = new Set<string>();
  for (const m of retained) for (const s of m.sourceIds) usedSourceIds.add(s);
  const usedSources = [...usedSourceIds]
    .map((id) => sourceById.get(id))
    .filter((s): s is LegalSource => Boolean(s));

  const output: RetrievalOutput = {
    primaryRoute: analysis.primaryRoute,
    secondaryRoutes: analysis.secondaryRoutes,
    moduleIds: retained.map((m) => m.moduleId),
    verifiedFacts: analysis.verifiedFacts.map((v) => ({
      field: v.field,
      value: v.value,
      sourceRef: v.source,
    })),
    missingFacts: analysis.missingFacts,
    evidenceRefs: analysis.evidenceRefs,
    prohibitedClaims: analysis.prohibitedClaims,
    codeVersion: analysis.codeVersion,
    pofaRoute: analysis.pofa.route,
    driverStatus: analysis.driverStatus,
  };

  return {
    output,
    modules: retained,
    blocks,
    sources: usedSources,
    trace,
    retrievalVersion: RETRIEVAL_VERSION,
  };
}
