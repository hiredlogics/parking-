import type { ConfirmedPcn, EvidenceItem, ExtractionResult } from "@/types";
import type { SessionData } from "@/lib/auth/session";
import type { AnswerMap, AnswerValue, Question } from "@/lib/questions/types";
import { askedKey } from "@/lib/questions/engine";
import { applyAnswerToFact } from "@/lib/questions/applyAnswer";
import {
  nextDynamicQuestion,
  type DynamicOutcome,
} from "@/lib/questions/dynamicEngine";
import { askedFactKey, missingRequirements } from "@/lib/questions/missing";
import * as questionRepo from "./questionRepo";
import { isFollowUpDue } from "./outcome";
import { deriveKnownFacts, FACT, factStr } from "@/lib/questions/facts";
import { EVIDENCE_TYPE_LABELS } from "@/types";
import * as repo from "./repo";
import { routeLabels } from "./labels";
import { assessSufficiency } from "./sufficiency";
import {
  isPaidStep,
  servicePrice,
  type WorkflowStep,
} from "@/lib/workflow/config";
import type {
  AppealCase,
  CaseDocument,
  CustomerCaseState,
  ServiceType,
  SufficiencyStatus,
} from "./types";

/**
 * Case service — the only place case access control lives.
 *
 * Every operation takes the session and verifies ownership before
 * touching data, so an endpoint cannot forget the check. Admins may read
 * any case but may not answer questions on a customer's behalf.
 */

export type AccessFailure = {
  ok: false;
  status: 401 | 403 | 404;
  code: string;
  message: string;
};

/**
 * 401 and 403 must not be conflated.
 *
 * The client treats UNAUTHENTICATED as "send them to sign in". A 403
 * means "you are signed in but not allowed", which is not recoverable
 * by signing in — so returning 403 to a signed-out visitor strands them
 * with a silent failure and no way forward.
 */
const ADMIN_NOT_CUSTOMER: AccessFailure = {
  ok: false,
  status: 403,
  code: "CUSTOMER_REQUIRED",
  message: "A customer account is required to start an appeal.",
};
export type AccessSuccess = { ok: true; appealCase: AppealCase };
export type AccessResult = AccessSuccess | AccessFailure;

const UNAUTHENTICATED: AccessFailure = {
  ok: false,
  status: 401,
  code: "UNAUTHENTICATED",
  message: "Please sign in to continue.",
};

/**
 * Resolve a case for the current session.
 *
 * `write` requires the caller to be the owning customer — an admin
 * session gets read access only, so admin activity can never be
 * mistaken for the customer's own answers.
 */
export async function requireCaseAccess(
  caseId: string,
  session: SessionData,
  mode: "read" | "write" = "read",
): Promise<AccessResult> {
  if (!session.userId) return UNAUTHENTICATED;

  const appealCase = await repo.findCase(caseId);
  // Deliberately 404 rather than 403 for a case the caller does not own,
  // so IDs cannot be probed for existence.
  if (!appealCase) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Case not found." };
  }

  const isOwner = appealCase.customerId === session.userId;
  const isAdmin = session.kind === "ADMIN";

  if (mode === "write" && !isOwner) {
    return isAdmin
      ? {
          ok: false,
          status: 403,
          code: "ADMIN_READ_ONLY",
          message: "Admins cannot modify a customer's case answers.",
        }
      : { ok: false, status: 404, code: "NOT_FOUND", message: "Case not found." };
  }
  if (mode === "read" && !isOwner && !isAdmin) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Case not found." };
  }
  return { ok: true, appealCase };
}

/* ----------------------------- Creation ----------------------------- */

export async function createCaseForCustomer(
  session: SessionData,
  serviceType: ServiceType = "PRIVATE_PARKING_INITIAL_APPEAL",
): Promise<AccessSuccess | AccessFailure> {
  if (!session.userId) return UNAUTHENTICATED;
  if (session.kind === "ADMIN") return ADMIN_NOT_CUSTOMER;

  const created = await repo.createCase({
    customerId: session.userId,
    serviceType,
  });
  await repo.addCaseEvent({
    caseId: created.id,
    eventType: "CASE_CREATED",
    actorId: session.userId,
    payload: { serviceType, publicId: created.publicId },
  });
  return { ok: true, appealCase: created };
}

