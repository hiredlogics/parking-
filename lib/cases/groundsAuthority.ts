/**
 * Grounds Authority — Case Intelligence ground classification.
 *
 * Deterministic evaluation of structured facts against PoFA safeguards,
 * Code version resolution, and knowledge module use_when gates.
 *
 * Allegation text is a soft candidate signal only. It must never
 * independently activate appeal grounds (V1 keyword → issue path).
 *
 * Retrieval and drafting consume the classifications produced here;
 * they do not invent grounds.
 */
import type { ConfirmedPcn } from "@/types";
import type { RouteFamily } from "@/types/caseState";
import type { AnswerMap, FactSource, KnownFacts } from "@/lib/facts/types";
import { deriveKnownFacts, FACT, factNum, factStr } from "@/lib/facts/facts";
import {
  applyDocumentImplications,
  isDocumentEstablished,
} from "@/lib/facts/documentImplications";
import { analysePofa } from "@/lib/analysis/pofa";
import { resolveCodeVersion } from "@/lib/kb/seed/codeVersions";
import { moduleAllowed, type GateInput } from "@/lib/retrieval/gates";
import { classifyAllegation } from "@/lib/reasoning/allegation";
import { computeProhibitedClaims } from "@/lib/analysis/prohibited";
import type { PofaAnalysis } from "@/lib/analysis/types";
import type { KbModule } from "@/lib/kb/types";

export type GroundStatus = "possible" | "supported" | "rejected" | "unresolved";

export interface GroundRecord {
  code: string;
  routeFamily: RouteFamily;
  status: GroundStatus;
  reasons: string[];
  supportingFacts: Record<string, unknown>;
  missingFacts: string[];
  knowledgeRefs: string[];
  /** Soft signal origin — never authority by itself. */
  signal?: string;
}

export interface MissingMaterialFact {
  factKey: string;
  groundCode: string;
  reasonCode: string;
  optional: boolean;
  priority: number;
}

export interface GroundsAuthorityResult {
  facts: KnownFacts;
  evidence: string[];
  possible_grounds: GroundRecord[];
  supported_grounds: GroundRecord[];
  rejected_grounds: GroundRecord[];
  unresolved_grounds: GroundRecord[];
  applicable_rules: string[];
  code_version: string | null;
  code_version_id: string | null;
  pofa_analysis: PofaAnalysis;
  missing_material_facts: MissingMaterialFact[];
  prohibited_claims: string[];
  /** Route families CI has approved for retrieval (supported + unresolved pursued). */
  routes_in_play: RouteFamily[];
  primary_ground: string | null;
  secondary_grounds: string[];
}

const POFA_KNOWLEDGE = ["KB-POFA-01", "KB-POFA-02", "KB-POFA-05"];
const ANPR_KNOWLEDGE = ["KB-ANPR-01", "KB-ANPR-02", "KB-ANPR-03", "KB-TIME-01"];

/** Soft route candidates from allegation — signals only, not activation. */
function softAllegationRoutes(allegedBreach: string | null): {
  category: string;
  routes: RouteFamily[];
  matched: string | null;
} {
  const { category, routes, matched } = classifyAllegation(allegedBreach);
  return { category, routes: routes as RouteFamily[], matched };
}

/**
 * Document-structure candidates (not keyword activation).
 * Entry/exit/duration on a notice → camera-duration challenge is possible.
 */
function softDocumentCandidates(facts: KnownFacts): RouteFamily[] {
  const out: RouteFamily[] = [];
  const entry = factStr(facts, FACT.ENTRY_TIME);
  const exit = factStr(facts, FACT.EXIT_TIME);
  const duration = factNum(facts, FACT.TOTAL_RECORDED_DURATION);
  if ((entry && exit) || (typeof duration === "number" && duration > 0)) {
    out.push("ANPR");
  }
  return out;
}

