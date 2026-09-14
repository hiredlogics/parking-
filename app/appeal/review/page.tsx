"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app/AppHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  checkReadiness,
  startCheckout,
  type ReadinessView,
} from "@/features/appeal/caseSync";
import { EVIDENCE_TYPE_LABELS } from "@/types";
import { ArrowRightIcon, CheckIcon, ShieldIcon } from "@/components/landing/Icons";

/**
 * Pre-payment summary — the sufficient-information gate.
 *
 * What the customer sees here is deliberately limited to:
 *   - the confirmed notice details,
 *   - the identified grounds in plain language,
 *   - evidence status,
 *   - whether we have enough information.
 *
 * No appeal wording exists at this point in the workflow: drafting sits
 * behind the payment gate. Nothing on this page exposes route
 * identifiers, knowledge-module IDs, legal reasoning, confidence scores
 * or validator information.
 */
export default function ReviewPage() {
  const router = useRouter();
  const evidence = useAppealStore((s) => s.evidence);
  const setStep = useAppealStore((s) => s.setStep);

  const { caseId, status: sessionStatus } = useCaseSession();
  const [readiness, setReadiness] = useState<ReadinessView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [startingCheckout, setStartingCheckout] = useState(false);
  const ranRef = useRef(false);

  const run = useCallback(async () => {
    if (!caseId) {
      setChecking(false);
      return;
    }
    setChecking(true);
    setError(null);
    const res = await checkReadiness(caseId);
    setChecking(false);
    if (!res.ok) {
      setError(res.message || "We could not check your appeal.");
      return;
    }
    setReadiness(res.data.readiness);
  }, [caseId]);

  useEffect(() => {
    if (sessionStatus !== "ready" || ranRef.current) return;
    ranRef.current = true;
    void run();
  }, [run, sessionStatus]);

  /**
   * Ask the server to open a checkout session and follow wherever the
   * payment provider says to go. For the demo provider that is the local
   * checkout page; for Stripe it is a hosted page on their domain.
   */
  const onContinue = async () => {
    if (!caseId) return;
    setStartingCheckout(true);
    setError(null);
    const res = await startCheckout(caseId);
    if (!res.ok) {
      setStartingCheckout(false);
      if (res.code === "UNAUTHENTICATED") {
        router.push(`/signin?next=${encodeURIComponent("/appeal/review")}`);
        return;
      }
      setError(res.message || "We could not start checkout.");
      return;
    }
    setStep("result");
    const url = res.data.checkout.checkoutUrl;
    if (url.startsWith("http")) {
      window.location.assign(url);
      return;
    }
    router.push(url);
  };

  if (sessionStatus === "loading" || checking) {
    return (
      <Shell>
        <div className="app-card">
          <div className="h-40 animate-pulse rounded-xl bg-brand-canvas" />
        </div>
      </Shell>
    );
  }

  if (!caseId || (!readiness && !error)) {
    return (
      <Shell>
        <div className="app-card">
          <h1 className="text-2xl font-black tracking-tight">
            Nothing to review yet
          </h1>
          <p className="mt-2 text-brand-mute">
            Please complete the earlier steps first.
          </p>
          <Link href="/appeal/upload" className="btn-brand-primary mt-4">
            Start upload
          </Link>
        </div>
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell>
        <div className="app-card">
          <h1 className="text-2xl font-black tracking-tight">
            We hit a problem
          </h1>
          <p className="mt-2 text-brand-mute">{error}</p>
          <button type="button" onClick={run} className="btn-brand-primary mt-4">
            Try again
          </button>
        </div>
      </Shell>
    );
  }

  const r = readiness!;

  return (
    <Shell>
      <div className="mb-6">
        <span className="app-badge">
          <ShieldIcon className="h-3.5 w-3.5" />{" "}
          {r.sufficient ? "Ready to prepare" : "A little more needed"}
        </span>
        <h1 className="mt-3 text-[24px] font-black tracking-tight sm:text-[30px]">
          {r.sufficient
            ? "We have enough information to prepare your appeal."
            : "We need a little more information"}
        </h1>
        <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-brand-mute">
          {r.sufficient
            ? "Here is a summary of what we will base your appeal on. After checkout we prepare it for review, then you can view and download the PDF."
            : "Please complete the outstanding items below and we will check again."}
        </p>
      </div>

      {/* Confirmed notice details */}
      <section className="app-card">
        <p className="app-section-title">Your notice</p>
        <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Detail label="Reference" value={r.caseDetails.publicId} mono />
          <Detail label="Operator" value={r.caseDetails.operatorName} />
          <Detail label="PCN number" value={r.caseDetails.pcnNumber} mono />
          <Detail label="Vehicle" value={r.caseDetails.vrm} mono />
          <Detail label="Location" value={r.caseDetails.parkingLocation} />
          <Detail label="Date of event" value={r.caseDetails.parkingEventDate} />
        </dl>
      </section>

      {/* Identified grounds, plain language only */}
      {r.groundLabels.length > 0 && (
        <section className="app-card mt-4">
          <p className="app-section-title">
            What we will argue on your behalf
          </p>
          <ul className="mt-4 space-y-2">
            {r.groundLabels.map((label) => (
              <li
                key={label}
                className="flex items-start gap-3 rounded-xl border border-brand-green/30 bg-white px-4 py-3 text-[14px]"
              >
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-green text-white">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Evidence status */}
      <section className="app-card mt-4">
        <p className="app-section-title">Supporting evidence</p>
        {evidence.length === 0 ? (
          <p className="mt-3 text-[14px] text-brand-mute">
            No evidence uploaded. Your appeal can still be prepared, and we
            will only refer to evidence you actually provide.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {evidence.map((e) => (
              <li key={e.id} className="text-[14px] text-brand-text">
                {(EVIDENCE_TYPE_LABELS as Record<string, string>)[e.type] ??
                  "Supporting evidence"}
                <span className="text-brand-mute"> — {e.fileName}</span>
              </li>
            ))}
          </ul>
        )}

        {r.evidence.suggestions.length > 0 && (
          <div className="mt-4 rounded-xl border border-brand-borderSoft bg-brand-canvas p-4">
            <p className="text-[13px] font-semibold text-brand-text">
              These would strengthen your appeal
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-brand-mute">
              {r.evidence.suggestions.map((s) => (
                <li key={s.label}>{s.label}</li>
              ))}
            </ul>
            <Link href="/appeal/evidence" className="btn-brand-ghost mt-3">
              Add evidence
            </Link>
          </div>
        )}
      </section>

      {/* Outstanding items */}
      {!r.sufficient && (
        <section className="app-card mt-4 border-amber-200 bg-amber-50">
          <p className="text-[13px] font-semibold text-amber-900">
            Before we can prepare your appeal
          </p>
          {r.blockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[13.5px] text-amber-900">
              {r.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13.5px] text-amber-900">
              Please finish any remaining questions, then check again.
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/appeal/questions" className="btn-brand-primary">
              Continue questions
            </Link>
            <button type="button" onClick={run} className="btn-brand-ghost">
              Check again
            </button>
          </div>
        </section>
      )}

      {/* Checkout gate */}
      <div className="mt-6 flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/appeal/evidence" className="btn-brand-ghost">
          Back
        </Link>
        {r.sufficient && (
          <button
            type="button"
            onClick={onContinue}
            disabled={startingCheckout}
            className="btn-brand-primary"
            data-testid="review-continue"
          >
            {startingCheckout
              ? "Starting checkout…"
              : r.paymentRequired && r.price
                ? `Continue to checkout · £${r.price.amount.toFixed(2)}`
                : "Continue"}{" "}
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {r.sufficient && r.paymentRequired && (
        <p className="mt-3 text-center text-[12px] text-brand-mute">
          After payment we prepare your appeal for review. You can view and
          download the PDF once it is ready in your portal.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell">
      <AppHeader />
      <ProgressSteps current="review" />
      <main className="container-page py-8 sm:py-10 lg:py-12">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-mute">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-[14px] font-medium text-brand-text ${
          mono ? "font-mono" : ""
        }`}
      >
        {value == null || value === "" ? "—" : value}
      </dd>
    </div>
  );
}
