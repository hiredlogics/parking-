import type { ConfirmedPcn } from "@/types";
import type {
  CaseOutcomeStatus,
  DriverStatus,
  NoticeRoute,
  OperatorAta,
  RouteFamily,
} from "@/types/caseState";
import type { AnswerMap, AnswerValue, KnownFacts } from "@/lib/facts/types";
import { deriveKnownFacts, FACT, factStr } from "@/lib/facts/facts";
import { askedFactKey, missingRequirements } from "@/lib/facts/missing";
import type { FactRequirement } from "@/lib/facts/requirements";
import { detectOutOfScope, type ScopeDecision } from "@/lib/facts/scope";
import { resolveCodeVersion } from "@/lib/kb/seed/codeVersions";
import { analysePofa } from "@/lib/analysis/pofa";
import { computeProhibitedClaims } from "@/lib/analysis/prohibited";
import type { PofaAnalysis } from "@/lib/analysis/types";
import {
  deriveFactsFromEvidence,
  establishedFacts,
  factsNeedingConfirmation,
  type DerivedFact,
} from "@/lib/facts/fromEvidence";
import { assessCandidacy, type RouteCandidacy } from "./routeCandidacy";
import type { AppealCase, CaseDocument, ServiceType } from "@/lib/cases/types";

/**
 * Canonical case reasoning context.
 *
 * ONE structured view of a case, and the only thing handed to an AI
 * service. Previously four overlapping shapes existed — KnownFacts,
 * IssueAnalysis, GenerationContext, DraftingContext — each rebuilding
 * part of the picture, which is how the allegation and the evidence
 * ended up influencing nothing.
 *
 * Two rules this type exists to enforce:
 *   - no raw database record is ever sent to a model;
 *   - no chain-of-thought is produced or stored. Only structured
 *     decisions and their provenance.
 */

export interface EvidenceRef {
  id: string;
  type: string;
  fileName: string;
  uploadedAt: string;
}

export interface AskedQuestionRef {
  targetFact: string;
  label: string;
  reasonCode: string;
  route: string;
  answered: boolean;
  answer: unknown;
}

export interface CaseReasoningContext {
  /* ---------- Identity and stage ---------- */
  caseId: string;
  publicId: string;
  serviceType: ServiceType;
  stageNumber: number;
  parentCaseId: string | null;
  jurisdiction: string | null;

  /* ---------- Raw inputs ---------- */
  extractedFacts: Record<string, unknown>;
  confirmedFacts: ConfirmedPcn | null;
  answers: AnswerMap;
  evidence: EvidenceRef[];

  /* ---------- Notice characteristics ---------- */
  allegedBreach: string | null;
  noticeRoute: NoticeRoute;
  operator: string | null;
  operatorAta: OperatorAta;
  driverStatus: DriverStatus;

  /* ---------- Derived understanding ---------- */
  /** Flattened fact view, including evidence-established facts. */
  facts: KnownFacts;
  derivedEvidenceFacts: DerivedFact[];
  factsEstablishedFromEvidence: string[];
  factsNeedingConfirmation: string[];

  candidateRoutes: RouteFamily[];
  excludedRoutes: Array<{ route: RouteFamily; reason: string }>;
  routeProvenance: Record<string, string[]>;
  primaryRoute: RouteFamily | null;
  secondaryRoutes: RouteFamily[];

  resolvedMaterialFacts: string[];
  missingMaterialFacts: string[];

  /* ---------- Deterministic legal state ---------- */
  pofa: PofaAnalysis;
  codeVersionId: string | null;
  codeVersionLabel: string | null;
  prohibitedClaims: string[];
  outOfScope: ScopeDecision | null;

  /* ---------- Journey state ---------- */
  questionsAsked: AskedQuestionRef[];
  outcomeStatus: CaseOutcomeStatus;
}

export interface BuildContextInput {
  appealCase: AppealCase;
  documents?: CaseDocument[];
  askedQuestions?: AskedQuestionRef[];
}

/**
 * Build the canonical context.
 *
 * Deterministic and side-effect free. Called fresh after every answer —
 * there is no cached or pre-computed sequence anywhere.
 */
