/**
 * The fact gap loop, bound to a case.
 *
 * Two operations, and they are the whole customer-facing surface of the
 * fact lifecycle:
 *
 *   nextFactQuestion  what to ask now, or nothing
 *   recordFactAnswer  store the answer, then recalculate
 *
 * Recalculation after every answer is the point. A case's active issues
 * are derived from its facts, so an answer can open an issue that was
 * not there a moment ago — "I'd broken down" makes the recovery
 * questions material — and it can close one just as easily. A fixed
 * question list cannot do that, which is why the previous engine asked
 * the same things regardless of what it had already been told.
 */
import type { SessionData } from "@/lib/auth/session";
import type { AnswerMap } from "@/lib/facts/types";
import { deriveKnownFacts } from "@/lib/facts/facts";
import {
  applyFactAnswer,
  resolveFactGap,
  validateFactAnswer,
  type GapResolution,
} from "@/lib/facts/gapResolver";
import { generateFactQuestion } from "@/lib/facts/factQuestionProvider";
import type { GeneratedQuestion } from "@/lib/facts/factQuestion";
import { requireCaseAccess, type AccessFailure } from "./service";
import * as repo from "./repo";

export interface FactQuestionView {
  /** Null when there is nothing left worth asking. */
  question:
    | (GeneratedQuestion & {
        issueLabel: string;
        optional: boolean;
        /** Documents that would settle this instead of an answer. */
        evidenceTypes: string[];
      })
    | null;
  /** Plain-language issues the SYSTEM identified. Never a menu to pick from. */
  issues: { code: string; label: string }[];
  askedCount: number;
  remainingBudget: number;
  complete: boolean;
}

type Failure =
  | AccessFailure
  | { ok: false; status: 400; code: string; message: string };

async function loadResolution(
  answers: AnswerMap,
  confirmed: Parameters<typeof deriveKnownFacts>[0]["confirmed"],
  serviceCode: string,
  evidenceTypes: string[],
  documentUnderstanding?: import("@/lib/cases/documentUnderstanding").DurableDocumentUnderstanding | null,
): Promise<GapResolution> {
  const { applyDocumentImplications } = await import(
    "@/lib/facts/documentImplications"
  );
  const { buildCaseIntelligence } = await import(
    "@/lib/cases/caseIntelligence"
  );
  const facts = applyDocumentImplications(
    deriveKnownFacts({ confirmed, answers, evidenceTypes }),
  );
  const intelligence = buildCaseIntelligence({
    confirmed: confirmed!,
    answers,
    evidenceTypes,
    documentUnderstanding: documentUnderstanding ?? null,
    knownFactsOverride: facts,
  });
  return resolveFactGap({
    facts,
    serviceCode,
    evidenceTypes,
    caseIntelligence: intelligence,
  });
}

async function evidenceTypesFor(caseId: string): Promise<string[]> {
  const docs = await repo.listCaseDocuments(caseId);
  return docs.map((d) => d.evidenceType ?? "other");
}

async function understandingOf(appealCase: {
  documentType?: unknown;
  senderName?: string | null;
  parkingOperatorName?: string | null;
  caseStage?: unknown;
  serviceDecision?: unknown;
}): Promise<
  import("@/lib/cases/documentUnderstanding").DurableDocumentUnderstanding
> {
  return {
    documentType: (appealCase.documentType as never) ?? null,
    senderName: appealCase.senderName ?? null,
    parkingOperatorName: appealCase.parkingOperatorName ?? null,
    caseStage: (appealCase.caseStage as never) ?? null,
    serviceDecision: (appealCase.serviceDecision as never) ?? null,
  };
}

