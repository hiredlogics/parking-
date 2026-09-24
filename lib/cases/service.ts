import type { ConfirmedPcn, EvidenceItem, ExtractionResult } from "@/types";
import type { SessionData } from "@/lib/auth/session";
import type { AnswerMap } from "@/lib/facts/types";
import { openRoutes } from "@/lib/facts/requirements";
import { detectOutOfScope } from "@/lib/facts/scope";
import { isFollowUpDue } from "./outcome";
import { deriveKnownFacts, FACT, factStr } from "@/lib/facts/facts";
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
  status: 401 | 403 | 404 | 409;
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

  const {
    isServiceNotSupported,
    SERVICE_NOT_SUITABLE_DETAIL,
  } = await import("@/lib/cases/documentUnderstanding");
  const { resolveSuitability } = await import("@/lib/cases/caseIntelligence");

  const triage = access.appealCase.extraction?.triage;

  // One authority for "can this service act on this document?".
  const suitability = resolveSuitability({
    caseIntelligence: access.appealCase.caseIntelligence,
    serviceDecision: access.appealCase.serviceDecision,
    triageServiceDecision: triage?.serviceDecision ?? null,
    triageDetail: triage?.detail ?? null,
    outOfScopeDetail: access.appealCase.outOfScopeDetail,
  });
  if (suitability.decision === "NOT_SUPPORTED") {
    return {
      ok: false,
      status: 409,
      code: "WRONG_DOCUMENT_STAGE",
      message: suitability.detail ?? SERVICE_NOT_SUITABLE_DETAIL,
    };
  }

  // Deterministic re-check of sender / extracted fields.
  const { assessDocumentDeterministic } = await import(
    "@/lib/triage/deterministic"
  );
  const det = assessDocumentDeterministic({
    operatorName: confirmed.operator_name,
    allegedBreach: confirmed.alleged_breach,
    parkingLocation: confirmed.parking_location,
    senderName:
      access.appealCase.senderName ?? triage?.senderName ?? null,
    parkingOperatorName:
      access.appealCase.parkingOperatorName ??
      triage?.parkingOperatorName ??
      null,
  });
  if (isServiceNotSupported(det.serviceDecision)) {
    return {
      ok: false,
      status: 409,
      code: "WRONG_DOCUMENT_STAGE",
      message: SERVICE_NOT_SUITABLE_DETAIL,
    };
  }

  // Preserve durable case_stage from document understanding.
  const confirmedWithStage: ConfirmedPcn = {
    ...confirmed,
    case_stage:
      (access.appealCase.caseStage as ConfirmedPcn["case_stage"]) ??
      confirmed.case_stage ??
      "INITIAL_OPERATOR_APPEAL",
    // Prefer parking operator on confirmed notice — never the debt sender.
    operator_name:
      access.appealCase.parkingOperatorName ??
      confirmed.operator_name ??
      undefined,
  };

  await repo.saveConfirmed(caseId, confirmedWithStage);

  // Seed jurisdiction from AI extraction or notice location when clear —
  // do not ask unless neither source can resolve England/Wales / Scotland / NI.
  {
    const { resolveUkJurisdiction } = await import(
      "@/lib/facts/jurisdiction"
    );
    const { FACT } = await import("@/lib/facts/facts");
    const inferred = resolveUkJurisdiction({
      ukJurisdiction: confirmedWithStage.uk_jurisdiction,
      parkingLocation: confirmedWithStage.parking_location,
      extraText: [
        confirmedWithStage.alleged_breach,
        confirmedWithStage.operator_name,
      ],
    });
    if (inferred) {
      const existing = access.appealCase.adaptiveAnswers ?? {};
      if (!existing[FACT.JURISDICTION]) {
        await repo.saveAnswers(caseId, {
          adaptiveAnswers: { ...existing, [FACT.JURISDICTION]: inferred },
          questioningComplete: access.appealCase.questioningComplete,
          missingFacts: access.appealCase.missingFacts ?? [],
          candidateRoutes: access.appealCase.candidateRoutes ?? [],
        });
      }
    }
  }

  // Case Intelligence — technical analysis BEFORE questions.
  const understanding = {
    documentType: access.appealCase.documentType,
    senderName: access.appealCase.senderName,
    parkingOperatorName: access.appealCase.parkingOperatorName,
    caseStage: access.appealCase.caseStage,
    serviceDecision: access.appealCase.serviceDecision,
  } as import("@/lib/cases/documentUnderstanding").DurableDocumentUnderstanding;
  const { buildCaseIntelligence } = await import(
    "@/lib/cases/caseIntelligence"
  );
  const intelligence = buildCaseIntelligence({
    confirmed: confirmedWithStage,
    answers: {},
    evidenceTypes: [],
    documentUnderstanding: understanding,
  });
  await repo.saveCaseIntelligence(caseId, intelligence);

  // Customer corrections are stored alongside the document values —
  // the original extraction is never overwritten.
  const raw = access.appealCase.extraction?.raw ?? {};
  const entries = Object.entries(confirmedWithStage).filter(
    ([field, value]) =>
      field !== "confirmedAt" &&
      field !== "case_stage" &&
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

  /*
   * Derive the case state now the notice is confirmed.
   *
   * `questioningComplete` is decided by the fact-gap resolver inside
   * persistDerivedState — true only when there is no blocking material
   * fact left to ask. Confirmation alone must never mark questioning done.
   */
  const confirmedCase = await repo.findCase(caseId);
  if (confirmedCase) {
    await persistDerivedState(
      caseId,
      confirmedCase,
      confirmedCase.adaptiveAnswers ?? {},
    );
  }

  return { ok: true };
}