export function buildCaseReasoningContext(
  input: BuildContextInput,
): CaseReasoningContext {
  const c = input.appealCase;
  const documents = input.documents ?? [];
  const asked = input.askedQuestions ?? [];

  const evidenceDocs = documents.filter(
    (d) => d.documentType === "EVIDENCE",
  );
  const evidenceTypes = evidenceDocs.map((d) => d.evidenceType ?? "other");

  // What the uploaded evidence tells us before anything is asked.
  const derivedEvidenceFacts = deriveFactsFromEvidence(evidenceTypes);
  const established = establishedFacts(derivedEvidenceFacts);
  const needsConfirmation = factsNeedingConfirmation(derivedEvidenceFacts);

  /*
   * Answers take precedence over evidence-derived facts: a customer
   * correcting us must always win over an inference.
   */
  const mergedAnswers: AnswerMap = { ...established, ...c.adaptiveAnswers };

  const facts = deriveKnownFacts({
    confirmed: c.confirmed,
    answers: mergedAnswers,
    evidenceTypes,
  });

  // Facts already put to the customer must not be raised again.
  for (const q of asked) {
    if (q.answered) facts.values[askedFactKey(q.targetFact)] = true;
  }

  const candidacy: RouteCandidacy = assessCandidacy({
    facts,
    allegedBreach: c.confirmed?.alleged_breach ?? c.extraction?.raw?.alleged_breach ?? null,
    derivedEvidenceFacts,
  });

  const missing: FactRequirement[] = missingRequirements(
    facts,
    candidacy.candidates,
  );

  // Deterministic legal state — never delegated to a model (§M).
  const evidenceSet = new Set(evidenceTypes);
  // PoFA reads the flattened facts, which already carry the confirmed
  // notice dates and route.
  const pofa = analysePofa({ facts });
  const code = resolveCodeVersion(
    c.confirmed?.parking_event_date ?? c.parkingEventDate ?? null,
    c.operatorAta === "UNKNOWN" ? "ALL" : c.operatorAta,
  );

  const resolved = [...facts.known].filter((f) => !f.startsWith("__")).sort();

  return {
    caseId: c.id,
    publicId: c.publicId,
    serviceType: c.serviceType,
    stageNumber: c.stageNumber,
    parentCaseId: c.parentCaseId,
    jurisdiction: factStr(facts, FACT.JURISDICTION),

    extractedFacts: (c.extraction?.raw ?? {}) as Record<string, unknown>,
    confirmedFacts: c.confirmed,
    answers: mergedAnswers,
    evidence: evidenceDocs.map((d) => ({
      id: d.id,
      type: d.evidenceType ?? "other",
      fileName: d.fileName,
      uploadedAt: d.uploadedAt,
    })),

    allegedBreach:
      c.confirmed?.alleged_breach ?? c.extraction?.raw?.alleged_breach ?? null,
    noticeRoute: c.noticeRoute,
    operator: c.operatorName,
    operatorAta: c.operatorAta,
    driverStatus: c.driverStatus,

    facts,
    derivedEvidenceFacts,
    factsEstablishedFromEvidence: Object.keys(established),
    factsNeedingConfirmation: needsConfirmation,

    candidateRoutes: candidacy.candidates,
    excludedRoutes: candidacy.excluded,
    routeProvenance: candidacy.provenance,
    // Primary/secondary are decided by the analysis layer after
    // sufficiency; during questioning they are only known if persisted.
    primaryRoute: c.primaryRoute,
    secondaryRoutes: c.secondaryRoutes,

    resolvedMaterialFacts: resolved,
    missingMaterialFacts: missing.map((m) => m.fact),

    pofa,
    codeVersionId: code?.id ?? null,
    codeVersionLabel: code ? `${code.codeName} v${code.version}` : null,
    prohibitedClaims: computeProhibitedClaims({
      facts,
      pofa,
      evidence: evidenceSet,
    }),
    outOfScope: detectOutOfScope(facts),

    questionsAsked: asked,
    outcomeStatus: c.outcomeStatus,
  };
}

/** Values a fact currently holds, for validators and tests. */
export function contextFactValue(
  ctx: CaseReasoningContext,
  fact: string,
): AnswerValue | undefined {
  return ctx.facts.values[fact];
}
