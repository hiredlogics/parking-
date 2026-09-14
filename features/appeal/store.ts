"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AllAnswers,
  BranchAnswers,
  ConfirmedPcn,
  CoreAnswers,
  EvidenceItem,
  ExtractedPcn,
  ExtractionResult,
  ScenarioTag,
} from "@/types";
import { EMPTY_ANSWERS } from "@/types";
import { toLegacyAnswers } from "@/lib/questions/toLegacyAnswers";
import type { AnswerMap } from "@/lib/questions/types";

/**
 * Client-side appeal session store.
 *
 * Values are persisted in localStorage so a customer can refresh without
 * losing progress. This is a demo store; production would put this data
 * behind an authenticated session server-side.
 *
 * When earlier core answers change we invalidate later branch answers
 * that are no longer relevant, per pack requirements.
 */
export interface AppealSessionState {
  /**
   * Server case id. PostgreSQL is the source of truth; this is the key
   * used to rehydrate after a refresh. Everything else in this store is
   * a cache of `/api/cases/[id]`.
   */
  caseId?: string;
  /** Public reference shown to the customer, e.g. CASE-2026-000042. */
  casePublicId?: string;

  // Upload / extraction
  fileName?: string;
  fileMimeType?: string;
  fileSizeBytes?: number;
  fileBase64?: string;
  extraction?: ExtractionResult;

  // Confirmation
  confirmed?: ConfirmedPcn;

  // Answers
  answers: AllAnswers;

  /**
   * Adaptive engine answers (V2 Part 4). Fact-keyed rather than
   * form-shaped. `answers` above is kept in sync via toLegacyAnswers()
   * so the rules engine and keeper-safe validator keep working as
   * guardrails.
   */
  adaptiveAnswers: Record<string, unknown>;

  // Evidence
  evidence: EvidenceItem[];

  // Progress
  currentStep:
    | "upload"
    | "confirm"
    | "questions"
    | "evidence"
    | "review"
    | "result";
}

interface AppealSessionActions {
  /** Bind the browser session to a server case. */
  setCaseId(caseId: string, publicId?: string): void;
  /** Replace cached state from the server's customer-safe case view. */
  hydrateFromCase(state: {
    id: string;
    publicId: string;
    extraction: ExtractionResult | null;
    confirmed: ConfirmedPcn | null;
    adaptiveAnswers: Record<string, unknown>;
    evidence: EvidenceItem[];
  }): void;
  setFile(file: { name: string; mimeType: string; sizeBytes: number; base64: string }): void;
  setExtraction(result: ExtractionResult): void;
  setConfirmedPcn(pcn: ConfirmedPcn): void;
  updateExtractedField<K extends keyof ExtractedPcn>(key: K, value: ExtractedPcn[K]): void;
  setCoreAnswers(patch: Partial<CoreAnswers>): void;
  setBranchAnswers(patch: Partial<BranchAnswers>): void;
  /** Replace the adaptive answer map and re-derive legacy answers. */
  setAdaptiveAnswers(answers: Record<string, unknown>): void;
  resetAdaptiveAnswers(): void;
  addEvidence(item: EvidenceItem): void;
  removeEvidence(id: string): void;
  setStep(step: AppealSessionState["currentStep"]): void;
  reset(): void;
}

const initial: AppealSessionState = {
  answers: EMPTY_ANSWERS,
  adaptiveAnswers: {},
  evidence: [],
  currentStep: "upload",
};

