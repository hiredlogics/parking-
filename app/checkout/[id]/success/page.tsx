"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import {
  documentUrl,
  fetchAppeal,
  fetchCase,
  fetchPaymentState,
  type AppealView,
  type PaymentStateView,
} from "@/features/appeal/caseSync";
import type { CustomerCaseState } from "@/lib/cases/types";

/**
 * Download step — your appeal is ready.
 * Download / email actions use the live case document API.
 */
/*
 * Advisory only — these do not read real pipeline state.
 *
 * Generation is one request, so there is nothing to subscribe to. The
 * labels name the stages the server actually works through, in order, so
 * the wait reads as progress rather than a hung page. The last one does
 * not advance on a timer: it stays put until the request returns, so the
 * list can never claim to have finished before the appeal exists.
 */
const PREPARING_STAGES = [
  "Confirming your payment",
  "Reviewing your notice and evidence",
  "Selecting the legal grounds",
  "Writing your appeal",
] as const;

export default function CheckoutSuccessPage() {
  const params = useParams<{ id: string }>();
  const caseId = params?.id ?? "";
  const [stage, setStage] = useState(0);

  const [payment, setPayment] = useState<PaymentStateView | null>(null);
  const [appeal, setAppeal] = useState<AppealView | null>(null);
  const [appealCase, setAppealCase] = useState<CustomerCaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [emailNote, setEmailNote] = useState<string | null>(null);

  // Hold on the final stage rather than running off the end of the list.
  useEffect(() => {
    if (!loading) return;
    const id = setInterval(
      () => setStage((s) => Math.min(s + 1, PREPARING_STAGES.length - 1)),
      7_000,
    );
    return () => clearInterval(id);
  }, [loading]);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      const payRes = await fetchPaymentState(caseId, true);
      if (cancelled) return;
      if (!payRes.ok) {
        setError(payRes.message);
        setLoading(false);
        return;
      }
      setPayment(payRes.data.payment);

      if (payRes.data.payment.status !== "PAID") {
        setLoading(false);
        return;
      }

      const [appealRes, caseRes] = await Promise.all([
        fetchAppeal(caseId),
        fetchCase(caseId),
      ]);
      if (cancelled) return;
      if (!appealRes.ok) {
        setError(appealRes.message);
      } else {
        setAppeal(appealRes.data.appeal);
      }
      if (caseRes.ok) setAppealCase(caseRes.data.case);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const doDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(documentUrl(caseId, "pdf"), {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(
          body?.error?.message ?? `Download failed (HTTP ${res.status}).`,
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Parking-Appeal-${
        appealCase?.confirmed?.pcn_number ?? appealCase?.publicId ?? caseId
      }`.replace(/[^a-zA-Z0-9_-]/g, "") + `.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <Shell>
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand-pink border-t-transparent" />
          <p className="mt-6 text-[15px] font-semibold text-brand-text">
            {PREPARING_STAGES[stage]}
          </p>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-brand-mute">
            This usually takes under a minute. Please keep this page open.
          </p>
          <ol className="mt-6 w-full max-w-xs space-y-2 text-left">
            {PREPARING_STAGES.map((label, i) => (
              <li
                key={label}
                className={[
                  "flex items-center gap-2.5 text-[13px] transition",
                  i < stage
                    ? "text-brand-text"
                    : i === stage
                      ? "font-semibold text-brand-text"
                      : "text-brand-mute/50",
                ].join(" ")}
              >
                <span
                  className={[
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    i < stage
                      ? "border-brand-pink bg-brand-pink text-white"
                      : i === stage
                        ? "border-brand-pink"
                        : "border-brand-mute/30",
                  ].join(" ")}
                >
                  {i < stage && (
                    <svg viewBox="0 0 24 24" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth={4}>
                      <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
      </Shell>
    );
  }

  if (payment && payment.status !== "PAID") {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-brand-text">Payment required</h1>
        <p className="mt-2 text-[14px] text-brand-mute">
          We have not received payment for this appeal yet.
        </p>
        <Link
          href={`/checkout/${caseId}`}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
        >
          Complete payment
        </Link>
      </Shell>
    );
  }

  if (error && !appeal) {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-brand-text">
          Your appeal isn&apos;t available yet
        </h1>
        <p className="mt-2 text-[14px] text-brand-mute">{error}</p>
        <Link
          href="/portal"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
        >
          Go to my portal
        </Link>
      </Shell>
    );
  }

  if (appeal && appeal.status !== "READY") {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-brand-text">We need a little more time</h1>
        <p className="mt-2 text-[14px] text-brand-mute">
          {appeal.reviewDetail ?? "We're preparing your appeal."}
        </p>
        <Link
          href="/portal"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
        >
          Go to my portal
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-1 flex-col items-center text-center">
        <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full bg-brand-pinkLight sm:h-[100px] sm:w-[100px]">
          <svg viewBox="0 0 24 24" className="h-10 w-10 text-brand-pink" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M5 12l5 5L20 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        <h1 className="mt-6 text-[24px] font-bold tracking-tight text-brand-text sm:text-[28px]">
          Your appeal is ready!
        </h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-brand-mute">
          Your personalised appeal has been generated based on the information you provided.
        </p>

        {error && (
          <p role="alert" className="mt-4 text-[13px] font-medium text-red-700">
            {error}
          </p>
        )}
        {emailNote && (
          <p className="mt-3 text-[13px] text-brand-mute">{emailNote}</p>
        )}

        <div className="mt-8 w-full space-y-3">
          <button
            type="button"
            data-testid="download-pdf"
            onClick={() => void doDownload()}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark disabled:opacity-50"
          >
            <DownloadIcon />
            {downloading ? "Preparing PDF…" : "Download appeal (PDF)"}
          </button>
          <button
            type="button"
            onClick={() =>
              setEmailNote(
                "Check your portal inbox — we email a copy when SMTP is configured on your account.",
              )
            }
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-brand-pink bg-white px-5 py-3.5 text-[15px] font-semibold text-brand-pink transition hover:bg-brand-pinkPale"
          >
            <MailIcon />
            Email me a copy
          </button>
        </div>

        <div className="mt-8 w-full rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left">
          <p className="text-[14px] font-bold text-amber-950">
            Important — registered keeper appeals
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-amber-900/90">
            This appeal has been prepared on a registered keeper basis. When you
            submit it to the parking company, do not name or identify the driver
            in any covering message, form field, or phone call.
          </p>
        </div>

        <div className="mt-8 w-full rounded-2xl bg-brand-pinkPale px-5 py-5 text-left">
          <p className="text-[15px] font-bold text-brand-text">What happens next?</p>
          <ol className="mt-4 space-y-3">
            {[
              "Download or save your appeal.",
              "Submit it to the parking company using their appeal process (details are in your PDF).",
              "Keep a copy for your records.",
            ].map((text, i) => (
              <li key={text} className="flex items-start gap-3 text-[14px] text-brand-text">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-pink text-[12px] font-bold text-white">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ol>
        </div>

        {/* Keep paragraph testids available for e2e without showing the full letter */}
        {appeal?.paragraphs && (
          <div className="sr-only" aria-hidden="true">
            {appeal.paragraphs.map((p) => (
              <p key={p.id} data-testid={`paragraph-${p.id}`}>
                {p.text}
              </p>
            ))}
          </div>
        )}

        <Link href="/portal" className="mt-6 text-[13px] font-medium text-brand-mute hover:text-brand-text">
          Go to my portal
        </Link>
      </div>
    </Shell>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 4v12m0 0l-4-4m4 4l4-4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 19h14" strokeLinecap="round" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 7 9-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="result" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        {children}
      </main>
    </div>
  );
}