/**
 * Find the customer's resumable case, so a refresh or a return visit
 * picks up where they left off instead of starting again.
 */
export async function resumeCaseForCustomer(
  session: SessionData,
): Promise<AppealCase | null> {
  if (!session.userId || session.kind === "ADMIN") return null;
  return repo.findResumableCase(session.userId);
}

/* ------------------------------ Mutations ------------------------------ */

export async function saveExtractionForCase(
  caseId: string,
  session: SessionData,
  extraction: ExtractionResult,
): Promise<{ ok: true } | AccessFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;

  await repo.saveExtraction(caseId, extraction);

  // Record each extracted value with its provenance and confidence.
  // Issued together: each is an independent upsert, and awaiting ~15 of
  // them in sequence added seconds to every upload.
  await Promise.all(
    Object.entries(extraction.raw ?? {})
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([field, value]) =>
        repo.upsertCaseFact({
          caseId,
          field,
          value,
          source: "document",
          confidence:
            extraction.confidence?.[field as keyof typeof extraction.confidence] ?? null,
          customerConfirmed: false,
        }),
      ),
  );
  await repo.addCaseEvent({
    caseId,
    eventType: "EXTRACTION_COMPLETED",
    actorId: session.userId ?? null,
    payload: { providerId: extraction.providerId },
  });
  return { ok: true };
}

export async function confirmFactsForCase(
  caseId: string,
  session: SessionData,
  confirmed: ConfirmedPcn,
): Promise<{ ok: true } | AccessFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;

  await repo.saveConfirmed(caseId, confirmed);

  // Customer corrections are stored alongside the document values —
  // the original extraction is never overwritten.
  const raw = access.appealCase.extraction?.raw ?? {};
  const entries = Object.entries(confirmed).filter(
    ([field, value]) =>
      field !== "confirmedAt" &&
      value !== null &&
      value !== undefined &&
      value !== "",
  );

  await Promise.all(
    entries.map(([field, value]) =>
      repo.upsertCaseFact({
        caseId,
        field,
        value,
        source: "customer",
        customerConfirmed: true,
      }),
    ),
  );
  await Promise.all(
    entries
      .filter(([field, value]) => raw[field as keyof typeof raw] !== value)
      .map(([field]) =>
        repo.addCaseEvent({
          caseId,
          eventType: "EXTRACTION_CORRECTED",
          actorId: session.userId ?? null,
          payload: { field },
        }),
      ),
  );
  await repo.addCaseEvent({
    caseId,
    eventType: "EXTRACTION_CONFIRMED",
    actorId: session.userId ?? null,
  });
  return { ok: true };
}

/**
 * One step of the adaptive journey, as the customer sees it.
 *
 * Deliberately free of route identifiers, reason codes and requirement
 * internals — those are persisted for audit, not shown.
 */
export interface QuestionStep {
  questioningComplete: boolean;
  question: Question | null;
  answered: number;
  outstandingCount: number;
  outOfScope: { detail: string } | null;
  needsReview: { detail: string } | null;
}

export interface AnswerOutcome {
  ok: true;
  next: QuestionStep;
  adaptiveAnswers: AnswerMap;
}

/**
 * Resolve the next question and persist it.
 *
 * Called after every answer, and on every page load. The case is
 * re-analysed from scratch each time — routes re-derived, outstanding
 * requirements recomputed — so there is no pre-generated sequence and
 * a fact that stops mattering is never asked.
 */