function evaluatePofaGround(pofa: PofaAnalysis, facts: KnownFacts): GroundRecord {
  const supportingFacts: Record<string, unknown> = {
    parking_event_date: factStr(facts, FACT.PARKING_EVENT_DATE),
    notice_issue_date: factStr(facts, FACT.NOTICE_ISSUE_DATE),
    notice_route: pofa.route,
    paragraph: pofa.paragraph,
    deadline: pofa.deadline,
    notice_given_date: pofa.noticeGivenDate,
    days_late: pofa.daysLate,
    timing_status: pofa.timingStatus,
  };

  if (pofa.timingStatus === "FAILED" && pofa.applicable) {
    return {
      code: "POFA_TIMING",
      routeFamily: "POFA",
      status: "supported",
      reasons: pofa.reasons,
      supportingFacts,
      missingFacts: [...pofa.unresolved],
      knowledgeRefs: [...POFA_KNOWLEDGE],
    };
  }

  if ((pofa.confirmedContentDefects?.length ?? 0) > 0 && pofa.applicable) {
    return {
      code: "POFA_CONTENT",
      routeFamily: "POFA",
      status: "supported",
      reasons: pofa.reasons,
      supportingFacts: {
        ...supportingFacts,
        content_defects: pofa.confirmedContentDefects,
      },
      missingFacts: [...pofa.unresolved],
      knowledgeRefs: ["KB-POFA-04", "KB-POFA-05"],
    };
  }

  if (pofa.applicable && pofa.timingStatus === "UNRESOLVED") {
    return {
      code: "POFA_TIMING",
      routeFamily: "POFA",
      status: "unresolved",
      reasons: pofa.reasons.length
        ? pofa.reasons
        : ["PoFA may apply but timing cannot yet be established."],
      supportingFacts,
      missingFacts: [...pofa.unresolved],
      knowledgeRefs: [...POFA_KNOWLEDGE],
    };
  }

  return {
    code: "POFA_TIMING",
    routeFamily: "POFA",
    status: "rejected",
    reasons:
      pofa.reasons.length > 0
        ? pofa.reasons
        : ["No Schedule 4 timing or content defect is established on these facts."],
    supportingFacts,
    missingFacts: [],
    knowledgeRefs: [],
  };
}

/**
 * ANPR / duration: possible/supported only from document camera timing
 * or module use_when. Allegation text is never enough to put ANPR in
 * routes_in_play or to ask customer facts.
 */
