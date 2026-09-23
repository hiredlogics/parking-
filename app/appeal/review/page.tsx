"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { JourneyHeader } from "@/components/app/JourneyHeader";
import { ProgressSteps } from "@/components/ProgressSteps";
import { useAppealStore } from "@/features/appeal/store";
import { useCaseSession } from "@/features/appeal/useCaseSession";
import {
  checkReadiness,
  startCheckout,
  type ReadinessView,
} from "@/features/appeal/caseSync";
import {
  formatMoney,
  formatSituationLabel,
  formatUkDate,
  followUpReviewRows,
} from "@/lib/appeals/displayLabels";
import { EVIDENCE_TYPE_LABELS } from "@/types";

/**
 * Review your information — step 4 chrome (Payment).
 * All fields are bound to the live case / store (nothing hardcoded).
 */
export default function ReviewPage() {
  const router = useRouter();
  const confirmed = useAppealStore((s) => s.confirmed);
  const adaptiveAnswers = useAppealStore((s) => s.adaptiveAnswers);
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
        <div className="rounded-2xl bg-[#F3F4F6] px-5 py-10 text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-pink border-t-transparent" />
          <p className="mt-4 text-[15px] font-semibold text-brand-text">
            Checking your case…
          </p>
          <p className="mt-2 text-[13px] text-brand-mute">
            This can take up to a minute on first load. Please wait.
          </p>
        </div>
      </Shell>
    );
  }

  if (!caseId || (!readiness && !error)) {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-brand-text">Nothing to review yet</h1>
        <p className="mt-2 text-[14px] text-brand-mute">Please complete the earlier steps first.</p>
        <Link
          href="/appeal/upload"
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
        >
          Start upload
        </Link>
      </Shell>
    );
  }

  if (error && !readiness) {
    return (
      <Shell>
        <h1 className="text-[22px] font-bold text-brand-text">We hit a problem</h1>
        <p className="mt-2 text-[14px] text-brand-mute">{error}</p>
        <button
          type="button"
          onClick={run}
          className="mt-6 flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white"
        >
          Try again
        </button>
      </Shell>
    );
  }

  const r = readiness!;
  const pcn = confirmed;
  const d = r.caseDetails;

  const keeperName = String(adaptiveAnswers.keeper_name ?? "").trim();
  const keeperLines = [
    keeperName,
    String(adaptiveAnswers.keeper_address_line1 ?? "").trim(),
    String(adaptiveAnswers.keeper_address_line2 ?? "").trim(),
    [
      String(adaptiveAnswers.keeper_town ?? "").trim(),
      String(adaptiveAnswers.keeper_postcode ?? "").trim(),
    ]
      .filter(Boolean)
      .join(", "),
  ].filter(Boolean);

  const situation = formatSituationLabel(
    adaptiveAnswers.scenarios,
    adaptiveAnswers.situation_other,
  );

  const rows: { label: string; value: ReactNode }[] = [
    { label: "Parking company", value: d.operatorName ?? pcn?.operator_name ?? "—" },
    { label: "PCN reference", value: d.pcnNumber ?? pcn?.pcn_number ?? "—" },
    { label: "Vehicle registration", value: d.vrm ?? pcn?.vrm ?? "—" },
    {
      label: "Date of parking event",
      value: formatUkDate(d.parkingEventDate ?? pcn?.parking_event_date),
    },
    { label: "Location", value: d.parkingLocation ?? pcn?.parking_location ?? "—" },
    { label: "Amount", value: formatMoney(pcn?.charge_amount) },
  ];

  if (keeperLines.length > 0) {
    rows.push({
      label: "Registered keeper",
      value: (
        <span className="block whitespace-pre-line text-right">
          {keeperLines.join("\n")}
        </span>
      ),
    });
  }

  rows.push({ label: "Your situation", value: situation });

  const followUps = followUpReviewRows(adaptiveAnswers);
  for (const fu of followUps) {
    rows.push({ label: fu.label, value: fu.value });
  }

  if (evidence.length > 0) {
    rows.push({
      label: "Supporting evidence",
      value: (
        <span className="block whitespace-pre-line text-right">
          {evidence
            .map((e) => {
              const label =
                (EVIDENCE_TYPE_LABELS as Record<string, string>)[e.type] ??
                "Evidence";
              return `${label}: ${e.fileName}`;
            })
            .join("\n")}
        </span>
      ),
    });
  }

  return (
    <Shell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-brand-text sm:text-[26px]">
            Review your information
          </h1>
          <p className="mt-2 text-[14px] leading-relaxed text-brand-mute">
            Please check your details before proceeding to payment.
          </p>
        </div>
        <Link
          href="/appeal/confirm"
          className="inline-flex shrink-0 items-center gap-1 pt-1 text-[13px] font-semibold text-brand-blue"
        >
          <PencilIcon />
          Edit
        </Link>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl bg-[#F3F4F6]">
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={[
              "flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5",
              i < rows.length - 1 ? "border-b border-white" : "",
            ].join(" ")}
          >
            <span className="shrink-0 text-[13px] font-medium text-brand-mute">
              {row.label}
            </span>
            <span className="max-w-[58%] text-right text-[14px] font-semibold text-brand-text">
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {!r.sufficient && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[13.5px] text-amber-900">
          <p className="font-semibold">A little more is needed</p>
          {r.blockers.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {r.blockers.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          <Link href="/appeal/evidence" className="mt-3 inline-block font-semibold text-brand-pink">
            Add supporting evidence
          </Link>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      <div className="mt-auto pt-8">
        {r.sufficient && (
          <button
            type="button"
            data-testid="review-continue"
            disabled={startingCheckout}
            onClick={() => void onContinue()}
            className="flex w-full items-center justify-center rounded-xl bg-brand-pink px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-brand-pinkDark disabled:opacity-50"
          >
            {startingCheckout ? "Starting checkout…" : "Continue to payment"}
          </button>
        )}
      </div>
    </Shell>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M12 20h9" strokeLinecap="round" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" strokeLinejoin="round" />
    </svg>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <JourneyHeader />
      <ProgressSteps current="review" />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-8 pt-6 sm:px-6 sm:pt-8">
        {children}
      </main>
    </div>
  );
}