async function resolveNextStep(
  appealCase: AppealCase,
  answers: AnswerMap,
): Promise<{ step: QuestionStep; outcome: DynamicOutcome }> {
  const caseId = appealCase.id;
  const evidenceTypes = (
    await repo.listCaseDocuments(caseId, "EVIDENCE")
  ).map((d) => d.evidenceType ?? "other");

  const history = await questionRepo.listCaseQuestions(caseId);
  const answeredCount = history.filter((h) => h.answeredAt).length;

  // An unanswered question is served again rather than regenerated, so
  // a refresh does not produce different wording or burn an AI call.
  const pending = await questionRepo.findPendingQuestion(caseId);
  if (pending) {
    const stillNeeded = await isStillMaterial(
      appealCase, answers, evidenceTypes, history, pending.targetFact,
    );
    if (stillNeeded) {
      return {
        step: {
          questioningComplete: false,
          question: pending.question,
          answered: answeredCount,
          outstandingCount: appealCase.missingFacts.length,
          outOfScope: null,
          needsReview: null,
        },
        outcome: {
          status: "QUESTION_REQUIRED",
          question: pending.question,
          targetFact: pending.targetFact,
          requirement: {
            fact: pending.targetFact,
            reasonCode: pending.reasonCode,
            route: pending.route,
            priority: 0,
            rationale: "",
            kbModules: [],
          },
          provenance: {
            origin: pending.origin,
            providerId: pending.providerId ?? "unknown",
            model: pending.model,
            promptVersion: pending.promptVersion,
            rejections: pending.rejections,
          },
          eligibleRoutes: appealCase.candidateRoutes,
          missingFacts: appealCase.missingFacts,
        },
      };
    }
    // The fact stopped being material — drop it rather than hold the
    // customer up with a question that no longer matters.
    await questionRepo.discardPendingQuestion(caseId);
  }

  const outcome = await nextDynamicQuestion({
    caseId,
    confirmed: appealCase.confirmed,
    answers,
    evidenceTypes,
    // The operator's allegation opens routes on its own.
    allegedBreach:
      appealCase.confirmed?.alleged_breach ??
      appealCase.extraction?.raw?.alleged_breach ??
      null,
    askedFacts: history.map((h) => h.targetFact),
    askedLabels: history.map((h) => h.label),
  });

  if (outcome.status === "QUESTION_REQUIRED") {
    await questionRepo.recordAskedQuestion({
      caseId,
      targetFact: outcome.targetFact,
      reasonCode: outcome.requirement.reasonCode,
      route: outcome.requirement.route,
      question: outcome.question,
      provenance: outcome.provenance,
    });
  }

  return { step: toStep(outcome, answeredCount), outcome };
}

/** Is the pending question's fact still outstanding after re-analysis? */
async function isStillMaterial(
  appealCase: AppealCase,
  answers: AnswerMap,
  evidenceTypes: string[],
  history: questionRepo.CaseQuestionRow[],
  fact: string,
): Promise<boolean> {
  const facts = deriveKnownFacts({
    confirmed: appealCase.confirmed,
    answers,
    evidenceTypes,
  });
  for (const h of history) {
    if (h.answeredAt) facts.values[askedFactKey(h.targetFact)] = true;
  }
  return missingRequirements(facts).some((r) => r.fact === fact);
}

function toStep(outcome: DynamicOutcome, answered: number): QuestionStep {
  switch (outcome.status) {
    case "QUESTION_REQUIRED":
      return {
        questioningComplete: false,
        question: outcome.question,
        answered,
        outstandingCount: outcome.missingFacts.length,
        outOfScope: null,
        needsReview: null,
      };
    case "OUT_OF_SCOPE":
      return {
        questioningComplete: true,
        question: null,
        answered,
        outstandingCount: 0,
        outOfScope: { detail: outcome.scope.detail },
        needsReview: null,
      };
    case "MANUAL_REVIEW":
      return {
        questioningComplete: true,
        question: null,
        answered,
        outstandingCount: outcome.missingFacts.length,
        outOfScope: null,
        needsReview: { detail: outcome.detail },
      };
    case "SUFFICIENT_INFORMATION":
      return {
        questioningComplete: true,
        question: null,
        answered,
        outstandingCount: 0,
        outOfScope: null,
        needsReview: null,
      };
  }
}

