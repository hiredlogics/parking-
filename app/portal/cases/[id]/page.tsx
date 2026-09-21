"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { EVIDENCE_TYPE_LABELS } from "@/types";
import {
  documentUrl,
  fetchAppeal,
  fetchCase,
  fetchPaymentState,
  recordOutcome,
  type AppealView,
  type OutcomeStatusValue,
  type PaymentStateView,
} from "@/features/appeal/caseSync";
import type { CustomerCaseState } from "@/lib/cases/types";
import { caseStatusLabel, paymentStatusLabel } from "@/lib/cases/labels";

/**
 * A single appeal, from the customer's side.
 *
 * What is shown depends entirely on server-verified payment state:
 *
 *   unpaid → confirmed details, grounds, and a MASKED preview
 *   paid   → the full appeal text and downloads
 *   review → an explanation, and no appeal
 *
 * The appeal text is never fetched before payment. The mask is not a
 * CSS trick over real content — the server does not send the wording
 * until `/api/cases/[id]/appeal` authorises it.
 */
const OUTCOME_LABELS: Record<string, string> = {
  PENDING: "Awaiting decision",
  NO_RESPONSE: "No reply received",
  ACCEPTED: "Appeal accepted",
  REJECTED: "Appeal rejected",
};

const OUTCOME_DETAIL: Record<string, string> = {
  ACCEPTED:
    "The parking company accepted your appeal and the charge should be cancelled. Keep their confirmation in case it is needed later.",
  REJECTED:
    "The parking company rejected your appeal. There may be a further stage available — we will be in touch about your options.",
  NO_RESPONSE:
    "You told us the parking company never replied. Keep a note of that, as a failure to respond can matter later.",
};

