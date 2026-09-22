"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

/**
 * Case Intelligence — internal diagnostics for one case.
 *
 * Answers the question "what did the AI actually take from the
 * document, before the customer was asked anything?". Shows the stored
 * record (what the questions and drafting saw) next to a fresh
 * recomputation, because a stored record from an older engine is the
 * one that shaped the journey.
 *
 * Admin-only. Nothing here is rendered on any customer surface.
 */

interface Finding {
  ground: string;
  status: string;
  confidence: string;
  evidence: Record<string, unknown>;
  knowledgeRefs: string[];
  missingFacts: string[];
  reasons: string[];
}

interface Intelligence {
  version: string;
  assessedAt: string;
  documentUnderstanding: {
    documentType: string | null;
    sender: string | null;
    operator: string | null;
    stage: string | null;
    noticeRoute: string | null;
  } | null;
  identifiedIssues: Array<{
    code: string;
    label: string;
    confidence: string;
    supportingFacts: Record<string, unknown>;
    missingFacts: string[];
    knowledgeRefs: string[];
    reasons: string[];
  }>;
  technicalFindings: Finding[];
  suitability: { decision: string; reasonCode: string | null; detail: string | null };
  warnings: string[];
  missingFacts: string[];
  knowledgeRefs: string[];
  analysisVersion: string;
}

interface Payload {
  caseRef: {
    id: string;
    publicId: string;
    status: string;
    sufficiencyStatus: string;
    paymentStatus: string;
  };
  documentColumns: Record<string, string | null>;
  suitability: { decision: string; reasonCode: string | null; detail: string | null };
  stored: Intelligence | null;
  recomputed: Intelligence | null;
  stale: boolean;
}