/** Persist derived case state after a step. */
async function persistStepState(
  caseId: string,
  appealCase: AppealCase,
  answers: AnswerMap,
  outcome: DynamicOutcome,
): Promise<void> {
  const evidenceTypes = (
    await repo.listCaseDocuments(caseId, "EVIDENCE")
  ).map((d) => d.evidenceType ?? "other");
  const facts = deriveKnownFacts({
    confirmed: appealCase.confirmed,
    answers,
    evidenceTypes,
  });
  const history = await questionRepo.listCaseQuestions(caseId);

  await repo.saveAnswers(caseId, {
    adaptiveAnswers: answers,
    askedQuestionIds: history.map((h) => h.targetFact),
    questioningComplete: outcome.status !== "QUESTION_REQUIRED",
    missingFacts: outcome.status === "QUESTION_REQUIRED" ? outcome.missingFacts : [],
    candidateRoutes: outcome.eligibleRoutes,
    driverStatus:
      factStr(facts, FACT.DRIVER_IDENTIFIED) === "YES"
        ? "IDENTIFIED"
        : factStr(facts, FACT.DRIVER_IDENTIFIED) === "NO"
          ? "UNIDENTIFIED"
          : "UNKNOWN",
    outOfScope:
      outcome.status === "OUT_OF_SCOPE"
        ? { reason: outcome.scope.reason, detail: outcome.scope.detail }
        : outcome.status === "MANUAL_REVIEW"
          ? { reason: outcome.reason, detail: outcome.detail }
          : null,
  });
}

/**
 * Record one adaptive answer and return the next question.
 *
 * The server owns the answer map. The client sends only a question id
 * and a value, so it cannot inject facts that were never asked.
 */
/**
 * Record one answer and re-evaluate the whole case.
 *
 * The answer is validated against the question the SERVER asked, read
 * from the pending row — so the client cannot write a fact that was
 * never put to the customer.
 */
export async function recordAnswerForCase(
  caseId: string,
  session: SessionData,
  questionId: string,
  value: AnswerValue,
): Promise<AnswerOutcome | AccessFailure | { ok: false; status: 400; code: string; message: string }> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;
  const appealCase = access.appealCase;

  if (!appealCase.confirmed) {
    return {
      ok: false,
      status: 400,
      code: "CONFIRMATION_REQUIRED",
      message: "Confirm the notice details before answering questions.",
    };
  }

  const pending = await questionRepo.findPendingQuestion(caseId);
  if (!pending) {
    return {
      ok: false,
      status: 400,
      code: "NO_PENDING_QUESTION",
      message: "There is no question awaiting an answer.",
    };
  }
  // A stale tab must not answer a question that has since been replaced.
  if (questionId && questionId !== pending.question.questionId) {
    return {
      ok: false,
      status: 400,
      code: "STALE_QUESTION",
      message: "That question has moved on. Please refresh to continue.",
    };
  }

  const applied = applyAnswerToFact(
    appealCase.adaptiveAnswers,
    pending.question,
    pending.targetFact,
    value,
  );
  if (!applied.ok) {
    return {
      ok: false,
      status: 400,
      code: "INVALID_ANSWER",
      message: applied.error ?? "Invalid answer.",
    };
  }

  await questionRepo.recordAnswer(pending.id, value);
  await repo.recordCaseAnswer({
    caseId,
    questionId: pending.targetFact,
    answer: value,
  });
  await repo.addCaseEvent({
    caseId,
    eventType: "QUESTION_ANSWERED",
    actorId: session.userId ?? null,
    payload: {
      targetFact: pending.targetFact,
      reasonCode: pending.reasonCode,
      route: pending.route,
      origin: pending.origin,
    },
  });

  // Re-analyse from scratch with the new answer included.
  const updated: AppealCase = { ...appealCase, adaptiveAnswers: applied.answers };
  const { step, outcome } = await resolveNextStep(updated, applied.answers);
  await persistStepState(caseId, updated, applied.answers, outcome);

  return { ok: true, next: step, adaptiveAnswers: applied.answers };
}