/**
 * The result of writing a fact onto a case.
 *
 * It used to carry the next question to put to the customer. There is
 * no next question: the pipeline derives its facts from the notice and
 * the uploaded evidence, so all a writer returns is the updated answer
 * map.
 */
export interface AnswerOutcome {
  ok: true;
  adaptiveAnswers: AnswerMap;
}
/**
 * Recompute and persist everything the case derives from its facts.
 *
 *   candidateRoutes  openRoutes(facts)
 *   missingFacts     from the fact-gap resolver (admin issue config)
 *   questioningComplete
 *                    true only when there is no remaining blocking
 *                    fact-gap question — never "true because confirmed".
 *   outOfScope       from `detectOutOfScope`
 */
async function persistDerivedState(
  caseId: string,
  appealCase: AppealCase,
  answers: AnswerMap,
): Promise<void> {
  const evidenceTypes = (
    await repo.listCaseDocuments(caseId, "EVIDENCE")
  ).map((d) => d.evidenceType ?? "other");
  let facts = deriveKnownFacts({
    confirmed: appealCase.confirmed,
    answers,
    evidenceTypes,
  });

  /*
   * Pin the jurisdiction the notice already resolves.
   *
   * `deriveKnownFacts` works it out from the location or the postcode on
   * every call, but it is not written down anywhere, so a later change
   * to the notice could silently move the case between legal regimes
   * after the appeal was drafted. Writing it into the answer map fixes
   * it to what was true when the case was assessed. This used to happen
   * in the question engine, to stop it re-asking; it is kept because the
   * reason it mattered was never the question.
   */
  if (!answers[FACT.JURISDICTION]) {
    const resolved = factStr(facts, FACT.JURISDICTION);
    if (resolved) {
      answers = { ...answers, [FACT.JURISDICTION]: resolved };
      facts = deriveKnownFacts({
        confirmed: appealCase.confirmed,
        answers,
        evidenceTypes,
      });
    }
  }

  const scope = detectOutOfScope(facts);

  /*
   * Fact-gap is the authority on whether questioning is finished.
   *
   * Confirming the notice is not the same as having nothing left to ask:
   * allegation-driven issues often still need material facts. Defaults
   * are applied first so we do not treat system-filled facts as gaps.
   */
  const { resolveAnswersWithDefaults } = await import(
    "@/lib/rules/factDefaults"
  );
  const { resolveFactGap, ASKED_PREFIX } = await import(
    "@/lib/facts/gapResolver"
  );
  const { answers: withDefaults } = resolveAnswersWithDefaults(
    appealCase.confirmed,
    answers,
    evidenceTypes,
  );
  const gapFacts = deriveKnownFacts({
    confirmed: appealCase.confirmed,
    answers: withDefaults,
    evidenceTypes,
  });
  for (const key of Object.keys(facts.values)) {
    if (key.startsWith(ASKED_PREFIX)) gapFacts.values[key] = true;
  }
  const { buildCaseIntelligence } = await import(
    "@/lib/cases/caseIntelligence"
  );
  const intelligence = buildCaseIntelligence({
    confirmed: appealCase.confirmed!,
    answers: withDefaults,
    evidenceTypes,
    documentUnderstanding: {
      documentType: (appealCase.documentType as never) ?? null,
      senderName: appealCase.senderName,
      parkingOperatorName: appealCase.parkingOperatorName,
      caseStage: (appealCase.caseStage as never) ?? null,
      serviceDecision: (appealCase.serviceDecision as never) ?? null,
    },
    knownFactsOverride: gapFacts,
  });
  const gap = await resolveFactGap({
    facts: gapFacts,
    serviceCode: appealCase.serviceType,
    evidenceTypes,
    caseIntelligence: intelligence,
  });
  const blockingGap = Boolean(gap.gap && !gap.gap.optional);

  await repo.saveAnswers(caseId, {
    adaptiveAnswers: answers,
    questioningComplete: !blockingGap,
    missingFacts: gap.outstanding.map((m) => m.factKey),
    candidateRoutes: openRoutes(facts),
    driverStatus:
      factStr(facts, FACT.DRIVER_IDENTIFIED) === "YES"
        ? "IDENTIFIED"
        : factStr(facts, FACT.DRIVER_IDENTIFIED) === "NO"
          ? "UNIDENTIFIED"
          : "UNKNOWN",
    outOfScope: scope ? { reason: scope.reason, detail: scope.detail } : null,
  });

  if (appealCase.confirmed) {
    await repo.saveCaseIntelligence(caseId, intelligence);
  }
}