/** The one question to put to this customer now. */
export async function nextFactQuestion(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; data: FactQuestionView } | Failure> {
  const access = await requireCaseAccess(caseId, session, "read");
  if (!access.ok) return access;
  const appealCase = access.appealCase;

  if (!appealCase.confirmed) {
    return {
      ok: false,
      status: 400,
      code: "NOT_CONFIRMED",
      message: "Confirm the details we read from your notice first.",
    };
  }

  const evidenceTypes = await evidenceTypesFor(caseId);
  const understanding = await understandingOf(appealCase);
  const resolution = await loadResolution(
    appealCase.adaptiveAnswers,
    appealCase.confirmed,
    appealCase.serviceType,
    evidenceTypes,
    understanding,
  );

  if (!resolution.gap) {
    return {
      ok: true,
      data: {
        question: null,
        issues: resolution.activeIssues,
        askedCount: resolution.askedCount,
        remainingBudget: resolution.remainingBudget,
        complete: true,
      },
    };
  }

  const generated = await generateFactQuestion({
    gap: resolution.gap,
    facts: deriveKnownFacts({
      confirmed: appealCase.confirmed,
      answers: appealCase.adaptiveAnswers,
      evidenceTypes,
    }),
    caseId,
  });

  return {
    ok: true,
    data: {
      question: {
        ...generated,
        issueLabel: resolution.gap.issueLabel,
        optional: resolution.gap.optional,
        evidenceTypes: resolution.gap.evidenceTypes,
      },
      issues: resolution.activeIssues,
      askedCount: resolution.askedCount,
      remainingBudget: resolution.remainingBudget,
      complete: false,
    },
  };
}

/**
 * Store one answer and recalculate.
 *
 * The fact key is checked against what the resolver would actually ask
 * for, rather than trusted from the request. Otherwise the endpoint is
 * a way to write any fact on any case — including the ones the registry
 * marks as coming from the notice or from a document, which would let a
 * caller assert a value the letter then states as established fact.
 */
export async function recordFactAnswer(
  caseId: string,
  session: SessionData,
  input: { factKey: string; value: unknown },
): Promise<{ ok: true; data: FactQuestionView } | Failure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;
  const appealCase = access.appealCase;

  if (!appealCase.confirmed) {
    return {
      ok: false,
      status: 400,
      code: "NOT_CONFIRMED",
      message: "Confirm the details we read from your notice first.",
    };
  }

  const evidenceTypes = await evidenceTypesFor(caseId);
  const understanding = await understandingOf(appealCase);
  const before = await loadResolution(
    appealCase.adaptiveAnswers,
    appealCase.confirmed,
    appealCase.serviceType,
    evidenceTypes,
    understanding,
  );

  const askable = new Set(before.outstanding.map((m) => m.factKey));
  if (!askable.has(input.factKey)) {
    return {
      ok: false,
      status: 400,
      code: "FACT_NOT_OUTSTANDING",
      message: "That question is no longer part of your case.",
    };
  }

  const validated = await validateFactAnswer(input.factKey, input.value);
  if (!validated.ok) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: validated.message ?? "Please check that answer.",
    };
  }

  /*
   * Saved as a customer answer, which is assertable provenance — and
   * correctly so, because the customer did state it. Nothing else on
   * this path may write a fact: a value the model produced, or one
   * inferred from prose, never arrives here.
   */
  const answers = applyFactAnswer(
    appealCase.adaptiveAnswers,
    input.factKey,
    validated.value ?? null,
  );

  const after = await loadResolution(
    answers,
    appealCase.confirmed,
    appealCase.serviceType,
    evidenceTypes,
    understanding,
  );

  await repo.saveAnswers(caseId, {
    adaptiveAnswers: answers,
    questioningComplete: after.complete,
    missingFacts: after.outstanding.map((m) => m.factKey),
    candidateRoutes: appealCase.candidateRoutes ?? [],
  });

  if (!after.gap) {
    return {
      ok: true,
      data: {
        question: null,
        issues: after.activeIssues,
        askedCount: after.askedCount,
        remainingBudget: after.remainingBudget,
        complete: true,
      },
    };
  }

  const generated = await generateFactQuestion({
    gap: after.gap,
    facts: deriveKnownFacts({
      confirmed: appealCase.confirmed,
      answers,
      evidenceTypes,
    }),
    caseId,
  });

  return {
    ok: true,
    data: {
      question: {
        ...generated,
        issueLabel: after.gap.issueLabel,
        optional: after.gap.optional,
        evidenceTypes: after.gap.evidenceTypes,
      },
      issues: after.activeIssues,
      askedCount: after.askedCount,
      remainingBudget: after.remainingBudget,
      complete: false,
    },
  };
}
