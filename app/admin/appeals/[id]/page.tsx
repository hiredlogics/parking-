"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

/**
 * Appeal case audit view.
 *
 * The customer's journey is generated per case, so the reviewable
 * record is not "which of the 27 questions did they get" but: which
 * fact each question targeted, why it was material, and whether the AI
 * or the controlled bank produced it. That is what this page shows.
 */

interface Detail {
  case: Record<string, unknown> & {
    publicId: string;
    status: string;
    paymentStatus: string;
    primaryRoute: string | null;
    secondaryRoutes: string[];
    candidateRoutes: string[];
    missingFacts: string[];
    sufficiencyStatus: string;
    codeVersionId: string | null;
    outOfScopeDetail: string | null;
    confirmed: Record<string, string> | null;
  };
  questions: Array<{
    seq: number;
    label: string;
    targetFact: string;
    reasonCode: string;
    route: string;
    origin: string;
    model: string | null;
    rejections: string[];
    answer: unknown;
    askedAt: string;
    answeredAt: string | null;
  }>;
  drafts: Array<{
    id: string;
    version: number;
    status: string;
    moduleIds: string[];
    providerId: string | null;
    model: string | null;
    bespoke: boolean;
    blockReason: string | null;
    blockDetail: string | null;
    createdAt: string;
    supersededAt: string | null;
  }>;
  documents: Array<{ id: string; fileName: string; documentType: string; evidenceType: string | null }>;
  events: Array<{ eventType: string; createdAt: string }>;
  payment: { status: string; amount: number; provider: string; paidAt: string | null } | null;
  currentAppeal: {
    id: string;
    status: string;
    version: number;
    body: string | null;
    paragraphs: Array<{ id: string; text: string }>;
    moduleIds: string[];
    approvedAt: string | null;
  } | null;
}

const ORIGIN_LABEL: Record<string, string> = {
  AI: "AI",
  AI_REGENERATED: "AI (regenerated)",
  BANK_FALLBACK: "Bank fallback",
};