export default function PortalCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const caseId = params?.id ?? "";

  const [appealCase, setAppealCase] = useState<CustomerCaseState | null>(null);
  const [payment, setPayment] = useState<PaymentStateView | null>(null);
  const [appeal, setAppeal] = useState<AppealView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [savingOutcome, setSavingOutcome] = useState(false);

  /**
   * Record the operator's decision.
   *
   * The 30-day reminder that will prompt this is future work; the
   * question only appears here once the follow-up window has passed.
   */
  const saveOutcome = async (status: OutcomeStatusValue) => {
    setSavingOutcome(true);
    const res = await recordOutcome(caseId, status);
    setSavingOutcome(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    const refreshed = await fetchCase(caseId);
    if (refreshed.ok) setAppealCase(refreshed.data.case);
  };

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      const [caseRes, payRes] = await Promise.all([
        fetchCase(caseId),
        fetchPaymentState(caseId, true),
      ]);
      if (cancelled) return;

      if (!caseRes.ok) {
        setError(caseRes.message);
        setLoading(false);
        return;
      }
      setAppealCase(caseRes.data.case);
      if (payRes.ok) setPayment(payRes.data.payment);

      // Only ask for the appeal once the server says it is paid for.
      if (payRes.ok && payRes.data.payment.status === "PAID") {
        const appealRes = await fetchAppeal(caseId);
        if (!cancelled && appealRes.ok) setAppeal(appealRes.data.appeal);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const doDownload = async (format: "pdf" | "docx") => {
    setDownloading(format);
    try {
      const res = await fetch(documentUrl(caseId, format), {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? `Download failed (${res.status}).`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Parking-Appeal-${appealCase?.publicId ?? caseId}.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed.");
    } finally {
      setDownloading(null);
    }
  };

  const crumb = (
    <Link href="/portal/cases" className="hover:text-brand-pink">
      My Cases
    </Link>
  );

  if (loading) {
    return (
      <AdminPage title="Loading…" breadcrumb={crumb}>
        <AdminCard>
          <div className="m-4 h-40 animate-pulse rounded-xl bg-brand-canvas sm:m-5" />
        </AdminCard>
      </AdminPage>
    );
  }

  if (error || !appealCase) {
    return (
      <AdminPage title="Case not available" breadcrumb={crumb}>
        <AdminCard>
          <div className="p-4 sm:p-5">
            <p className="text-brand-mute">{error ?? "We could not load this case."}</p>
            <Link href="/portal/cases" className="btn-brand-primary mt-4">
              Back to my cases
            </Link>
          </div>
        </AdminCard>
      </AdminPage>
    );
  }

  const pcn = appealCase.confirmed;
  const paid = payment?.status === "PAID";
  /** True exception path only — not normal automated release. */
  const inReview =
    appealCase.outOfScope !== null ||
    appealCase.status === "MANUAL_REVIEW" ||
    (appeal?.needsReview === true && appeal?.status !== "READY");

  return (
    <AdminPage title={appealCase.publicId} breadcrumb={crumb}>
      {/* ---------- Notice details ---------- */}
      <AdminCard>
        <AdminCardHeader
          title="Your notice"
          right={
            <span className="inline-flex rounded-full bg-brand-pinkPale px-3 py-1 text-[11px] font-semibold text-brand-text">
              {caseStatusLabel(appealCase.status)}
            </span>
          }
        />
        <dl className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 sm:p-5">
          <Detail label="Reference" value={appealCase.publicId} mono />
          <Detail label="Operator" value={pcn?.operator_name} />
          <Detail label="PCN number" value={pcn?.pcn_number} mono />
          <Detail label="Vehicle" value={pcn?.vrm} mono />
          <Detail label="Location" value={pcn?.parking_location} />
          <Detail label="Date of event" value={pcn?.parking_event_date} />
        </dl>
      </AdminCard>

      {/* ---------- Outcome ---------- */}
      {appealCase.submittedAt && (
        <AdminCard className="mt-4">
          <AdminCardHeader
            title="Operator decision"
            right={<span>{OUTCOME_LABELS[appealCase.outcomeStatus]}</span>}
          />
          <div className="p-4 text-[13.5px] sm:p-5">
            {appealCase.outcomeStatus === "PENDING" ? (
              appealCase.followUpDue ? (
                <>
                  <p className="text-brand-text">
                    Have you received a decision from{" "}
                    {pcn?.operator_name ?? "the parking company"}?
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => saveOutcome("ACCEPTED")}
                      disabled={savingOutcome}
                      className="btn-brand-primary"
                    >
                      Yes — my appeal was accepted
                    </button>
                    <button
                      type="button"
                      onClick={() => saveOutcome("REJECTED")}
                      disabled={savingOutcome}
                      className="btn-brand-outline"
                    >
                      Yes — it was rejected
                    </button>
                    <button
                      type="button"
                      onClick={() => saveOutcome("NO_RESPONSE")}
                      disabled={savingOutcome}
                      className="btn-brand-ghost"
                    >
                      No reply yet
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-brand-mute">
                  Your appeal has been prepared and sent. Parking companies
                  usually reply within 28 days — we will check in with you if we
                  have not heard by then.
                </p>
              )
            ) : (
              <p className="text-brand-mute">
                {OUTCOME_DETAIL[appealCase.outcomeStatus]}
              </p>
            )}
          </div>
        </AdminCard>
      )}

      {/* ---------- Grounds ---------- */}
      {appealCase.groundLabels.length > 0 && (
        <AdminCard className="mt-4">
          <AdminCardHeader title="What we will argue on your behalf" />
          <ul className="space-y-2 p-4 sm:p-5">
            {appealCase.groundLabels.map((label) => (
              <li
                key={label}
                className="rounded-xl border border-brand-green/30 bg-white px-4 py-3 text-[14px]"
              >
                {label}
              </li>
            ))}
          </ul>
        </AdminCard>
      )}

      {/* ---------- Evidence ---------- */}
      <AdminCard className="mt-4">
        <AdminCardHeader title="Supporting evidence" />
        {appealCase.evidence.length === 0 ? (
          <p className="p-4 text-[14px] text-brand-mute sm:p-5">
            No evidence attached. We only refer to evidence you actually provide.
          </p>
        ) : (
          <ul className="space-y-1.5 p-4 sm:p-5">
            {appealCase.evidence.map((e) => (
              <li key={e.id} className="text-[14px]">
                {(EVIDENCE_TYPE_LABELS as Record<string, string>)[e.type] ??
                  "Supporting evidence"}
                <span className="text-brand-mute"> — {e.fileName}</span>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>

      {/* ---------- The appeal itself ---------- */}
      {inReview ? (
        <AdminCard className="mt-4">
          <AdminCardHeader title="Under review" />
          <p className="p-4 text-[14px] leading-relaxed text-brand-mute sm:p-5">
            {appealCase.outOfScope?.detail ??
              appeal?.reviewDetail ??
              "We're reviewing your appeal."}
          </p>
        </AdminCard>
      ) : paid && appeal?.status === "READY" ? (
        <AdminCard className="mt-4">
          <AdminCardHeader title="Appeal ready" />
          <div className="space-y-4 p-4 sm:p-5">
            <p className="text-[14px] text-brand-text">
              Your appeal has been prepared.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => doDownload("pdf")}
                disabled={downloading !== null}
                className="btn-brand-primary"
                data-testid="portal-download-pdf"
              >
                {downloading === "pdf" ? "Preparing…" : "Download Appeal"}
              </button>
              <Link
                href="/portal/documents"
                className="btn-brand-outline"
                data-testid="portal-instructions-link"
              >
                Download Instructions
              </Link>
            </div>
            <article className="space-y-4 rounded-xl border border-brand-borderSoft bg-white p-5 text-[14px] leading-relaxed">
              <p>Dear Sir or Madam,</p>
              {appeal.paragraphs.map((p) => (
                <p key={p.id}>{p.text}</p>
              ))}
              <p>Yours faithfully,</p>
              <p>The registered keeper</p>
            </article>
          </div>
        </AdminCard>
      ) : (
        <AdminCard className="mt-4">
          <AdminCardHeader
            title="Your appeal"
            right={
              <span className="text-[12px] text-brand-mute">
                {paymentStatusLabel(payment?.status ?? "UNPAID")}
              </span>
            }
          />
          <div className="p-4 sm:p-5">
          <MaskedPreview appealCase={appealCase} />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-brand-mute">
              Your appeal is written and checked after payment. You can read
              and download it straight away.
            </p>
            <Link
              href={`/checkout/${caseId}`}
              className="btn-brand-primary whitespace-nowrap"
              data-testid="portal-pay-cta"
            >
              {payment?.amount != null
                ? `Complete payment · £${payment.amount.toFixed(2)}`
                : "Complete payment"}
            </Link>
          </div>
          </div>
        </AdminCard>
      )}
    </AdminPage>
  );
}

/**
 * Document-style preview of the appeal letter.
 *
 * The letterhead and reference block are REAL — those facts are already
 * confirmed and safe to show. The body is not: under the service
 * workflow nothing is drafted until payment clears, so the paragraphs
 * below the fold are synthetic placeholder lines behind a blur.
 *
 * That distinction matters. This is not real wording hidden with CSS —
 * there is no wording yet, so there is nothing recoverable from the
 * page source.
 */
function MaskedPreview({ appealCase }: { appealCase: CustomerCaseState }) {
  const pcn = appealCase.confirmed;
  // Ragged line lengths so the blurred block reads as prose, with a
  // paragraph break to suggest structure.
  const body = [
    ["w-full", "w-11/12", "w-full", "w-10/12"],
    ["w-full", "w-9/12"],
    ["w-full", "w-full", "w-8/12"],
    ["w-11/12", "w-7/12"],
  ];

  return (
    <div className="relative overflow-hidden rounded-xl border border-brand-border bg-white shadow-card">
      {/* Brand strip, matching the generated PDF */}
      <div className="h-1.5 w-full bg-brand-pink" />

      <div className="px-6 pt-5 sm:px-8">
        <div className="flex items-start justify-between border-b border-brand-borderSoft pb-4">
          <div>
            <p className="text-[15px] font-black tracking-tight">
              Parking Appeals Group
            </p>
            <p className="text-[10.5px] text-brand-mute">Appeal correspondence</p>
          </div>
          <div className="text-right text-[10.5px] text-brand-mute">
            <p>PCN: {pcn?.pcn_number ?? "—"}</p>
            <p>VRM: {pcn?.vrm ?? "—"}</p>
          </div>
        </div>

        {/* Reference block — confirmed facts, safe to show in full */}
        <div className="mt-4 space-y-0.5 text-[12.5px]">
          <p>
            <span className="text-brand-mute">Operator:</span>{" "}
            {pcn?.operator_name ?? "—"}
          </p>
          <p>
            <span className="text-brand-mute">Vehicle registration:</span>{" "}
            {pcn?.vrm ?? "—"}
          </p>
          <p>
            <span className="text-brand-mute">Parking location:</span>{" "}
            {pcn?.parking_location ?? "—"}
          </p>
          <p>
            <span className="text-brand-mute">Parking event date:</span>{" "}
            {pcn?.parking_event_date ?? "—"}
          </p>
        </div>

        <p className="mt-5 text-[13px]">Dear Sir or Madam,</p>
        <p className="mt-3 text-[13px] font-bold">Formal Appeal</p>
      </div>

      {/* Everything below here is unwritten until payment clears. */}
      <div className="relative mt-3 px-6 pb-8 sm:px-8" aria-hidden>
        <div className="space-y-4 blur-[3px]">
          {body.map((para, i) => (
            <div key={i} className="space-y-2">
              {para.map((w, j) => (
                <div key={j} className={`h-2.5 rounded bg-brand-canvas ${w}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 top-0 bg-gradient-to-b from-transparent via-white/45 to-white" />
      </div>

      <div className="absolute inset-x-0 bottom-0 flex justify-center pb-5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-text/90 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white">
          Your appeal is written after payment
        </span>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-brand-mute">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-[14px] font-medium text-brand-text ${mono ? "font-mono" : ""}`}
      >
        {value == null || value === "" ? "—" : value}
      </dd>
    </div>
  );
}