export default function AdminCaseIntelligencePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"stored" | "recomputed">("stored");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/cases/${id}/intelligence`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !json?.success) {
        setError(
          json?.error?.message ?? `Could not load intelligence (${res.status}).`,
        );
        return;
      }
      setData(json.data as Payload);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const crumb = (
    <>
      <Link href="/admin/appeals" className="hover:text-brand-pink">
        Appeal Cases
      </Link>
      {data && (
        <>
          {" / "}
          <Link
            href={`/admin/appeals/${id}`}
            className="hover:text-brand-pink"
          >
            {data.caseRef.publicId}
          </Link>
        </>
      )}
    </>
  );

  if (error) {
    return (
      <AdminPage title="Case Intelligence unavailable" breadcrumb={crumb}>
        <AdminCard>
          <p className="p-4 text-brand-mute sm:p-5">{error}</p>
        </AdminCard>
      </AdminPage>
    );
  }
  if (!data) {
    return (
      <AdminPage title="Loading…" breadcrumb={crumb}>
        <AdminCard>
          <div className="m-4 h-40 animate-pulse rounded-xl bg-brand-canvas sm:m-5" />
        </AdminCard>
      </AdminPage>
    );
  }

  const ci = view === "stored" ? data.stored : data.recomputed;
  const cols = data.documentColumns;

  return (
    <AdminPage title="Case Intelligence" breadcrumb={crumb}>
      {/* What the document extraction wrote onto the case itself. */}
      <AdminCard>
        <AdminCardHeader
          title="Document understanding"
          right={<span>{data.caseRef.status}</span>}
        />
        <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
          <Field label="Document type" value={cols.documentType} />
          <Field label="Sent by" value={cols.senderName} />
          <Field label="Parking operator" value={cols.parkingOperatorName} />
          <Field label="Case stage" value={cols.caseStage} />
          <Field label="Service decision" value={cols.serviceDecision} />
          <Field label="Notice route" value={cols.noticeRoute} />
          <Field label="Event date" value={cols.parkingEventDate} />
          <Field label="Notice issued" value={cols.noticeIssueDate} />
        </dl>
        {cols.senderName &&
          cols.parkingOperatorName &&
          cols.senderName !== cols.parkingOperatorName && (
            <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 sm:px-5">
              Sender differs from the parking operator — the charge belongs to{" "}
              {cols.parkingOperatorName}, the letter came from {cols.senderName}.
            </p>
          )}
      </AdminCard>

      {/* The one gate questions, payment and generation all read. */}
      <AdminCard>
        <AdminCardHeader title="Suitability gate" />
        <div className="p-4 sm:p-5">
          <span
            className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${
              data.suitability.decision === "SUPPORTED"
                ? "bg-emerald-50 text-emerald-800"
                : data.suitability.decision === "MANUAL_REVIEW"
                  ? "bg-amber-50 text-amber-900"
                  : "bg-rose-50 text-rose-800"
            }`}
          >
            {data.suitability.decision}
          </span>
          {data.suitability.reasonCode && (
            <span className="ml-2 font-mono text-[12px] text-brand-mute">
              {data.suitability.reasonCode}
            </span>
          )}
          {data.suitability.detail && (
            <p className="mt-2 text-[13px] text-brand-text">
              {data.suitability.detail}
            </p>
          )}
        </div>
      </AdminCard>

      {data.stale && (
        <AdminCard>
          <p className="p-4 text-[12.5px] text-amber-900 sm:p-5">
            The stored record was produced by engine{" "}
            <span className="font-mono">{data.stored?.version}</span>; the
            current engine is{" "}
            <span className="font-mono">{data.recomputed?.version}</span>. The
            stored record is what this customer&apos;s questions and draft were
            based on.
          </p>
        </AdminCard>
      )}

      <AdminCard>
        <AdminCardHeader
          title="Findings"
          right={
            <span className="inline-flex gap-1">
              {(["stored", "recomputed"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-2.5 py-1 text-[12px] ${
                    view === v
                      ? "bg-brand-pink text-white"
                      : "bg-brand-canvas text-brand-mute"
                  }`}
                >
                  {v === "stored" ? "Stored" : "Recomputed"}
                </button>
              ))}
            </span>
          }
        />

        {!ci ? (
          <p className="p-4 text-brand-mute sm:p-5">
            {view === "stored"
              ? "No Case Intelligence was stored for this case — it was confirmed before the record existed, or confirmation never completed."
              : "Cannot recompute: the case has no confirmed notice details yet."}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4 border-b border-brand-borderSoft p-4 sm:grid-cols-4 sm:p-5">
              <Field label="Engine" value={ci.version} mono />
              <Field label="Analysis" value={ci.analysisVersion} mono />
              <Field label="Assessed at" value={ci.assessedAt} />
              <Field label="Grounds found" value={String(ci.technicalFindings.length)} />
            </dl>

            {ci.technicalFindings.length === 0 && (
              <p className="px-4 py-3 text-[13px] text-brand-mute sm:px-5">
                No technical ground was established from the document alone.
              </p>
            )}

            {ci.technicalFindings.map((f) => (
              <div
                key={`${f.ground}-${f.status}`}
                className="border-b border-brand-borderSoft p-4 last:border-b-0 sm:p-5"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px] font-semibold">
                    {f.ground}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      f.status === "IDENTIFIED"
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-brand-canvas text-brand-mute"
                    }`}
                  >
                    {f.status}
                  </span>
                  <span className="rounded-full bg-brand-canvas px-2 py-0.5 text-[11px] text-brand-mute">
                    {f.confidence}
                  </span>
                </div>

                {f.reasons.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-brand-text">
                    {f.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}

                <KeyValues label="Evidence" value={f.evidence} />
                <Chips label="Knowledge used" items={f.knowledgeRefs} />
                <Chips label="Still needed" items={f.missingFacts} />
              </div>
            ))}

            {ci.identifiedIssues.length > 0 && (
              <div className="border-t border-brand-borderSoft p-4 sm:p-5">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-mute">
                  Issues passed to the question engine
                </p>
                <ul className="mt-2 space-y-1 text-[13px]">
                  {ci.identifiedIssues.map((i) => (
                    <li key={i.code}>
                      <span className="font-mono">{i.code}</span> — {i.label}{" "}
                      <span className="text-brand-mute">({i.confidence})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="border-t border-brand-borderSoft p-4 sm:p-5">
              <Chips label="Outstanding facts" items={ci.missingFacts} />
              <Chips label="All knowledge referenced" items={ci.knowledgeRefs} />
            </div>

            {ci.warnings.length > 0 && (
              <ul className="list-disc space-y-1 border-t border-amber-200 bg-amber-50 px-4 py-3 pl-9 text-[12.5px] text-amber-900 sm:px-5 sm:pl-10">
                {ci.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </AdminCard>
    </AdminPage>
  );
}

function Field({
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
      <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-mute">
        {label}
      </dt>
      <dd className={`mt-0.5 text-[13px] ${mono ? "font-mono" : ""}`}>
        {value == null || value === "" ? "—" : value}
      </dd>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-mute">
        {label}
      </p>
      <div className="mt-1 flex flex-wrap gap-1">
        {items.map((it) => (
          <span
            key={it}
            className="rounded-full bg-brand-canvas px-2 py-0.5 font-mono text-[11.5px] text-brand-text"
          >
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function KeyValues({
  label,
  value,
}: {
  label: string;
  value: Record<string, unknown>;
}) {
  const entries = Object.entries(value ?? {}).filter(
    ([, v]) => v !== null && v !== undefined && v !== "",
  );
  if (!entries.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-brand-mute">
        {label}
      </p>
      <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {entries.map(([k, v]) => (
          <div key={k} className="text-[12.5px]">
            <dt className="font-mono text-brand-mute">{k}</dt>
            <dd className="font-mono">{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