export const useAppealStore = create<AppealSessionState & AppealSessionActions>()(
  persist(
    (set) => ({
      ...initial,
      setCaseId: (caseId, casePublicId) =>
        set(() => ({ caseId, casePublicId })),
      hydrateFromCase: (state) =>
        set(() => ({
          caseId: state.id,
          casePublicId: state.publicId,
          extraction: state.extraction ?? undefined,
          confirmed: state.confirmed ?? undefined,
          adaptiveAnswers: state.adaptiveAnswers,
          answers: toLegacyAnswers(state.adaptiveAnswers as AnswerMap),
          evidence: state.evidence,
        })),
      setFile: (file) =>
        set(() => ({
          fileName: file.name,
          fileMimeType: file.mimeType,
          fileSizeBytes: file.sizeBytes,
          fileBase64: file.base64,
        })),
      setExtraction: (result) => set(() => ({ extraction: result })),
      setConfirmedPcn: (pcn) => set(() => ({ confirmed: pcn })),
      updateExtractedField: (key, value) =>
        set((state) => {
          if (!state.extraction) return {};
          return {
            extraction: {
              ...state.extraction,
              raw: { ...state.extraction.raw, [key]: value },
            },
          };
        }),
      setCoreAnswers: (patch) =>
        set((state) => {
          const nextCore: CoreAnswers = { ...state.answers.core, ...patch };
          const nextBranch = invalidateBranchesForCore(state.answers.branch, nextCore);
          return { answers: { core: nextCore, branch: nextBranch } };
        }),
      setBranchAnswers: (patch) =>
        set((state) => ({
          answers: {
            core: state.answers.core,
            branch: mergeBranch(state.answers.branch, patch),
          },
        })),
      setAdaptiveAnswers: (adaptiveAnswers) =>
        set(() => ({
          adaptiveAnswers,
          // Keep the deterministic pipeline fed from the same source of truth.
          answers: toLegacyAnswers(adaptiveAnswers as AnswerMap),
        })),
      resetAdaptiveAnswers: () =>
        set(() => ({ adaptiveAnswers: {}, answers: EMPTY_ANSWERS })),
      addEvidence: (item) => set((state) => ({ evidence: [...state.evidence, item] })),
      removeEvidence: (id) =>
        set((state) => ({ evidence: state.evidence.filter((e) => e.id !== id) })),
      setStep: (step) => set(() => ({ currentStep: step })),
      reset: () => set(() => ({ ...initial, answers: { core: { scenarios: [] }, branch: {} } })),
    }),
    {
      name: "pag-appeal-session",
      version: 2,
      storage: createJSONStorage(() => {
        if (typeof window === "undefined") {
          const memoryStorage: Storage = {
            length: 0,
            clear: () => {},
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            key: () => null,
          };
          return memoryStorage;
        }
        return window.localStorage;
      }),
      partialize: (state) => ({
        caseId: state.caseId,
        casePublicId: state.casePublicId,
        fileName: state.fileName,
        fileMimeType: state.fileMimeType,
        fileSizeBytes: state.fileSizeBytes,
        fileBase64: state.fileBase64,
        extraction: state.extraction,
        confirmed: state.confirmed,
        answers: state.answers,
        adaptiveAnswers: state.adaptiveAnswers,
        evidence: state.evidence,
        currentStep: state.currentStep,
      }),
    },
  ),
);

function mergeBranch(existing: BranchAnswers, patch: Partial<BranchAnswers>): BranchAnswers {
  return {
    keeper: patch.keeper ? { ...existing.keeper, ...patch.keeper } : existing.keeper,
    payment: patch.payment ? { ...existing.payment, ...patch.payment } : existing.payment,
    keying: patch.keying ? { ...existing.keying, ...patch.keying } : existing.keying,
    consideration: patch.consideration
      ? { ...existing.consideration, ...patch.consideration }
      : existing.consideration,
    grace: patch.grace ? { ...existing.grace, ...patch.grace } : existing.grace,
    anpr: patch.anpr ? { ...existing.anpr, ...patch.anpr } : existing.anpr,
    authorisation: patch.authorisation
      ? { ...existing.authorisation, ...patch.authorisation }
      : existing.authorisation,
    signage: patch.signage ? { ...existing.signage, ...patch.signage } : existing.signage,
    landowner: patch.landowner ? { ...existing.landowner, ...patch.landowner } : existing.landowner,
  };
}

/**
 * Drop branch answers that are no longer relevant given the core state.
 * "invalidate answers that are no longer relevant" per pack.
 */
function invalidateBranchesForCore(branch: BranchAnswers, next: CoreAnswers): BranchAnswers {
  const has = (s: ScenarioTag) => next.scenarios.includes(s);
  const result: BranchAnswers = { ...branch };

  if (!(next.registered_keeper === "YES" && next.driver_identified === "NO") &&
      !has("postal_ntk_timing_issue") && !has("no_ntk_received") &&
      next.notice_route !== "POSTAL") {
    delete result.keeper;
  }
  if (!has("payment_made") && !has("payment_attempted_failed")) delete result.payment;
  if (!has("vrm_error") && !has("payment_made")) delete result.keying;
  if (!has("short_stay_consideration")) delete result.consideration;
  if (!has("grace_or_exit")) delete result.grace;
  if (!has("anpr_disputed") && !has("multiple_visits_same_day")) delete result.anpr;
  if (!has("authorised_or_permit")) delete result.authorisation;
  if (!has("signage_issue")) delete result.signage;
  if (!has("landowner_authority_challenge")) delete result.landowner;

  return result;
}
