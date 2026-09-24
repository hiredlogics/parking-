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
import {
  classifyAllegation,
  factsImpliedByAllegation,
  type AllegationCategory,
} from "@/lib/reasoning/allegation";
import { computeProhibitedClaims } from "@/lib/analysis/prohibited";
import type { PofaAnalysis } from "@/lib/analysis/types";
import type { KbModule } from "@/lib/kb/types";

/** Allegations whose substantive case is duration / camera pairing. */
const DURATION_ALLEGATION: ReadonlySet<AllegationCategory> = new Set([
  "OVERSTAY",
  "ANPR_DURATION",
]);

/** Allegations that turn on permit / authorisation — not readable from the notice alone. */
const PERMIT_ALLEGATION: ReadonlySet<AllegationCategory> = new Set([
  "NO_PERMIT",
  "UNAUTHORISED",
]);

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

/** Allegations that turn on payment / kiosk validation. */
const PAYMENT_ALLEGATION: ReadonlySet<AllegationCategory> = new Set([
  "NO_PAYMENT",
  "NO_VALIDATION",
]);

/**
 * Payment / kiosk-validation — the notice alleges non-payment or failure
 * to validate; the document cannot say whether the customer paid or
 * validated. Ask; then support or reject from the answer.
 */
function evaluatePaymentGround(
  facts: KnownFacts,
  gate: GateInput,
  softSignal: string | null,
  allegationCategory: AllegationCategory,
): GroundRecord {
  const made = factStr(facts, FACT.PAYMENT_MADE);
  const method = factStr(facts, FACT.PAYMENT_METHOD);
  const moduleIds = ["KB-PAY-01", "KB-PAY-02", "KB-PAY-03"];
  const supportingFacts: Record<string, unknown> = {
    alleged_breach: factStr(facts, FACT.ALLEGED_BREACH),
    payment_made: made,
    payment_method: method,
  };

  const missingFacts: string[] = [];
  if (made == null && !facts.known.has(FACT.PAYMENT_MADE)) {
    missingFacts.push(FACT.PAYMENT_MADE);
  }
  if (
    (made === "YES" || made === "ATTEMPTED_FAILED") &&
    method == null &&
    !facts.known.has(FACT.PAYMENT_METHOD)
  ) {
    missingFacts.push(FACT.PAYMENT_METHOD);
  }

  const hits = moduleIds.filter((id) => moduleAllowed(id, gate));
  const label =
    allegationCategory === "NO_VALIDATION"
      ? "voucher/kiosk validation"
      : "payment";

  if (
    (made === "YES" || made === "ATTEMPTED_FAILED") &&
    missingFacts.length === 0
  ) {
    return {
      code: "PAYMENT",
      routeFamily: "PAYMENT",
      status: "supported",
      reasons: [
        hits.length > 0
          ? `Customer answers establish a ${label} position; payment knowledge modules are satisfied.`
          : `Customer answers establish a ${label} position relevant to the alleged breach.`,
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: hits.length > 0 ? hits : moduleIds,
      signal: softSignal ?? undefined,
    };
  }

  if (made === "YES" || made === "ATTEMPTED_FAILED") {
    return {
      code: "PAYMENT",
      routeFamily: "PAYMENT",
      status: "unresolved",
      reasons: [
        `Payment/${label} was indicated; the method is still needed to select the correct ground.`,
      ],
      supportingFacts,
      missingFacts,
      knowledgeRefs: moduleIds,
      signal: softSignal ?? undefined,
    };
  }

  if (made === "NO") {
    return {
      code: "PAYMENT",
      routeFamily: "PAYMENT",
      status: "rejected",
      reasons: [
        `Customer confirms no ${label} occurred; a payment-made ground is not pursued.`,
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: [],
      signal: softSignal ?? undefined,
    };
  }

  return {
    code: "PAYMENT",
    routeFamily: "PAYMENT",
    status: "unresolved",
    reasons: [
      allegationCategory === "NO_VALIDATION"
        ? "Notice alleges voucher/receipt was not validated at the kiosk; whether a validation or payment was made cannot be determined from the document alone."
        : "Notice alleges non-payment; whether a payment was made or attempted cannot be determined from the document alone.",
    ],
    supportingFacts,
    missingFacts:
      missingFacts.length > 0
        ? missingFacts
        : factsImpliedByAllegation(allegationCategory),
    knowledgeRefs: moduleIds,
    signal: softSignal ?? undefined,
  };
}
function softAllegationRoutes(allegedBreach: string | null): {
  category: AllegationCategory;
  routes: RouteFamily[];
  matched: string | null;
} {
  const { category, routes, matched } = classifyAllegation(allegedBreach);
  return { category, routes: routes as RouteFamily[], matched };
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
 * ANPR grounds — two distinct classifications:
 *
 *   ANPR_OVERSTAY  — alleged breach is duration (OVERSTAY / ANPR_DURATION).
 *   ANPR_EVIDENCE  — ANPR is the detection method for a non-duration
 *                    allegation (e.g. No Permit). Entry/exit do not by
 *                    themselves prove the vehicle was parked in the
 *                    circumstances the operator alleges. Ask what happened
 *                    during the recorded period; assert multi-visit /
 *                    pairing only when the customer supports it.
 */
function evaluateAnprGround(
  facts: KnownFacts,
  gate: GateInput,
  softSignal: string | null,
  allegationCategory: AllegationCategory,
): GroundRecord | null {
  const entry = factStr(facts, FACT.ENTRY_TIME);
  const exit = factStr(facts, FACT.EXIT_TIME);
  const duration = factNum(facts, FACT.TOTAL_RECORDED_DURATION);
  const hasDocTiming =
    (entry !== null && exit !== null) ||
    (typeof duration === "number" && duration > 0);

  const presence = factStr(facts, FACT.CONTINUOUS_PRESENCE);
  const visitCount = factNum(facts, FACT.VISIT_COUNT);

  const supportingFacts: Record<string, unknown> = {
    entry_time: entry,
    exit_time: exit,
    total_recorded_duration: duration,
    alleged_breach: factStr(facts, FACT.ALLEGED_BREACH),
    anpr_images_on_notice: factStr(facts, FACT.ANPR_IMAGES_ON_NOTICE),
    continuous_presence: presence,
    visit_count: visitCount,
  };

  /* ---------- Duration allegation → ANPR_OVERSTAY ---------- */
  if (DURATION_ALLEGATION.has(allegationCategory)) {
    const moduleHits = ANPR_KNOWLEDGE.filter((id) => moduleAllowed(id, gate));
    if (moduleHits.length > 0 && hasDocTiming) {
      return {
        code: "ANPR_OVERSTAY",
        routeFamily: "ANPR",
        status: "supported",
        reasons: [
          "Duration allegation with document camera timing; ANPR / duration knowledge modules are satisfied.",
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
          "Duration allegation with notice entry/exit or duration. Further customer facts are needed only if a double-visit or pairing challenge is pursued.",
        ],
        supportingFacts,
        missingFacts: candidateMissing,
        knowledgeRefs: [...ANPR_KNOWLEDGE],
        signal: "document_camera_timing",
      };
    }

    if (softSignal) {
      return {
        code: "ANPR_OVERSTAY",
        routeFamily: "ANPR",
        status: "possible",
        reasons: [
          `Soft allegation signal (${softSignal}) noted; not activated without document camera timing.`,
        ],
        supportingFacts,
        missingFacts: [],
        knowledgeRefs: [...ANPR_KNOWLEDGE],
        signal: softSignal,
      };
    }
    return null;
  }

  /* ---------- Non-duration + ANPR timestamps → ANPR_EVIDENCE ---------- */
  if (!hasDocTiming) return null;

  const pairingSupported =
    presence === "NO" ||
    (typeof visitCount === "number" && visitCount > 1) ||
    facts.tags.has("multiple_visits_same_day") ||
    facts.tags.has("anpr_disputed");

  const evidenceMissing: string[] = [];
  if (
    presence == null &&
    !facts.known.has(FACT.CONTINUOUS_PRESENCE) &&
    !isDocumentEstablished(facts, FACT.CONTINUOUS_PRESENCE)
  ) {
    evidenceMissing.push(FACT.CONTINUOUS_PRESENCE);
  }
  if (
    presence === "NO" &&
    visitCount == null &&
    !facts.known.has(FACT.VISIT_COUNT)
  ) {
    evidenceMissing.push(FACT.VISIT_COUNT);
  }

  const moduleHits = ANPR_KNOWLEDGE.filter((id) => moduleAllowed(id, gate));

  if (pairingSupported && evidenceMissing.length === 0) {
    return {
      code: "ANPR_EVIDENCE",
      routeFamily: "ANPR",
      status: "supported",
      reasons: [
        `ANPR is the evidence mechanism for a ${allegationCategory} allegation. Customer answers support that the entry/exit pair does not establish a single continuous parking event as alleged.`,
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: moduleHits.length > 0 ? moduleHits : ["KB-ANPR-01", "KB-TIME-01"],
      signal: softSignal ?? "anpr_evidence_mechanism",
    };
  }

  if (presence === "YES") {
    return {
      code: "ANPR_EVIDENCE",
      routeFamily: "ANPR",
      status: "possible",
      reasons: [
        "Customer confirms continuous presence; a separate-visits / pairing challenge is not pursued. ANPR remains the detection method and does not by itself prove the alleged permit breach.",
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: ["KB-TIME-01"],
      signal: softSignal ?? "anpr_evidence_mechanism",
    };
  }

  return {
    code: "ANPR_EVIDENCE",
    routeFamily: "ANPR",
    status: "unresolved",
    reasons: [
      `Alleged breach is ${allegationCategory.replace(/_/g, " ").toLowerCase()}; ANPR entry/exit is the evidence mechanism. Whether those captures establish the alleged parking event (including separate visits, pick-up/drop-off, or other circumstances) cannot be determined from the notice alone.`,
    ],
    supportingFacts,
    missingFacts: evidenceMissing,
    knowledgeRefs: [...ANPR_KNOWLEDGE],
    signal: softSignal ?? "anpr_evidence_mechanism",
  };
}

/**
 * Permit / authorisation — document alleges the breach; the notice
 * cannot say whether a permit or entitlement existed. Those facts must
 * be asked; CI then supports or rejects the ground from the answer.
 */
function evaluatePermitAuthGround(
  route: "PERMIT" | "AUTHORIZATION",
  code: string,
  moduleIds: string[],
  facts: KnownFacts,
  gate: GateInput,
  softSignal: string | null,
  allegationCategory: AllegationCategory,
): GroundRecord {
  const held = factStr(facts, FACT.PERMISSION_HELD);
  const source = factStr(facts, FACT.PERMISSION_SOURCE);
  const supportingFacts: Record<string, unknown> = {
    alleged_breach: factStr(facts, FACT.ALLEGED_BREACH),
    permission_held: held,
    permission_source: source,
  };

  const missingFacts: string[] = [];
  if (
    held == null &&
    !isDocumentEstablished(facts, FACT.PERMISSION_HELD) &&
    !facts.known.has(FACT.PERMISSION_HELD)
  ) {
    missingFacts.push(FACT.PERMISSION_HELD);
  }
  if (
    held === "YES" &&
    source == null &&
    !facts.known.has(FACT.PERMISSION_SOURCE)
  ) {
    missingFacts.push(FACT.PERMISSION_SOURCE);
  }

  const hits = moduleIds.filter((id) => moduleAllowed(id, gate));

  if (held === "YES" && missingFacts.length === 0) {
    return {
      code,
      routeFamily: route,
      status: "supported",
      reasons: [
        hits.length > 0
          ? `Customer confirms permit/authorisation was held; ${route} knowledge modules are satisfied.`
          : "Customer confirms a permit or parking authorisation was held for this location.",
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: hits.length > 0 ? hits : moduleIds,
      signal: softSignal ?? undefined,
    };
  }

  if (held === "YES" && missingFacts.length > 0) {
    return {
      code,
      routeFamily: route,
      status: "unresolved",
      reasons: [
        "Permit/authorisation was indicated; the source of that entitlement is still needed.",
      ],
      supportingFacts,
      missingFacts,
      knowledgeRefs: moduleIds,
      signal: softSignal ?? undefined,
    };
  }

  if (held === "NO") {
    return {
      code,
      routeFamily: route,
      status: "rejected",
      reasons: [
        "Customer confirms no permit or parking authorisation was held; this ground is not pursued.",
      ],
      supportingFacts,
      missingFacts: [],
      knowledgeRefs: [],
      signal: softSignal ?? undefined,
    };
  }

  // UNSURE / unknown — factual gap the document cannot close.
  return {
    code,
    routeFamily: route,
    status: "unresolved",
    reasons: [
      `Notice alleges ${allegationCategory.replace(/_/g, " ").toLowerCase()}; whether a permit, parking entitlement or other authorisation existed cannot be determined from the document alone.`,
    ],
    supportingFacts,
    missingFacts:
      missingFacts.length > 0
        ? missingFacts
        : [FACT.PERMISSION_HELD, ...factsImpliedByAllegation(allegationCategory)].filter(
            (k, i, arr) => arr.indexOf(k) === i,
          ),
    knowledgeRefs: moduleIds,
    signal: softSignal ?? undefined,
  };
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
  const allegationCategory = allegation.category as AllegationCategory;
  const softSignal =
    allegation.matched != null
      ? `allegation:${allegation.category}:${allegation.matched}`
      : null;

  const all: GroundRecord[] = [];

  const pofaGround = evaluatePofaGround(pofa, facts);
  all.push(pofaGround);

  const anpr = evaluateAnprGround(
    facts,
    gate,
    softSignal,
    allegationCategory,
  );
  if (anpr) all.push(anpr);

  /*
   * Permit / authorisation: allegation makes the factual gap material.
   * Prefer a single primary route (PERMIT for no-permit; AUTHORIZATION
   * for unauthorised) so we do not ask permission_held twice.
   */
  if (PERMIT_ALLEGATION.has(allegationCategory)) {
    const primaryRoute: "PERMIT" | "AUTHORIZATION" =
      allegationCategory === "NO_PERMIT" ? "PERMIT" : "AUTHORIZATION";
    const meta = SOFT_ROUTE_MODULES[primaryRoute]!;
    all.push(
      evaluatePermitAuthGround(
        primaryRoute,
        meta.code,
        meta.modules,
        facts,
        gate,
        softSignal,
        allegationCategory,
      ),
    );
  }

  if (PAYMENT_ALLEGATION.has(allegationCategory)) {
    all.push(
      evaluatePaymentGround(facts, gate, softSignal, allegationCategory),
    );
  }

  // Soft allegation routes → possible only (evaluateModuleRoute). Never activate.
  // Skip routes already handled as allegation-material above.
  for (const route of allegation.routes) {
    if (
      PERMIT_ALLEGATION.has(allegationCategory) &&
      (route === "PERMIT" || route === "AUTHORIZATION")
    ) {
      continue;
    }
    if (PAYMENT_ALLEGATION.has(allegationCategory) && route === "PAYMENT") {
      continue;
    }
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

  const rankGround = (g: GroundRecord): number => {
    if (g.routeFamily === "POFA") return 0;
    if (
      g.routeFamily === "PERMIT" ||
      g.routeFamily === "AUTHORIZATION" ||
      g.routeFamily === "PAYMENT" ||
      g.routeFamily === "KEYING"
    ) {
      return 1;
    }
    if (g.code === "ANPR_EVIDENCE") return 2;
    if (g.code === "ANPR_OVERSTAY") return 3;
    return 4;
  };

  const possible_grounds = all.filter((g) => g.status === "possible");
  const supported_grounds = all
    .filter((g) => g.status === "supported")
    .sort((a, b) => rankGround(a) - rankGround(b));
  const rejected_grounds = all.filter((g) => g.status === "rejected");
  const unresolved_grounds = all
    .filter((g) => g.status === "unresolved")
    .sort((a, b) => rankGround(a) - rankGround(b));

  /*
   * Missing material facts from unresolved grounds.
   * - Permit/auth allegation gaps: required, high priority.
   * - ANPR_EVIDENCE circumstance gaps: required but lower priority
   *   (asked after permit); never classified as overstay.
   * - ANPR_OVERSTAY soft follow-ups: optional when another ground is supported.
   */
  const missing_material_facts: MissingMaterialFact[] = [];
  const seenFact = new Set<string>();
  let priority = 20;
  for (const g of unresolved_grounds) {
    const allegationMaterial =
      g.routeFamily === "PERMIT" ||
      g.routeFamily === "AUTHORIZATION" ||
      g.routeFamily === "PAYMENT" ||
      g.routeFamily === "KEYING";
    const anprEvidence = g.code === "ANPR_EVIDENCE";
    for (const factKey of g.missingFacts) {
      if (seenFact.has(factKey)) continue;
      if (isDocumentEstablished(facts, factKey)) continue;
      if (facts.known.has(factKey)) continue;
      seenFact.add(factKey);
      missing_material_facts.push({
        factKey,
        groundCode: g.code,
        reasonCode: `${g.code}_FACT_UNRESOLVED`,
        optional:
          allegationMaterial || anprEvidence
            ? false
            : supported_grounds.length > 0,
        priority: allegationMaterial
          ? priority++
          : anprEvidence
            ? 30 + priority++
            : 50 + priority++,
      });
    }
  }
  missing_material_facts.sort((a, b) => a.priority - b.priority);

  const routes_in_play: RouteFamily[] = [
    ...new Set(supported_grounds.map((g) => g.routeFamily)),
  ];
  // Allegation-material and ANPR_EVIDENCE unresolved stay in play.
  for (const g of unresolved_grounds) {
    const keep =
      g.routeFamily === "PERMIT" ||
      g.routeFamily === "AUTHORIZATION" ||
      g.routeFamily === "PAYMENT" ||
      g.routeFamily === "KEYING" ||
      g.code === "ANPR_EVIDENCE";
    if (keep && !routes_in_play.includes(g.routeFamily)) {
      routes_in_play.push(g.routeFamily);
    }
  }
  if (supported_grounds.length === 0) {
    for (const g of unresolved_grounds) {
      if (!routes_in_play.includes(g.routeFamily)) {
        routes_in_play.push(g.routeFamily);
      }
    }
  }

  // Prefer allegation grounds (even unresolved) before ANPR evidential grounds.
  const ordered = [
    ...supported_grounds,
    ...unresolved_grounds.filter((g) => routes_in_play.includes(g.routeFamily)),
  ].sort((a, b) => rankGround(a) - rankGround(b));
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
