/**
 * Case Intelligence — the single source of truth for a case.
 *
 * Everything downstream reads this: the suitability gate, the question
 * engine and drafting. Nothing downstream should re-derive document
 * understanding or legal findings for itself.
 *
 *   DOCUMENT -> extraction -> classification -> technical analysis
 *            -> CASE INTELLIGENCE -> questions -> drafting
 *
 * Built after confirm (with no answers yet, so technical grounds are
 * found before the customer is asked anything), refreshed as answers
 * arrive, and refreshed again before drafting.
 *
 * Does NOT invent appeal wording. Does NOT add question bank entries.
 */
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap, FactSource, KnownFacts } from "@/lib/facts/types";
import { deriveKnownFacts, FACT, factStr } from "@/lib/facts/facts";
import { analyseCase } from "@/lib/analysis/engine";
import {
  assessPossibleLateNoticeFromDates,
  type PossibleLateNoticeAssessment,
} from "@/lib/analysis/pofa";
import type { IssueAnalysis, PofaAnalysis, RouteAssessment } from "@/lib/analysis/types";
import {
  isServiceNotSupported,
  type DurableDocumentUnderstanding,
} from "@/lib/cases/documentUnderstanding";
import type { DetectedCaseStage, DocumentKind } from "@/types/triage";
import {
  classifyGrounds,
  type GroundRecord,
} from "@/lib/cases/groundsAuthority";
import { applyDocumentImplications } from "@/lib/facts/documentImplications";
import type { RouteFamily } from "@/types/caseState";

export const CASE_INTELLIGENCE_VERSION = "case-intelligence-v3";

/**
 * What the document is, who sent it, and what it concerns.
 *
 * `sender` and `operator` are deliberately separate: a Debt Recovery
 * Plus letter is SENT by DRP but concerns the original parking
 * operator's charge. Conflating the two is what put a debt collector in
 * the operator field and made an unappealable letter look appealable.
 */
export interface DocumentUnderstanding {
  documentType: DocumentKind | null;
  sender: string | null;
  operator: string | null;
  stage: DetectedCaseStage | null;
  noticeRoute: string | null;
}

/** Whether the selected service can actually act on this document. */
export type SuitabilityDecision =
  | "SUPPORTED"
  | "NOT_SUPPORTED"
  | "MANUAL_REVIEW";

export interface Suitability {
  decision: SuitabilityDecision;
  reasonCode: string | null;
  detail: string | null;
}

/**
 * A ground the deterministic analysis established from the document
 * itself, before the customer said anything.
 */
export interface TechnicalFinding {
  /** Stable ground code, e.g. POFA_TIMING_FAILURE. */
  ground: string;
  status: "IDENTIFIED" | "EXCLUDED";
  /** possible = from dates alone; established = full statutory checklist. */
  confidence: "possible" | "established";
  evidence: Record<string, unknown>;
  knowledgeRefs: string[];
  missingFacts: string[];
  reasons: string[];
}

export interface IdentifiedIssue {
  code: string;
  label: string;
  confidence: "possible" | "established";
  supportingFacts: Record<string, unknown>;
  missingFacts: string[];
  knowledgeRefs: string[];
  reasons: string[];
}

export interface CaseIntelligence {
  version: string;
  assessedAt: string;
  documentUnderstanding: DocumentUnderstanding | null;
  /** Everything derivable right now: notice + answers + evidence. */
  facts: Record<string, unknown>;
  /** Only what was confirmed on the notice itself. */
  confirmedFacts: Record<string, unknown>;
  /** Evidence type inventory available on the case. */
  evidence: string[];
  identifiedIssues: IdentifiedIssue[];
  technicalFindings: TechnicalFinding[];
  suitability: Suitability;
  warnings: string[];
  /** Date-first timing screen — runs before any keeper answer exists. */
  dateTiming: PossibleLateNoticeAssessment | null;
  /** Full PoFA checklist when the facts allow; else partial. */
  pofa: PofaAnalysis | null;
  /** Alias used by authority consumers — same as pofa. */
  pofa_analysis: PofaAnalysis | null;
  /** Union of clarification facts still needed across identified issues. */
  missingFacts: string[];
  /** Material facts still needed — authority for Adaptive Questions. */
  missing_material_facts: Array<{
    factKey: string;
    groundCode: string;
    reasonCode: string;
    optional: boolean;
    priority: number;
  }>;
  knowledgeRefs: string[];
  possible_grounds: GroundRecord[];
  supported_grounds: GroundRecord[];
  rejected_grounds: GroundRecord[];
  unresolved_grounds: GroundRecord[];
  applicable_rules: string[];
  code_version: string | null;
  prohibited_claims: string[];
  /** Full issue analysis snapshot, reused by drafting / validators. */
  analysis: IssueAnalysis | null;
  analysisVersion: string;
}