export default function AdminAppealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/cases/${id}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? `Could not load case (${res.status}).`);
        return;
      }
      setData(json.data as Detail);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const crumb = (
    <Link href="/admin/appeals" className="hover:text-brand-pink">
      Appeal Cases
    </Link>
  );

  if (error) {
    return (
      <AdminPage title="Case not available" breadcrumb={crumb}>
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

  const c = data.case;
  const pending =
    data.currentAppeal &&
    (data.currentAppeal.status === "AWAITING_ADMIN_APPROVAL" ||
      data.currentAppeal.status === "HELD");

  return (
    <AdminPage
      title={c.publicId}
      breadcrumb={crumb}
      actions={
        pending ? (
          <Link
            href={`/admin/review/${data.currentAppeal!.id}`}
            className="btn-brand-primary"
          >
            Review &amp; Approve
          </Link>
        ) : undefined
      }
    >
      {/* Case summary */}
      <AdminCard>
        <AdminCardHeader title="Case" right={<span>{c.status}</span>} />
        <dl className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:p-5">
          <Field label="Operator" value={c.confirmed?.operator_name} />
          <Field label="PCN" value={c.confirmed?.pcn_number} mono />
          <Field label="VRM" value={c.confirmed?.vrm} mono />
          <Field label="Event date" value={c.confirmed?.parking_event_date} />
          <Field label="Primary route" value={c.primaryRoute} />
          <Field label="Secondary" value={c.secondaryRoutes.join(", ")} />
          <Field label="Code version" value={c.codeVersionId} />
          <Field label="Sufficiency" value={c.sufficiencyStatus} />
        </dl>
        {c.missingFacts.length > 0 && (
          <p className="border-t border-brand-borderSoft px-4 py-3 text-[12px] text-brand-mute sm:px-5">
            Outstanding: <span className="font-mono">{c.missingFacts.join(", ")}</span>
          </p>
        )}
        {c.outOfScopeDetail && (
          <p className="border-t border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 sm:px-5">
            {c.outOfScopeDetail}
          </p>
        )}
        {pending && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-pink/20 bg-brand-pinkPale/40 px-4 py-3 sm:px-5">
            <p className="text-[13px] text-brand-text">
              Appeal v{data.currentAppeal!.version} is waiting for approval.
              Approve releases the PDF, emails the customer, and unlocks portal
              download.
            </p>
            <Link
              href={`/admin/review/${data.currentAppeal!.id}`}
              className="btn-brand-primary whitespace-nowrap"
            >
              Open Approve
            </Link>
          </div>
        )}
        {data.currentAppeal?.status === "APPROVED" && (
          <p className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-900 sm:px-5">
            Approved
            {data.currentAppeal.approvedAt
              ? ` · ${new Date(data.currentAppeal.approvedAt).toLocaleString("en-GB")}`
              : ""}
            . Customer can download from the portal.
          </p>
        )}
      </AdminCard>

      {/* Question journey — the audit trail that makes dynamic generation reviewable */}
      <AdminCard className="mt-4">
        <AdminCardHeader
          title="Question journey"
          right={<span>{data.questions.length} asked</span>}
        />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">#</th>
                <th className="px-4 py-2">Question</th>
                <th className="px-4 py-2">Target fact</th>
                <th className="px-4 py-2">Why</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Answer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {data.questions.map((q) => (
                <tr key={q.seq} className="align-top">
                  <td className="px-4 py-3 text-brand-mute">{q.seq}</td>
                  <td className="max-w-md px-4 py-3">{q.label}</td>
                  <td className="px-4 py-3 font-mono text-[11.5px]">{q.targetFact}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-[11px] text-brand-mute">{q.reasonCode}</div>
                    <div className="text-[11px] text-brand-mute">{q.route}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        q.origin === "BANK_FALLBACK"
                          ? "bg-amber-100 text-amber-900"
                          : "bg-brand-pinkPale text-brand-text"
                      }`}
                    >
                      {ORIGIN_LABEL[q.origin] ?? q.origin}
                    </span>
                    {q.rejections.length > 0 && (
                      <div className="mt-1 text-[10.5px] text-amber-800">
                        {q.rejections.length} rejected
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {q.answeredAt ? (
                      <span className="font-mono text-[11.5px]">
                        {JSON.stringify(q.answer)}
                      </span>
                    ) : (
                      <span className="text-brand-mute">awaiting</span>
                    )}
                  </td>
                </tr>
              ))}
              {data.questions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-brand-mute">
                    No questions asked yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {/* Drafts */}
      <AdminCard className="mt-4">
        <AdminCardHeader title="Appeal drafts" right={<span>{data.drafts.length}</span>} />
        <div className="divide-y divide-brand-borderSoft">
          {data.drafts.map((d) => (
            <div key={d.id} className="px-4 py-3 text-[12.5px] sm:px-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">v{d.version}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                    d.status === "READY"
                      ? "bg-brand-green/15 text-brand-green"
                      : "bg-amber-100 text-amber-900"
                  }`}
                >
                  {d.status}
                </span>
                <span className="text-brand-mute">
                  {d.bespoke ? "bespoke" : "deterministic"} · {d.model ?? d.providerId}
                </span>
                {d.supersededAt && (
                  <span className="text-[11px] text-brand-mute">superseded</span>
                )}
              </div>
              {d.blockDetail && (
                <p className="mt-1 text-[12px] text-amber-900">{d.blockDetail}</p>
              )}
              <p className="mt-1 font-mono text-[10.5px] text-brand-mute">
                {d.moduleIds.join(", ") || "no modules"}
              </p>
            </div>
          ))}
          {data.drafts.length === 0 && (
            <p className="px-4 py-6 text-center text-brand-mute sm:px-5">
              No appeal generated yet.
            </p>
          )}
        </div>
      </AdminCard>

      {/* Payment and documents */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AdminCard>
          <AdminCardHeader title="Payment" />
          <div className="p-4 text-[13px] sm:p-5">
            {data.payment ? (
              <p>
                {data.payment.status} · £{Number(data.payment.amount).toFixed(2)} ·{" "}
                {data.payment.provider}
                {data.payment.paidAt && (
                  <span className="text-brand-mute">
                    {" "}
                    · {new Date(data.payment.paidAt).toLocaleString("en-GB")}
                  </span>
                )}
              </p>
            ) : (
              <p className="text-brand-mute">No payment started.</p>
            )}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Documents" right={<span>{data.documents.length}</span>} />
          <ul className="p-4 text-[13px] sm:p-5">
            {data.documents.map((d) => (
              <li key={d.id} className="py-0.5">
                <span className="text-brand-mute">{d.evidenceType ?? d.documentType}</span> —{" "}
                {d.fileName}
              </li>
            ))}
            {data.documents.length === 0 && (
              <li className="text-brand-mute">None uploaded.</li>
            )}
          </ul>
        </AdminCard>
      </div>
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
