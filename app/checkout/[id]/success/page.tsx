"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/app/AppHeader";
import { CheckIcon } from "@/components/landing/Icons";
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

/**
 * Post-payment page.
 *
 * The appeal is generated on the server when this page first asks for
 * it. Arriving at this URL is not itself proof of payment: the server
 * re-checks with the payment provider and returns 402 if the case is
 * unpaid, so a deep link produces the "payment required" state rather
 * than an appeal.
 */
export default function CheckoutSuccessPage() {
  const params = useParams<{ id: string }>();
  const caseId = params?.id ?? "";

  const [payment, setPayment] = useState<PaymentStateView | null>(null);
  const [appeal, setAppeal] = useState<AppealView | null>(null);
  const [appealCase, setAppealCase] = useState<CustomerCaseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    (async () => {
      // Verify with the provider before asking for any appeal text.
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

  const doDownload = async (format: "pdf" | "docx") => {
    setDownloading(format);
    try {
      const res = await fetch(documentUrl(caseId, format), {
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
      }`.replace(/[^a-zA-Z0-9_-]/g, "") + `.${format}`;
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

  if (loading) {
    return (
      <Shell>
        <div className="app-card">
          <p className="text-[14px] font-semibold text-brand-text">
            Preparing your appeal…
          </p>
          <p className="mt-1 text-[13px] text-brand-mute">
            We are writing it and running our checks. This takes a few seconds.
          </p>
          <div className="mt-4 h-40 animate-pulse rounded-xl bg-brand-canvas" />
        </div>
      </Shell>
    );
  }

  if (payment && payment.status !== "PAID") {
    return (
      <Shell>
        <div className="app-card">
          <h1 className="text-2xl font-black tracking-tight">Payment required</h1>
          <p className="mt-2 text-brand-mute">
            We have not received payment for this appeal yet. Complete checkout
            to have it prepared.
          </p>
          <Link href={`/checkout/${caseId}`} className="btn-brand-primary mt-4">
            Complete payment
          </Link>
        </div>
      </Shell>
    );
  }

  if (error || !appeal) {
    return (
      <Shell>
        <div className="app-card">
          <h1 className="text-2xl font-black tracking-tight">
            Your appeal isn&apos;t available yet
          </h1>
          <p className="mt-2 text-brand-mute">
            {error ?? "The appeal could not be loaded."}
          </p>
          <Link href="/portal" className="btn-brand-primary mt-4">
            Go to my portal
          </Link>
        </div>
      </Shell>
    );
  }

  // Validation blocked release — a person will finish this case.
  if (appeal.status !== "READY") {
    return (
      <Shell>
        <div className="app-card">
          <h1 className="text-[22px] font-black tracking-tight sm:text-[26px]">
            Our team is finishing your appeal
          </h1>
          <p className="mt-3 text-[14px] leading-relaxed text-brand-mute">
            {appeal.reviewDetail ??
              "Your case needs a person to review it before we release the appeal. We would rather do that than send you something we are not confident in."}
          </p>
          <p className="mt-3 text-[13px] text-brand-mute">
            Your payment is recorded and nothing you entered is lost. We will be
            in touch shortly.
          </p>
          <Link href="/portal" className="btn-brand-primary mt-5">
            Go to my portal
          </Link>
        </div>
      </Shell>
    );
  }

  const pcn = appealCase?.confirmed;

  return (
    <Shell wide>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="app-badge bg-brand-green/15 text-brand-green">
            <CheckIcon className="h-3.5 w-3.5" /> Payment successful
          </span>
          <h1 className="mt-3 text-[26px] font-black tracking-tight sm:text-[32px]">
            Your Complete Appeal Is Ready
          </h1>
          <p className="mt-2 max-w-2xl text-[14.5px] leading-relaxed text-brand-mute">
            This appeal was written for your case and independently checked
            before release. Download it as a PDF or Word document below.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => doDownload("pdf")}
            className="btn-brand-primary"
            disabled={downloading !== null}
            data-testid="download-pdf"
          >
            {downloading === "pdf" ? "Preparing PDF…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => doDownload("docx")}
            className="btn-brand-outline"
            disabled={downloading !== null}
            data-testid="download-docx"
          >
            {downloading === "docx" ? "Preparing Word…" : "Download Word"}
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      )}

      <article className="print-page rounded-2xl border border-brand-border bg-white p-6 shadow-card sm:p-10">
        <header className="mb-6 flex items-center justify-between border-b border-brand-borderSoft pb-4">
          <div>
            <p className="text-lg font-black">Parking Appeals Group</p>
            <p className="text-[11px] text-brand-mute">Appeal correspondence</p>
          </div>
          <div className="text-right text-[11px] text-brand-mute">
            <p>PCN: {pcn?.pcn_number ?? "—"}</p>
            <p>VRM: {pcn?.vrm ?? "—"}</p>
          </div>
        </header>

        <section className="text-sm">
          <p><strong>Operator:</strong> {pcn?.operator_name ?? "—"}</p>
          <p><strong>PCN number:</strong> {pcn?.pcn_number ?? "—"}</p>
          <p><strong>Vehicle registration:</strong> {pcn?.vrm ?? "—"}</p>
          {pcn?.parking_location && (
            <p><strong>Parking location:</strong> {pcn.parking_location}</p>
          )}
          {pcn?.parking_event_date && (
            <p><strong>Parking event date:</strong> {pcn.parking_event_date}</p>
          )}
        </section>

        <section className="mt-6 space-y-4 text-sm leading-relaxed">
          <p>Dear Sir or Madam,</p>
          {appeal.paragraphs.map((p) => (
            <p key={p.id} data-testid={`paragraph-${p.id}`}>{p.text}</p>
          ))}

          {appealCase && appealCase.evidence.length > 0 && (
            <>
              <h3 className="mt-6 font-semibold">Enclosed evidence</h3>
              <ul className="list-disc pl-5">
                {appealCase.evidence.map((e) => (
                  <li key={e.id}>
                    {(EVIDENCE_TYPE_LABELS as Record<string, string>)[e.type] ??
                      "Supporting evidence"}
                    {e.description ? ` — ${e.description}` : ""} ({e.fileName})
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="mt-6">Yours faithfully,</p>
          <p>The registered keeper</p>
        </section>
      </article>

      <div className="no-print mt-6 flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <div className="text-[12px] text-brand-mute">
          <p>
            <strong>Reference:</strong>{" "}
            <span className="font-mono">{appealCase?.publicId ?? caseId}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/portal" className="btn-brand-ghost">
            My portal
          </Link>
          <Link href="/" className="btn-brand-ghost">
            Return home
          </Link>
        </div>
      </div>
    </Shell>
  );
}

function Shell({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="app-shell">
      <AppHeader />
      <main className="container-page py-8 sm:py-10 lg:py-12">
        <div className={`mx-auto ${wide ? "max-w-4xl" : "max-w-2xl"}`}>
          {children}
        </div>
      </main>
    </div>
  );
}