/*
 * Local label rather than an import: several suites mock
 * "@/lib/analysis/engine" to control analyseCase, and importing a
 * constant from a mocked module makes every one of them fail on a
 * missing export.
 */
const ANALYSIS_VERSION_LABEL = "analysis-v1";

const POFA_TIMING_KNOWLEDGE = ["KB-POFA-02", "KB-POFA-03", "PP-POFA-003"];

/**
 * Map a triage service decision onto the one authority the gates read.
 *
 * An absent decision means "not classified", which must not block a
 * customer — the parallel checks this replaces behaved the same way.
 */
export function suitabilityFromUnderstanding(
  understanding: DurableDocumentUnderstanding | null | undefined,
  detail?: string | null,
): Suitability {
  const decision = understanding?.serviceDecision ?? null;
  if (isServiceNotSupported(decision)) {
    return {
      decision: "NOT_SUPPORTED",
      reasonCode: decision ?? "NOT_SUPPORTED",
      detail: detail ?? null,
    };
  }
  if (decision === "MANUAL_REVIEW") {
    return {
      decision: "MANUAL_REVIEW",
      reasonCode: decision,
      detail: detail ?? null,
    };
  }
  return { decision: "SUPPORTED", reasonCode: decision, detail: null };
}

function confirmedFactsOf(confirmed: ConfirmedPcn): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(
    confirmed as unknown as Record<string, unknown>,
  )) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}