/**
 * Let the customer correct "I am not the registered keeper".
 *
 * Kept after the question engine's removal because it is a correction to
 * a fact the NOTICE asserted, not an answer to a question we asked. A
 * keeper wrongly recorded as someone else stops the appeal dead, and the
 * notice is the thing that was wrong.
 */
export async function correctRegisteredKeeperForCase(
  caseId: string,
  session: SessionData,
): Promise<
  | AnswerOutcome
  | AccessFailure
  | { ok: false; status: 400; code: string; message: string }
> {
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

  const answers: AnswerMap = {
    ...appealCase.adaptiveAnswers,
    [FACT.REGISTERED_KEEPER]: "YES",
  };

  await repo.recordCaseAnswer({
    caseId,
    questionId: FACT.REGISTERED_KEEPER,
    answer: "YES",
  });
  await repo.addCaseEvent({
    caseId,
    eventType: "QUESTION_ANSWERED",
    actorId: session.userId ?? null,
    payload: {
      targetFact: FACT.REGISTERED_KEEPER,
      corrected: true,
      value: "YES",
    },
  });

  const updated: AppealCase = { ...appealCase, adaptiveAnswers: answers };
  await persistDerivedState(caseId, updated, answers);

  return { ok: true, adaptiveAnswers: answers };
}

/**
 * Persist profile fields collected outside the adaptive question engine
 * (keeper address, free-text "other" situation, etc.).
 */
export async function saveKeeperProfileForCase(
  caseId: string,
  session: SessionData,
  profile: {
    keeper_name?: string;
    keeper_address_line1?: string;
    keeper_address_line2?: string;
    keeper_town?: string;
    keeper_postcode?: string;
    situation_other?: string;
    registered_keeper?: string;
  },
): Promise<
  | { ok: true; adaptiveAnswers: AnswerMap }
  | AccessFailure
  | { ok: false; status: 400; code: string; message: string }
> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;
  const appealCase = access.appealCase;

  const answers: AnswerMap = { ...appealCase.adaptiveAnswers };

  /*
   * Whether the appellant is the registered keeper.
   *
   * Every keeper-liability ground depends on this one fact, and nothing
   * else can supply it: the registry declares it source "ANSWER", and
   * when the adaptive questions were removed the fact it used to come
   * from (CQ01) went with them. The whole Schedule 4 family then dropped
   * out of every appeal, because PoFA cannot be argued for someone who
   * is not recorded as the keeper.
   *
   * Validated against the enum here rather than trusted, so the client
   * cannot write a value the fact registry does not recognise.
   */
  if (profile.registered_keeper !== undefined) {
    const v = profile.registered_keeper.trim().toUpperCase();
    if (v !== "YES" && v !== "NO" && v !== "UNSURE") {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Please say whether you are the registered keeper.",
      };
    }
    answers.registered_keeper = v;
  }

  if (profile.keeper_name !== undefined) {
    const name = profile.keeper_name.trim();
    const line1 = (profile.keeper_address_line1 ?? "").trim();
    const town = (profile.keeper_town ?? "").trim();
    const postcode = (profile.keeper_postcode ?? "").trim();
    if (!name || !line1 || !town || !postcode) {
      return {
        ok: false,
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Please complete the registered keeper name and address.",
      };
    }
    answers.keeper_name = name;
    answers.keeper_address_line1 = line1;
    answers.keeper_address_line2 = (profile.keeper_address_line2 ?? "").trim() || null;
    answers.keeper_town = town;
    answers.keeper_postcode = postcode.toUpperCase();
  }

  if (profile.situation_other !== undefined) {
    answers.situation_other = profile.situation_other.trim() || null;
  }

  await repo.saveAnswers(caseId, {
    adaptiveAnswers: answers,
    questioningComplete: appealCase.questioningComplete,
    missingFacts: appealCase.missingFacts,
    candidateRoutes: appealCase.candidateRoutes,
    driverStatus: appealCase.driverStatus,
    outOfScope: appealCase.outOfScopeReason
      ? { reason: appealCase.outOfScopeReason, detail: appealCase.outOfScopeDetail ?? "" }
      : null,
  });

  return { ok: true, adaptiveAnswers: answers };
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

