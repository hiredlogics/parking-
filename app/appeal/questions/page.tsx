"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppHeader } from "@/components/app/AppHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { AdaptiveQuestion } from "@/features/appeal/AdaptiveQuestion";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  fetchNextQuestion,
  submitAnswer,
  type QuestionStep,
} from "@/features/appeal/caseSync";
import { ShieldIcon } from "@/components/landing/Icons";
import type { AnswerValue } from "@/lib/questions/types";

/**
 * Adaptive questionnaire — ONE question at a time.
 *
 * MASTER Developer Pack V2 Part 4. The customer never sees the full
 * question set, and questions already answered by the confirmed notice
 * are never asked. Progress wording stays generic: we do not promise a
 * fixed number of questions or "5 minutes".
 */
export default function QuestionsPage() {
  const router = useRouter();
  const confirmed = useAppealStore((s) => s.confirmed);
  const setStep = useAppealStore((s) => s.setStep);

  const [state, setState] = useState<QuestionStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // The server owns the answer map, so the page only needs the case id.
  const { caseId, status: sessionStatus } = useCaseSession();

  const load = useCallback(async () => {
    if (!caseId) return;
    setError(null);
    const res = await fetchNextQuestion(caseId);
    if (!res.ok) {
      setError(res.message || "We could not load the next question.");
      return;
    }
    setState(res.data);
  }, [caseId]);

  useEffect(() => {
    if (sessionStatus !== "ready" || loadedRef.current) return;
    loadedRef.current = true;
    void load();
  }, [load, sessionStatus]);

  const answer = async (value: AnswerValue) => {
    if (!caseId || !state?.question) return;
    setBusy(true);
    setError(null);
    const res = await submitAnswer(caseId, state.question.questionId, value);
    setBusy(false);
    if (!res.ok) {
      setError(res.message || "That answer could not be saved.");
      return;
    }
    setState(res.data);
  };

  if (sessionStatus === "loading") {
    return (
      <div className="app-shell">
        <AppHeader />
        <ProgressSteps current="questions" />
        <main className="container-page py-14">
          <div className="mx-auto max-w-2xl app-card">
            <div className="h-24 animate-pulse rounded-xl bg-brand-canvas" />
          </div>
        </main>
      </div>
    );
  }

  if (!confirmed) {
    return (
      <div className="app-shell">
        <AppHeader />
        <ProgressSteps current="questions" />
        <main className="container-page py-14">
          <div className="mx-auto max-w-2xl app-card">
            <h1 className="text-2xl font-black tracking-tight">
              Confirm your notice first
            </h1>
            <p className="mt-2 text-brand-mute">
              We need the details from your parking notice before we can ask
              anything useful.
            </p>
            <Link href="/appeal/upload" className="btn-brand-primary mt-4">
              Start upload
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <AppHeader />
      <ProgressSteps current="questions" />
      <main className="container-page py-8 sm:py-10 lg:py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6">
            <span className="app-badge">
              <ShieldIcon className="h-3.5 w-3.5" /> We never ask who was driving
            </span>
            <p className="mt-3 text-[14px] leading-relaxed text-brand-mute">
              We ask one question at a time, and only what your notice does not
              already tell us. How many there are depends on your case.
            </p>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              {error}
            </div>
          )}

          {/* Out of scope, or we could not resolve the case automatically */}
          {state?.outOfScope || state?.needsReview ? (
            <div className="app-card">
              <h1 className="text-[20px] font-black tracking-tight sm:text-[24px]">
                This case needs a person to look at it
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-brand-mute">
                {(state.outOfScope ?? state.needsReview)?.detail}
              </p>
              <p className="mt-3 text-[13px] text-brand-mute">
                Nothing you have entered is lost. Our team can pick this up
                rather than us generating something that may not fit your
                situation.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href="/portal" className="btn-brand-primary">
                  Go to my portal
                </Link>
                <Link href="/appeal/confirm" className="btn-brand-ghost">
                  Back to details
                </Link>
              </div>
            </div>
          ) : state?.questioningComplete ? (
            <div className="app-card">
              <h1 className="text-[20px] font-black tracking-tight sm:text-[24px]">
                That&apos;s everything we need
              </h1>
              <p className="mt-3 text-[14px] leading-relaxed text-brand-mute">
                Thank you. The next step is to attach any supporting evidence
                you have — we will only refer to evidence you actually provide.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep("evidence");
                    router.push("/appeal/evidence");
                  }}
                  className="btn-brand-primary"
                  data-testid="questions-complete-continue"
                >
                  Continue to evidence
                </button>
                <Link href="/appeal/confirm" className="btn-brand-ghost">
                  Back to details
                </Link>
              </div>
            </div>
          ) : state?.question ? (
            <>
              <AdaptiveQuestion
                question={state.question}
                busy={busy}
                onSubmit={answer}
              />
              <p className="mt-4 text-center text-[12px] text-brand-mute">
                {state.answered === 0
                  ? "First question"
                  : `${state.answered} answered so far`}
              </p>
            </>
          ) : (
            <div className="app-card">
              <div className="h-24 animate-pulse rounded-xl bg-brand-canvas" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