export function buildCaseIntelligence(input: {
  confirmed: ConfirmedPcn;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  documentUnderstanding?: DurableDocumentUnderstanding | null;
  suitabilityDetail?: string | null;
  /** See AnalysisInput.answerProvenance — threaded through to analyseCase. */
  answerProvenance?: Partial<Record<string, FactSource>>;
  /** Pre-computed facts (e.g. after document implications). */
  knownFactsOverride?: KnownFacts;
}): CaseIntelligence {
  const answers = input.answers ?? {};
  const evidenceTypes = input.evidenceTypes ?? [];
  const baseFacts =
    input.knownFactsOverride ??
    deriveKnownFacts({
      confirmed: input.confirmed,
      answers,
      evidenceTypes,
      answerProvenance: input.answerProvenance,
    });
  const facts = applyDocumentImplications(baseFacts);

  const grounds = classifyGrounds({
    confirmed: input.confirmed,
    answers,
    evidenceTypes,
    answerProvenance: input.answerProvenance,
    knownFactsOverride: facts,
  });

  const flatFacts: Record<string, unknown> = { ...grounds.facts.values };
  const warnings: string[] = [];

  const durable = input.documentUnderstanding ?? null;
  const documentUnderstanding: DocumentUnderstanding = {
    documentType: durable?.documentType ?? null,
    sender: durable?.senderName ?? null,
    operator:
      durable?.parkingOperatorName ?? input.confirmed.operator_name ?? null,
    stage: durable?.caseStage ?? null,
    noticeRoute: input.confirmed.notice_route ?? null,
  };

  if (
    documentUnderstanding.sender &&
    documentUnderstanding.operator &&
    documentUnderstanding.sender !== documentUnderstanding.operator
  ) {
    warnings.push(
      `Document sent by ${documentUnderstanding.sender}; the parking operator is ${documentUnderstanding.operator}.`,
    );
  }

  const suitability = suitabilityFromUnderstanding(
    durable,
    input.suitabilityDetail ?? null,
  );
  if (suitability.decision === "NOT_SUPPORTED") {
    warnings.push(
      "This document is not suitable for the standard private parking appeal service.",
    );
  }

  const dateTiming = assessPossibleLateNoticeFromDates({
    parkingEventDate: input.confirmed.parking_event_date,
    noticeIssueDate: input.confirmed.notice_issue_date,
    noticeRoute: input.confirmed.notice_route,
  });

  if (
    !documentUnderstanding.noticeRoute ||
    documentUnderstanding.noticeRoute === "UNKNOWN"
  ) {
    warnings.push(
      "The method of service is not established on the notice; timing has been assessed on the recorded dates alone.",
    );
  }

  const identifiedIssues: IdentifiedIssue[] = [];
  const technicalFindings: TechnicalFinding[] = [];
  const knowledgeRefs = new Set<string>();

  const pofa = grounds.pofa_analysis;
  const pofaEstablished = pofa.timingStatus === "FAILED" && pofa.applicable;

  if (pofaEstablished || dateTiming.possible) {
    const confidence: "possible" | "established" = pofaEstablished
      ? "established"
      : "possible";
    const source = pofaEstablished ? pofa : dateTiming;
    const factsStillNeeded = pofaEstablished
      ? pofa.unresolved
      : dateTiming.missingFacts;
    const evidence: Record<string, unknown> = {
      eventDate: factStr(grounds.facts, FACT.PARKING_EVENT_DATE),
      noticeDate: factStr(grounds.facts, FACT.NOTICE_ISSUE_DATE),
      noticeRoute: documentUnderstanding.noticeRoute,
      paragraph: source.paragraph,
      deadline: source.deadline,
      noticeGivenDate: source.noticeGivenDate,
      daysLate: source.daysLate,
      confidence,
      deliveryAssumption: "deemed_2nd_working_day_after_issue",
    };

    technicalFindings.push({
      ground: "POFA_TIMING_FAILURE",
      status: "IDENTIFIED",
      confidence,
      evidence,
      knowledgeRefs: POFA_TIMING_KNOWLEDGE,
      missingFacts: factsStillNeeded,
      reasons: source.reasons,
    });

    const supportingFacts: Record<string, unknown> = {
      parking_event_date: factStr(grounds.facts, FACT.PARKING_EVENT_DATE),
      notice_issue_date: factStr(grounds.facts, FACT.NOTICE_ISSUE_DATE),
      notice_route: documentUnderstanding.noticeRoute,
      paragraph: source.paragraph,
      deadline: source.deadline,
      notice_given_date: source.noticeGivenDate,
      days_late: source.daysLate,
      delivery_assumption: "deemed_2nd_working_day_after_issue",
    };

    identifiedIssues.push({
      code: "possible_late_notice",
      label: pofaEstablished
        ? "Late Notice to Keeper (timing failure established)"
        : "Possible late Notice to Keeper",
      confidence,
      supportingFacts,
      missingFacts: factsStillNeeded,
      knowledgeRefs: POFA_TIMING_KNOWLEDGE,
      reasons: source.reasons,
    });

    for (const k of POFA_TIMING_KNOWLEDGE) knowledgeRefs.add(k);
  }

  for (const g of grounds.supported_grounds) {
    for (const k of g.knowledgeRefs) knowledgeRefs.add(k);
  }

  /*
   * Legacy IssueAnalysis snapshot for validators / retrieval.
   * Routes come from Case Intelligence grounds authority — not from
   * allegation keyword activation.
   */
  let analysis: IssueAnalysis | null = null;
  try {
    const base = analyseCase({
      confirmed: input.confirmed,
      answers,
      evidenceTypes,
      answerProvenance: input.answerProvenance,
    });
    const assessments: RouteAssessment[] = grounds.supported_grounds.map(
      (g, i) => ({
        route: g.routeFamily,
        rank: 10 + i,
        basis: g.reasons,
        moduleIds: g.knowledgeRefs,
        evidenceBacked: true,
      }),
    );
    // Include unresolved routes only when nothing is supported yet.
    if (assessments.length === 0) {
      for (const g of grounds.unresolved_grounds) {
        assessments.push({
          route: g.routeFamily,
          rank: 50,
          basis: g.reasons,
          moduleIds: g.knowledgeRefs,
          evidenceBacked: false,
        });
      }
    }
    const primaryRoute =
      (grounds.routes_in_play[0] as RouteFamily | undefined) ??
      assessments[0]?.route ??
      null;
    const secondaryRoutes = grounds.routes_in_play.filter(
      (r) => r !== primaryRoute,
    );
    analysis = {
      ...base,
      primaryRoute,
      secondaryRoutes,
      assessments:
        assessments.length > 0 ? assessments : base.assessments,
      pofa: grounds.pofa_analysis,
      codeVersion: grounds.code_version,
      codeVersionId: grounds.code_version_id,
      prohibitedClaims: grounds.prohibited_claims,
      missingFacts: grounds.missing_material_facts.map((m) => m.factKey),
      manualReview:
        primaryRoute == null
          ? {
              reason: "NO_SUPPORTED_ROUTE",
              detail:
                "No appeal route is supported by the confirmed facts. A person should review this case rather than the system generating an unsupported appeal.",
            }
          : null,
    };
  } catch (err) {
    analysis = null;
    warnings.push(
      `Issue analysis could not be completed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  return {
    version: CASE_INTELLIGENCE_VERSION,
    assessedAt: new Date().toISOString(),
    documentUnderstanding,
    facts: flatFacts,
    confirmedFacts: confirmedFactsOf(input.confirmed),
    evidence: evidenceTypes,
    identifiedIssues,
    technicalFindings,
    suitability,
    warnings,
    dateTiming,
    pofa,
    pofa_analysis: pofa,
    missingFacts: grounds.missing_material_facts.map((m) => m.factKey),
    missing_material_facts: grounds.missing_material_facts,
    knowledgeRefs: [...knowledgeRefs].sort(),
    possible_grounds: grounds.possible_grounds,
    supported_grounds: grounds.supported_grounds,
    rejected_grounds: grounds.rejected_grounds,
    unresolved_grounds: grounds.unresolved_grounds,
    applicable_rules: grounds.applicable_rules,
    code_version: grounds.code_version,
    prohibited_claims: grounds.prohibited_claims,
    analysis,
    analysisVersion: ANALYSIS_VERSION_LABEL,
  };
}

/** True when intelligence already flagged an issue by code. */
export function hasIdentifiedIssue(
  intelligence: CaseIntelligence | null | undefined,
  code: string,
): boolean {
  return Boolean(intelligence?.identifiedIssues.some((i) => i.code === code));
}

/** True when a technical ground was established from the document. */
export function hasTechnicalFinding(
  intelligence: CaseIntelligence | null | undefined,
  ground: string,
): boolean {
  return Boolean(
    intelligence?.technicalFindings.some(
      (f) => f.ground === ground && f.status === "IDENTIFIED",
    ),
  );
}

/** Everything the suitability authority is allowed to look at. */
export interface SuitabilitySource {
  caseIntelligence?: CaseIntelligence | null;
  serviceDecision?: string | null;
  triageServiceDecision?: string | null;
  triageDetail?: string | null;
  outOfScopeDetail?: string | null;
}

/**
 * The single suitability authority.
 *
 * Case Intelligence is the source of truth, and for any case assessed
 * since it was introduced its `suitability` already reflects the
 * durable triage decision. The other inputs remain readable for two
 * reasons: cases assessed before Case Intelligence was persisted have
 * none, and a persisted record can be older than a re-run triage.
 *
 * NOT_SUPPORTED from any source wins. Declining to appeal a document we
 * cannot act on is the safe direction — the failure we are fixing is a
 * debt-recovery letter being carried all the way to a generated appeal.
 */
export function resolveSuitability(src: SuitabilitySource): Suitability {
  const fromIntelligence = src.caseIntelligence?.suitability ?? null;

  const notSupported =
    fromIntelligence?.decision === "NOT_SUPPORTED" ||
    isServiceNotSupported(src.serviceDecision ?? null) ||
    isServiceNotSupported(src.triageServiceDecision ?? null);

  if (notSupported) {
    return {
      decision: "NOT_SUPPORTED",
      reasonCode:
        fromIntelligence?.reasonCode ??
        src.serviceDecision ??
        src.triageServiceDecision ??
        "NOT_SUPPORTED",
      detail:
        fromIntelligence?.detail ??
        src.outOfScopeDetail ??
        src.triageDetail ??
        null,
    };
  }

  if (
    fromIntelligence?.decision === "MANUAL_REVIEW" ||
    src.serviceDecision === "MANUAL_REVIEW" ||
    src.triageServiceDecision === "MANUAL_REVIEW"
  ) {
    return {
      decision: "MANUAL_REVIEW",
      reasonCode: "MANUAL_REVIEW",
      detail: fromIntelligence?.detail ?? src.triageDetail ?? null,
    };
  }

  return {
    decision: "SUPPORTED",
    reasonCode: fromIntelligence?.reasonCode ?? src.serviceDecision ?? null,
    detail: null,
  };
}

/** Convenience wrapper: may this case proceed through the journey? */
export function isSuitableForService(src: SuitabilitySource): boolean {
  return resolveSuitability(src).decision !== "NOT_SUPPORTED";
}