/** Serve the next question, generating one if none is pending. */
export async function nextQuestionForCase(
  caseId: string,
  session: SessionData,
): Promise<
  | { ok: true; next: QuestionStep }
  | AccessFailure
  | { ok: false; status: 400; code: string; message: string }
> {
  // Write access: serving a question persists it.
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;
  const appealCase = access.appealCase;

  if (!appealCase.confirmed) {
    return {
      ok: false,
      status: 400,
      code: "CONFIRMATION_REQUIRED",
      message: "Confirm the notice details before answering questions.",
    };
  }

  const { step, outcome } = await resolveNextStep(
    appealCase,
    appealCase.adaptiveAnswers,
  );
  await persistStepState(caseId, appealCase, appealCase.adaptiveAnswers, outcome);
  return { ok: true, next: step };
}

/**
 * Evidence upload lives in `lib/cases/evidence.ts`, which validates the
 * bytes and writes them to storage itself. There is deliberately no
 * function here that attaches a caller-supplied storage key.
 */
export async function removeEvidenceFromCase(
  caseId: string,
  session: SessionData,
  documentId: string,
): Promise<{ ok: true } | AccessFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;

  const doc = await repo.findCaseDocument(documentId);
  // Cross-case deletion must not be possible.
  if (!doc || doc.caseId !== caseId) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Document not found." };
  }
  await repo.softDeleteCaseDocument(documentId);
  await repo.addCaseEvent({
    caseId,
    eventType: "DOCUMENT_REMOVED",
    actorId: session.userId ?? null,
    payload: { documentId },
  });
  return { ok: true };
}

/* -------------------------- Readiness / gate -------------------------- */

export interface ReadinessView {
  sufficient: boolean;
  status: SufficiencyStatus;
  /** Customer-safe reasons the case is not ready. */
  blockers: string[];
  groundLabels: string[];
  evidence: { uploadedCount: number; suggestions: { label: string }[] };
  outOfScope: { detail: string } | null;
  /** Whether the next step is behind the payment gate. */
  paymentRequired: boolean;
  price: { amount: number; currency: string; description: string } | null;
  /** Confirmed notice details, safe to echo back. */
  caseDetails: {
    publicId: string;
    operatorName: string | null;
    pcnNumber: string | null;
    vrm: string | null;
    parkingLocation: string | null;
    parkingEventDate: string | null;
  };
}

/**
 * Run the sufficient-information check and persist the outcome.
 *
 * The payment gate position comes from the service workflow config, so
 * a different service can collect payment at a different point without
 * changing this code.
 */
export async function runReadinessCheck(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; readiness: ReadinessView } | AccessFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;
  const c = access.appealCase;

  const docs = await repo.listCaseDocuments(caseId, "EVIDENCE");
  const evidenceTypes = docs.map((d) => d.evidenceType ?? "other");

  const result = await assessSufficiency(c, evidenceTypes);

  // Where does payment sit for this service?
  const gatedStep: WorkflowStep = "ANALYSIS";
  const paymentRequired = isPaidStep(c.serviceType, gatedStep);

  await repo.saveReadiness(caseId, {
    sufficient: result.sufficient,
    candidateRoutes: result.internal.candidateRoutes,
    primaryRoute: result.internal.primaryRoute,
    secondaryRoutes: result.internal.secondaryRoutes,
    missingFacts: result.internal.missingFacts,
    codeVersionId: result.internal.codeVersionId,
    pofaRoute: result.internal.pofaRoute,
    outOfScope: result.outOfScope,
    readyStatus: paymentRequired ? "AWAITING_PAYMENT" : "ANALYSING",
  });

  await repo.addCaseEvent({
    caseId,
    eventType: result.sufficient
      ? "SUFFICIENCY_CONFIRMED"
      : "SUFFICIENCY_INCOMPLETE",
    actorId: session.userId ?? null,
    payload: {
      moduleCount: result.internal.moduleCount,
      primaryRoute: result.internal.primaryRoute,
      outstanding: result.internal.missingFacts.length,
    },
  });

  return {
    ok: true,
    readiness: {
      sufficient: result.sufficient,
      status: result.status,
      blockers: result.blockers,
      groundLabels: result.groundLabels,
      evidence: result.evidence,
      outOfScope: result.outOfScope,
      paymentRequired: result.sufficient && paymentRequired,
      price: result.sufficient && paymentRequired
        ? servicePrice(c.serviceType)
        : null,
      caseDetails: {
        publicId: c.publicId,
        operatorName: c.operatorName,
        pcnNumber: c.pcnNumber,
        vrm: c.vrm,
        parkingLocation: c.parkingLocation,
        parkingEventDate: c.parkingEventDate,
      },
    },
  };
}