function evaluateAnprGround(
  facts: KnownFacts,
  gate: GateInput,
  softSignal: string | null,
): GroundRecord | null {
  const entry = factStr(facts, FACT.ENTRY_TIME);
  const exit = factStr(facts, FACT.EXIT_TIME);
  const duration = factNum(facts, FACT.TOTAL_RECORDED_DURATION);
  const hasDocTiming =
    (entry !== null && exit !== null) ||
    (typeof duration === "number" && duration > 0);

  const supportingFacts: Record<string, unknown> = {
    entry_time: entry,
    exit_time: exit,
    total_recorded_duration: duration,
    alleged_breach: factStr(facts, FACT.ALLEGED_BREACH),
    anpr_images_on_notice: factStr(facts, FACT.ANPR_IMAGES_ON_NOTICE),
  };

  const moduleHits = ANPR_KNOWLEDGE.filter((id) => moduleAllowed(id, gate));
  if (moduleHits.length > 0 && hasDocTiming) {
    return {
      code: "ANPR_OVERSTAY",
      routeFamily: "ANPR",
      status: "supported",
      reasons: [
        "ANPR / duration knowledge modules are satisfied by the established document facts.",
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: moduleHits,
      signal: softSignal ?? "document_camera_timing",
    };
  }

  if (hasDocTiming) {
    const candidateMissing = [
      FACT.CONTINUOUS_PRESENCE,
      FACT.VISIT_COUNT,
      FACT.VEHICLE_LEFT_SITE_EVIDENCE,
      FACT.TIMESTAMP_DISCREPANCY,
      FACT.ANPR_DISPUTE_DETAIL,
    ].filter((k) => !facts.known.has(k) && !isDocumentEstablished(facts, k));

    return {
      code: "ANPR_OVERSTAY",
      routeFamily: "ANPR",
      status: "unresolved",
      reasons: [
        "Notice records entry/exit or duration (camera timing). Further customer facts are needed only if a double-visit or pairing challenge is pursued.",
      ],
      supportingFacts,
      missingFacts: candidateMissing,
      knowledgeRefs: [...ANPR_KNOWLEDGE],
      signal: "document_camera_timing",
    };
  }

  // Allegation soft-signal only — logged as possible, never activated.
  if (softSignal) {
    return {
      code: "ANPR_OVERSTAY",
      routeFamily: "ANPR",
      status: "possible",
      reasons: [
        `Soft allegation signal (${softSignal}) noted; not activated without document camera timing or supporting facts.`,
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: [...ANPR_KNOWLEDGE],
      signal: softSignal,
    };
  }

  return null;
}

function evaluateModuleRoute(
  route: RouteFamily,
  code: string,
  moduleIds: string[],
  facts: KnownFacts,
  gate: GateInput,
  softSignal: string | null,
): GroundRecord | null {
  if (route === "POFA" || route === "ANPR") return null; // handled above

  const hits = moduleIds.filter((id) => moduleAllowed(id, gate));
  if (hits.length > 0) {
    return {
      code,
      routeFamily: route,
      status: "supported",
      reasons: [`Knowledge modules for ${route} are satisfied.`],
      supportingFacts: {},
      missingFacts: [],
      knowledgeRefs: hits,
      signal: softSignal ?? undefined,
    };
  }

  // Soft candidate only — do not invent missing-fact questionnaires from
  // allegation keywords. Circumstance answers / tags open these later.
  if (!softSignal) return null;

  return {
    code,
    routeFamily: route,
    status: "possible",
    reasons: [
      `Soft allegation signal (${softSignal}) suggested ${route}; not activated without supporting facts.`,
    ],
    supportingFacts: {},
    missingFacts: [],
    knowledgeRefs: moduleIds,
    signal: softSignal,
  };
}

const SOFT_ROUTE_MODULES: Partial<Record<RouteFamily, { code: string; modules: string[] }>> = {
  GRACE: { code: "GRACE_PERIOD", modules: ["KB-GRACE-01", "KB-GRACE-02"] },
  CONSIDERATION: {
    code: "CONSIDERATION_PERIOD",
    modules: ["KB-CON-01", "KB-CON-02"],
  },
  PAYMENT: { code: "PAYMENT", modules: ["KB-PAY-01", "KB-PAY-02", "KB-PAY-03"] },
  KEYING: { code: "KEYING", modules: ["KB-KEY-01", "KB-KEY-02"] },
  AUTHORIZATION: {
    code: "AUTHORIZATION",
    modules: ["KB-AUTH-01", "KB-AUTH-02", "KB-AUTH-03"],
  },
  PERMIT: { code: "PERMIT", modules: ["KB-AUTH-02"] },
  BREAKDOWN: {
    code: "BREAKDOWN",
    modules: ["KB-BREAK-01", "KB-BREAK-02"],
  },
  RESIDENTIAL: {
    code: "RESIDENTIAL",
    modules: ["KB-RES-01", "KB-RES-02", "KB-RES-03"],
  },
  SIGNAGE: { code: "SIGNAGE", modules: ["KB-SIGN-01"] },
};

/**
 * Classify grounds from structured facts. Allegation is signal-only.
 */
export function classifyGrounds(input: {
  confirmed: ConfirmedPcn;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  answerProvenance?: Partial<Record<string, FactSource>>;
  knownFactsOverride?: KnownFacts;
  /** Optional catalog modules — used only for knowledgeRefs listing. */
  modules?: KbModule[];
}): GroundsAuthorityResult {
  const evidenceTypes = input.evidenceTypes ?? [];
  let facts =
    input.knownFactsOverride ??
    deriveKnownFacts({
      confirmed: input.confirmed,
      answers: input.answers ?? {},
      evidenceTypes,
      answerProvenance: input.answerProvenance,
    });
  facts = applyDocumentImplications(facts);

  const pofa = analysePofa({ facts });
  const ata = factStr(facts, FACT.OPERATOR_ATA) ?? "ALL";
  const code = resolveCodeVersion(
    factStr(facts, FACT.PARKING_EVENT_DATE),
    ata,
  );

  const evidenceSet = new Set(evidenceTypes);
  const gate: GateInput = { facts, pofa, evidence: evidenceSet };

  const allegation = softAllegationRoutes(
    factStr(facts, FACT.ALLEGED_BREACH),
  );
  const softSignal =
    allegation.matched != null
      ? `allegation:${allegation.category}:${allegation.matched}`
      : null;

  const all: GroundRecord[] = [];

  const pofaGround = evaluatePofaGround(pofa, facts);
  all.push(pofaGround);

  const docRoutes = softDocumentCandidates(facts);
  const anpr = evaluateAnprGround(facts, gate, softSignal);
  if (anpr) all.push(anpr);

  // Soft allegation routes → possible only (evaluateModuleRoute). Never activate.
  for (const route of allegation.routes) {
    const meta = SOFT_ROUTE_MODULES[route];
    if (!meta) continue;
    if (all.some((g) => g.routeFamily === route)) continue;
    const g = evaluateModuleRoute(
      route,
      meta.code,
      meta.modules,
      facts,
      gate,
      softSignal,
    );
    if (g) all.push(g);
  }

  // Also evaluate circumstance-supported routes from real tags (not allegation).
  for (const [route, meta] of Object.entries(SOFT_ROUTE_MODULES) as Array<
    [RouteFamily, { code: string; modules: string[] }]
  >) {
    if (all.some((g) => g.routeFamily === route)) continue;
    const hits = meta.modules.filter((id) => moduleAllowed(id, gate));
    if (hits.length === 0) continue;
    all.push({
      code: meta.code,
      routeFamily: route,
      status: "supported",
      reasons: [`Established facts satisfy ${route} knowledge modules.`],
      supportingFacts: {},
      missingFacts: [],
      knowledgeRefs: hits,
    });
  }

  const possible_grounds = all.filter((g) => g.status === "possible");
  const supported_grounds = all.filter((g) => g.status === "supported");
  const rejected_grounds = all.filter((g) => g.status === "rejected");
  const unresolved_grounds = all.filter((g) => g.status === "unresolved");

  // Unresolved ANPR/etc. that are only soft-possible without doc timing
  // should not force a question budget when PoFA is already supported —
  // missing facts are still listed for unresolved with document timing.
  const missing_material_facts: MissingMaterialFact[] = [];
  let priority = 40;
  for (const g of unresolved_grounds) {
    for (const factKey of g.missingFacts) {
      if (isDocumentEstablished(facts, factKey)) continue;
      if (facts.known.has(factKey)) continue;
      missing_material_facts.push({
        factKey,
        groundCode: g.code,
        reasonCode: `${g.code}_FACT_UNRESOLVED`,
        optional: supported_grounds.length > 0, // optional when a supported ground already exists
        priority: priority++,
      });
    }
  }

  const routes_in_play: RouteFamily[] = [
    ...new Set(supported_grounds.map((g) => g.routeFamily)),
  ];
  // Unresolved grounds with document basis may be pursued only when
  // nothing is yet supported (so PoFA-only cases do not open ANPR Qs).
  if (routes_in_play.length === 0) {
    for (const g of unresolved_grounds) {
      if (!routes_in_play.includes(g.routeFamily)) {
        routes_in_play.push(g.routeFamily);
      }
    }
  }

  const ordered = [
    ...supported_grounds,
    ...unresolved_grounds.filter((g) => routes_in_play.includes(g.routeFamily)),
  ];
  const primary = ordered[0] ?? null;
  const secondary = ordered.slice(1).map((g) => g.code);

  const prohibited = computeProhibitedClaims({
    facts,
    pofa,
    evidence: evidenceSet,
  });

  const applicable_rules = [
    ...(code ? [`CODE:${code.id}`] : []),
    ...(pofa.applicable ? [`POFA:para_${pofa.paragraph ?? "unknown"}`] : []),
    ...supported_grounds.flatMap((g) => g.knowledgeRefs),
  ];

  return {
    facts,
    evidence: evidenceTypes,
    possible_grounds: [
      ...possible_grounds,
      ...unresolved_grounds,
      ...supported_grounds,
    ],
    supported_grounds,
    rejected_grounds,
    unresolved_grounds,
    applicable_rules: [...new Set(applicable_rules)],
    code_version: code ? `${code.codeName} v${code.version}` : null,
    code_version_id: code?.id ?? null,
    pofa_analysis: pofa,
    missing_material_facts,
    prohibited_claims: prohibited,
    routes_in_play,
    primary_ground: primary?.code ?? null,
    secondary_grounds: secondary,
  };
}
