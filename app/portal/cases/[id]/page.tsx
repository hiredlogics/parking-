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
  type AppealView,
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
export default function PortalCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const caseId = params?.id ?? "";

  const [appealCase, setAppealCase] = useState<CustomerCaseState | null>(null);
  const [payment, setPayment] = useState<PaymentStateView | null>(null);
  const [appeal, setAppeal] = useState<AppealView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

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
  const inReview =
    appealCase.outOfScope !== null ||
    appealCase.status === "MANUAL_REVIEW" ||
    appeal?.needsReview === true;

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
          <AdminCardHeader title="With our team" />
          <p className="p-4 text-[14px] leading-relaxed text-brand-mute sm:p-5">
            {appealCase.outOfScope?.detail ??
              appeal?.reviewDetail ??
              "This case needs a person to review it before we release an appeal. We would rather do that than send you something we are not confident in."}
          </p>
        </AdminCard>
      ) : paid && appeal?.status === "READY" ? (
        <AdminCard className="mt-4">
          <AdminCardHeader
            title="Your appeal"
            right={
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => doDownload("pdf")}
                  disabled={downloading !== null}
                  className="btn-brand-primary"
                  data-testid="portal-download-pdf"
                >
                  {downloading === "pdf" ? "Preparing…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => doDownload("docx")}
                  disabled={downloading !== null}
                  className="btn-brand-outline"
                  data-testid="portal-download-docx"
                >
                  {downloading === "docx" ? "Preparing…" : "Word"}
                </button>
              </div>
            }
          />
          <article className="m-4 space-y-4 rounded-xl border border-brand-borderSoft bg-white p-5 text-[14px] leading-relaxed sm:m-5">
            <p>Dear Sir or Madam,</p>
            {appeal.paragraphs.map((p) => (
              <p key={p.id}>{p.text}</p>
            ))}
            <p>Yours faithfully,</p>
            <p>The registered keeper</p>
          </article>
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
          <MaskedPreview />
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
 * Placeholder bars standing in for the unwritten appeal.
 *
 * Deliberately synthetic. No appeal text exists before payment, so
 * there is nothing here to reveal by inspecting the page.
 */
function MaskedPreview() {
  const widths = ["w-full", "w-11/12", "w-full", "w-4/5", "w-full", "w-3/5"];
  return (
    <div
      aria-hidden
      className="relative overflow-hidden rounded-xl border border-brand-borderSoft bg-white p-5"
    >
      <div className="space-y-2.5">
        {widths.map((w, i) => (
          <div key={i} className={`h-3 rounded bg-brand-canvas ${w}`} />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55 backdrop-blur-[2px]">
        <span className="rounded-full bg-brand-text/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          Available after payment
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