/**
 * Server-side entitlement guard.
 *
 * Any step behind the payment gate must call this. It reads payment
 * state from the database — never from a client claim — so the gate
 * cannot be bypassed by a crafted request.
 */
export async function requireStepEntitlement(
  caseId: string,
  session: SessionData,
  step: WorkflowStep,
): Promise<
  | { ok: true; appealCase: AppealCase }
  | AccessFailure
  | { ok: false; status: 402; code: "PAYMENT_REQUIRED"; message: string }
> {
  const access = await requireCaseAccess(caseId, session, "read");
  if (!access.ok) return access;
  const c = access.appealCase;

  if (!isPaidStep(c.serviceType, step)) {
    return { ok: true, appealCase: c };
  }
  if (c.paymentStatus === "PAID") {
    return { ok: true, appealCase: c };
  }
  return {
    ok: false,
    status: 402,
    code: "PAYMENT_REQUIRED",
    message: "Payment is required to access this appeal.",
  };
}

/* --------------------------- State assembly --------------------------- */

function toEvidenceItems(docs: CaseDocument[]): EvidenceItem[] {
  return docs.map((d) => ({
    id: d.id,
    type: (d.evidenceType ?? "other") as EvidenceItem["type"],
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storageKey: d.storageKey,
    uploadedAt: d.uploadedAt,
    description: d.description ?? undefined,
  }));
}

/**
 * Build the customer-safe view of a case.
 *
 * Internal route identifiers become friendly labels, and the internal
 * missing-fact keys are reduced to a count.
 */
export async function getCustomerCaseState(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; state: CustomerCaseState } | AccessFailure> {
  const access = await requireCaseAccess(caseId, session, "read");
  if (!access.ok) return access;
  const c = access.appealCase;

  const docs = await repo.listCaseDocuments(caseId, "EVIDENCE");

  return {
    ok: true,
    state: {
      id: c.id,
      publicId: c.publicId,
      serviceType: c.serviceType,
      status: c.status,
      extraction: c.extraction,
      confirmed: c.confirmed,
      adaptiveAnswers: c.adaptiveAnswers,
      askedQuestionIds: c.askedQuestionIds,
      evidence: toEvidenceItems(docs),
      questioningComplete: c.questioningComplete,
      sufficiencyStatus: c.sufficiencyStatus,
      outstandingCount: c.missingFacts.length,
      groundLabels: routeLabels(c.candidateRoutes),
      outOfScope: c.outOfScopeDetail ? { detail: c.outOfScopeDetail } : null,
      paymentStatus: c.paymentStatus,
      appealLocked: c.appealLocked,
      // Workflow position and operator decision are separate axes:
      // COMPLETED with a PENDING outcome is the normal post-submission
      // state.
      lifecycleStatus: c.lifecycleStatus,
      outcomeStatus: c.outcomeStatus,
      outcomeRecordedAt: c.outcomeRecordedAt,
      submittedAt: c.submittedAt,
      followUpDue: isFollowUpDue(c),
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    },
  };
}

/** Evidence type labels for display, without leaking internal keys. */
export function evidenceLabel(type: string): string {
  return (
    (EVIDENCE_TYPE_LABELS as Record<string, string>)[type] ?? "Supporting evidence"
  );
}

export { askedKey };
