"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { AdaptiveQuestion } from "@/features/appeal/AdaptiveQuestion";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  fetchNextQuestion,
  saveKeeperProfile,
  submitAnswer,
  type QuestionStep,
} from "@/features/appeal/caseSync";
import {
  KeeperDetailsForm,
  keeperProfileFrom,
  needsKeeperDetails,
} from "@/features/appeal/KeeperDetails";
import type { AnswerValue } from "@/lib/facts/types";

type Phase = "pending" | "keeper" | "questions";

/**
 * Your situation — registered keeper details (when needed) then adaptive Q&A.
 * Triggered after confirm “Looks correct, continue”.
 */
export default function QuestionsPage() {
  const router = useRouter();
  const confirmed = useAppealStore((s) => s.confirmed);
  const adaptiveAnswers = useAppealStore((s) => s.adaptiveAnswers);
  const setAdaptiveAnswers = useAppealStore((s) => s.setAdaptiveAnswers);
  const setStep = useAppealStore((s) => s.setStep);

  const [phase, setPhase] = useState<Phase>("pending");
  const [state, setState] = useState<QuestionStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedForCaseRef = useRef<string | null>(null);

  const { caseId, status: sessionStatus } = useCaseSession();

  const route = confirmed?.notice_route;
  // Windscreen / unclear notices need keeper name + address for the letter.
  // Postal NTKs already carry keeper details — skip unless somehow missing later.
  const needsKeeperForm = needsKeeperDetails(adaptiveAnswers, route);

  useEffect(() => {
    if (sessionStatus !== "ready") return;
    if (!confirmed) {
      setPhase("pending");
      return;
    }
    setPhase(needsKeeperForm ? "keeper" : "questions");
  }, [sessionStatus, confirmed, needsKeeperForm]);

  const load = useCallback(async () => {
    if (!caseId) return;
    setLoadingQuestion(true);
    setError(null);
    const res = await fetchNextQuestion(caseId);
    setLoadingQuestion(false);
    if (!res.ok) {
      setError(res.message || "We could not load the next question.");
      return;
    }
    setState(res.data);
  }, [caseId]);

  useEffect(() => {
    if (sessionStatus !== "ready" || !caseId) return;
    if (phase !== "questions") return;
    if (loadedForCaseRef.current === caseId) return;
    loadedForCaseRef.current = caseId;
    void load();
  }, [load, sessionStatus, caseId, phase]);

  const answer = async (
    value: AnswerValue,
    meta?: { situation_other?: string },
  ) => {
    if (!caseId || !state?.question) return;
    setBusy(true);
    setError(null);
    if (meta?.situation_other) {
      await saveKeeperProfile(caseId, { situation_other: meta.situation_other });
    }
    const res = await submitAnswer(caseId, state.question.questionId, value);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "That answer could not be saved.");
      return;
    }
    setState(res.data);
  };

  if (sessionStatus === "loading" || phase === "pending") {
    return (
      <Shell>
        <div className="h-40 animate-pulse rounded-2xl bg-brand-pinkPale" />
      </Shell>
    );
  }

  if (!confirmed) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="text-[22px] font-bold text-brand-text">Confirm your notice first</h1>
          <p className="mt-2 text-[14px] text-brand-mute">
            We need the details from your parking notice before we can ask anything useful.
          </p>
          <Link
            href="/appeal/upload"
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
          >
            Start upload
          </Link>
        </div>
      </Shell>
    );
  }

  if (phase === "keeper") {
    return (
      <Shell>
        <KeeperDetailsForm
          caseId={caseId!}
          windscreen={route === "WINDSCREEN" || route === "UNKNOWN" || !route}
          initial={keeperProfileFrom(adaptiveAnswers)}
          onSaved={(answers) => {
            setAdaptiveAnswers(answers);
            setPhase("questions");
            loadedForCaseRef.current = null;
          }}
        />
      </Shell>
    );
  }

  return (
    <Shell>
      {error && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
        >
          <p>{error}</p>
          <button
            type="button"
            className="mt-3 text-[13px] font-semibold text-brand-pink"
            onClick={() => {
              loadedForCaseRef.current = null;
              void load();
            }}
          >
            Try again
          </button>
        </div>
      )}

      {loadingQuestion && !state && <NextQuestionLoading />}

      {state?.outOfScope || state?.needsReview ? (
        <div>
          <h1 className="text-[22px] font-bold text-brand-text">
            {state.outOfScope ? "This notice is past the appeal stage" : "Under review"}
          </h1>
          <p className="mt-2 text-[14px] text-brand-mute">
            {(state.outOfScope ?? state.needsReview)?.detail ??
              "We're reviewing your appeal."}
          </p>
          {state.outOfScope ? (
            <div className="mt-6 space-y-3">
              <Link
                href="/services"
                className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
              >
                See Expert Help options
              </Link>
              <Link
                href="/#contact"
                className="flex w-full items-center justify-center rounded-xl border border-brand-border bg-white px-5 py-3.5 text-[15px] font-semibold text-brand-text"
              >
                Contact our team
              </Link>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setStep("evidence");
                router.push("/appeal/evidence");
              }}
              className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
            >
              Continue
            </button>
          )}
        </div>
      ) : state?.questioningComplete ? (
        <div>
          <h1 className="text-[22px] font-bold text-brand-text">
            That&apos;s everything we need
          </h1>
          <p className="mt-2 text-[14px] text-brand-mute">
            Next you can attach any supporting evidence, then review your information.
          </p>
          <button
            type="button"
            data-testid="questions-complete-continue"
            onClick={() => {
              setStep("evidence");
              router.push("/appeal/evidence");
            }}
            className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
          >
            Continue
          </button>
        </div>
      ) : state?.question ? (
        <AdaptiveQuestion
          question={state.question}
          busy={busy}
          onSubmit={(v) => void answer(v)}
        />
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="questions" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        {children}
      </main>
    </div>
  );
}

/**
 * Working out the next question re-analyses the case and can call an AI
 * model twice (a rejected first attempt is regenerated once), so this can
 * genuinely take upwards of a minute. A silent pulsing box for that long
 * reads as broken, not busy — the copy escalates so a slow-but-working
 * wait stays legible.
 */
function NextQuestionLoading() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const t1 = window.setTimeout(() => setStage(1), 8_000);
    const t2 = window.setTimeout(() => setStage(2), 25_000);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  const copy = [
    "Working out what to ask next based on your case...",
    "Still thinking — checking your situation against the relevant rules...",
    "Almost there — this one is taking a little longer than usual...",
  ][stage];

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-40 flex-col items-center justify-center gap-3 rounded-2xl bg-brand-pinkPale px-6 text-center"
    >
      <svg
        className="h-6 w-6 animate-spin text-brand-pink"
        viewBox="0 0 24 24"
        fill="none"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      <p className="text-[14px] font-medium text-brand-text">{copy}</p>
    </div>
  );
}
