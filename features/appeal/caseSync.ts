"use client";

import type { ConfirmedPcn, ExtractionResult } from "@/types";
import type { CustomerCaseState } from "@/lib/cases/types";
import type { AppealCaseStatus } from "@/types/caseState";
import type { AnswerValue, Question } from "@/lib/questions/types";

/**
 * Client helpers for the server-backed case.
 *
 * PostgreSQL is authoritative. These functions are the only way the
 * customer pages talk to case state, so the browser store never becomes
 * a second source of truth.
 */

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function call<T>(
  url: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; code: string; message: string }> {
  try {
    const res = await fetch(url, {
      ...init,
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    const json = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (!res.ok || !json?.success || json.data === undefined) {
      return {
        ok: false,
        code: json?.error?.code ?? `HTTP_${res.status}`,
        message: json?.error?.message ?? "Request failed.",
      };
    }
    return { ok: true, data: json.data };
  } catch (err) {
    return {
      ok: false,
      code: "NETWORK",
      message: err instanceof Error ? err.message : "Network error.",
    };
  }
}

export type CaseResult = Awaited<ReturnType<typeof createCase>>;

export function createCase(serviceType = "PRIVATE_PARKING_INITIAL_APPEAL") {
  return call<{ case: CustomerCaseState }>("/api/cases", {
    method: "POST",
    body: JSON.stringify({ serviceType }),
  });
}

export function fetchCase(caseId: string) {
  return call<{ case: CustomerCaseState }>(`/api/cases/${caseId}`);
}

export interface CaseListItem {
  id: string;
  publicId: string;
  status: AppealCaseStatus;
  serviceType: string;
  pcnNumber: string | null;
  vrm: string | null;
  operatorName: string | null;
  paymentStatus: PaymentStatusValue;
  createdAt: string;
  updatedAt: string;
}

/** Cases plus the one to resume — used on first load. */
export function fetchCaseList() {
  return call<{ cases: CaseListItem[]; resume: CustomerCaseState | null }>(
    "/api/cases",
  );
}

export function saveExtraction(caseId: string, extraction: ExtractionResult) {
  return call<{ case: CustomerCaseState }>(`/api/cases/${caseId}/extraction`, {
    method: "PATCH",
    body: JSON.stringify({ extraction }),
  });
}

/**
 * Read a parking notice and persist it against the case.
 *
 * Extraction is a paid vision call, so it is authenticated, bound to a
 * case and rate limited server-side. The case must therefore exist
 * before the file is sent.
 */
export async function extractNotice(
  caseId: string,
  file: File,
): Promise<
  | { ok: true; data: { case: CustomerCaseState; extraction: ExtractionResult } }
  | { ok: false; code: string; message: string }
> {
  const form = new FormData();
  form.append("file", file);
  form.append("hint", file.name);

  try {
    const res = await fetch(`/api/cases/${caseId}/extract`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as Envelope<{
      case: CustomerCaseState;
      extraction: ExtractionResult;
    }> | null;
    if (!res.ok || !json?.success || !json.data) {
      return {
        ok: false,
        code: json?.error?.code ?? `HTTP_${res.status}`,
        message: json?.error?.message ?? "We could not read that notice.",
      };
    }
    return { ok: true, data: json.data };
  } catch (err) {
    return {
      ok: false,
      code: "NETWORK",
      message: err instanceof Error ? err.message : "Network error.",
    };
  }
}

/** Codes that mean "sign in and try again". */
export function isAuthFailure(code: string): boolean {
  return code === "UNAUTHENTICATED" || code === "HTTP_401";
}

export function confirmCase(caseId: string, confirmed: ConfirmedPcn) {
  return call<{ case: CustomerCaseState }>(`/api/cases/${caseId}/confirm`, {
    method: "PATCH",
    body: JSON.stringify({ confirmed }),
  });
}

export interface QuestionStep {
  questioningComplete: boolean;
  question: Question | null;
  answered: number;
  outstandingCount: number;
  outOfScope: { detail: string } | null;
  /** Set when the case needs a person rather than more questions. */
  needsReview: { detail: string } | null;
}

/**
 * Ask the server for the next question.
 *
 * POST because resolving one can call the model and always writes a
 * row. Still idempotent — an unanswered question is served again.
 */
export function fetchNextQuestion(caseId: string) {
  return call<QuestionStep>(`/api/cases/${caseId}/questions/next`, {
    method: "POST",
  });
}

export function submitAnswer(
  caseId: string,
  questionId: string,
  value: AnswerValue,
) {
  return call<QuestionStep>(`/api/cases/${caseId}/answers`, {
    method: "POST",
    body: JSON.stringify({ questionId, value }),
  });
}

export interface ReadinessView {
  sufficient: boolean;
  status: "INCOMPLETE" | "SUFFICIENT";
  blockers: string[];
  groundLabels: string[];
  evidence: { uploadedCount: number; suggestions: { label: string }[] };
  outOfScope: { detail: string } | null;
  paymentRequired: boolean;
  price: { amount: number; currency: string; description: string } | null;
  caseDetails: {
    publicId: string;
    operatorName: string | null;
    pcnNumber: string | null;
    vrm: string | null;
    parkingLocation: string | null;
    parkingEventDate: string | null;
  };
}

/** Run the sufficient-information check. */
export function checkReadiness(caseId: string) {
  return call<{ readiness: ReadinessView }>(
    `/api/cases/${caseId}/readiness`,
    { method: "POST" },
  );
}

/**
 * Upload an evidence file.
 *
 * One authenticated call does validation, storage and attachment — the
 * browser never handles a storage key, so it cannot bind arbitrary
 * objects to a case.
 */
export async function uploadEvidence(
  caseId: string,
  input: { file: File; evidenceType: string; description?: string },
): Promise<
  | { ok: true; data: { case: CustomerCaseState; documentId: string } }
  | { ok: false; code: string; message: string }
> {
  const form = new FormData();
  form.append("file", input.file);
  form.append("type", input.evidenceType);
  if (input.description) form.append("description", input.description);

  try {
    const res = await fetch(`/api/cases/${caseId}/evidence/upload`, {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    const json = (await res.json().catch(() => null)) as Envelope<{
      case: CustomerCaseState;
      documentId: string;
    }> | null;
    if (!res.ok || !json?.success || !json.data) {
      return {
        ok: false,
        code: json?.error?.code ?? `HTTP_${res.status}`,
        message: json?.error?.message ?? "Upload failed.",
      };
    }
    return { ok: true, data: json.data };
  } catch (err) {
    return {
      ok: false,
      code: "NETWORK",
      message: err instanceof Error ? err.message : "Network error.",
    };
  }
}

/** Ownership is re-checked server-side on every request to this URL. */
export function evidenceDownloadUrl(caseId: string, documentId: string) {
  return `/api/cases/${caseId}/evidence/${documentId}/download`;
}

export function removeEvidence(caseId: string, documentId: string) {
  return call<{ case: CustomerCaseState }>(
    `/api/cases/${caseId}/evidence/${documentId}`,
    { method: "DELETE" },
  );
}

/* ---------------------------- Payment ---------------------------- */

export interface CheckoutSessionView {
  checkoutUrl: string;
  provider: string;
  providerSessionId: string | null;
  status: PaymentStatusValue;
}

export type PaymentStatusValue =
  | "NOT_REQUIRED"
  | "UNPAID"
  | "CHECKOUT_CREATED"
  | "PENDING"
  | "PAID"
  | "REFUNDED"
  | "FAILED";

export interface PaymentStateView {
  status: PaymentStatusValue;
  required: boolean;
  amount: number | null;
  currency: string | null;
  description: string | null;
  checkoutUrl: string | null;
  provider: string;
  entitled: boolean;
}

export function startCheckout(caseId: string) {
  return call<{ checkout: CheckoutSessionView }>(
    `/api/cases/${caseId}/checkout`,
    { method: "POST" },
  );
}

/**
 * Read payment state. `verify` asks the provider directly — use it when
 * returning from checkout, because the redirect itself proves nothing.
 */
export function fetchPaymentState(caseId: string, verify = false) {
  return call<{ payment: PaymentStateView }>(
    `/api/cases/${caseId}/payment${verify ? "?verify=1" : ""}`,
  );
}

/** Demo provider only; the server refuses this when Stripe is active. */
export function confirmDemoPayment(caseId: string) {
  return call<{ payment: PaymentStateView }>(
    `/api/cases/${caseId}/payment/confirm-demo`,
    { method: "POST" },
  );
}

/* ---------------------------- Appeal ---------------------------- */

export interface AppealView {
  status: "READY" | "UNDER_REVIEW" | "FAILED" | "MANUAL_REVIEW";
  paragraphs: { id: string; text: string }[];
  groundLabels: string[];
  needsReview: boolean;
  reviewDetail: string | null;
  generatedAt: string;
}

/**
 * Fetch the appeal, generating it on first call. Returns 402 until the
 * case is paid, so this is safe to call from the success page.
 */
export function fetchAppeal(caseId: string) {
  return call<{ appeal: AppealView }>(`/api/cases/${caseId}/appeal`);
}

export function documentUrl(caseId: string, format: "pdf" | "docx") {
  return `/api/cases/${caseId}/document?format=${format}`;
}

/* ---------------------------- Outcome ---------------------------- */

export type OutcomeStatusValue =
  | "PENDING"
  | "NO_RESPONSE"
  | "ACCEPTED"
  | "REJECTED";

export interface OutcomeView {
  outcomeStatus: OutcomeStatusValue;
  outcomeRecordedAt: string | null;
  submittedAt: string | null;
  followUpDue: boolean;
  secondStageMayApply: boolean;
}

/**
 * Record what the parking operator decided.
 *
 * Independent of the workflow: a completed appeal stays completed
 * whatever the answer.
 */
export function recordOutcome(
  caseId: string,
  outcomeStatus: OutcomeStatusValue,
  detail?: string,
) {
  return call<{ outcome: OutcomeView }>(`/api/cases/${caseId}/outcome`, {
    method: "POST",
    body: JSON.stringify({ outcomeStatus, detail }),
  });
}
