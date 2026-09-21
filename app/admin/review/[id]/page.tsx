"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

type DocRow = {
  id: string;
  fileName: string;
  documentType: string;
  evidenceType: string | null;
  mimeType: string;
  viewUrl: string;
  downloadUrl: string;
};

export default function ReviewAppealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [data, setData] = useState<{
    appeal: Record<string, unknown>;
    case: Record<string, unknown> | null;
    documents: DocRow[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [bodyText, setBodyText] = useState("");
  const [originalBody, setOriginalBody] = useState("");

  const load = useCallback(() => {
    if (!id) return;
    fetch(`/api/admin/review/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error?.message ?? "Failed");
        setData({
          appeal: d.data.appeal,
          case: d.data.case,
          documents: d.data.documents ?? [],
        });
        const paragraphs = Array.isArray(d.data?.appeal?.paragraphs)
          ? (d.data.appeal.paragraphs as Array<{ text?: string }>)
          : [];
        const fromParas = paragraphs
          .map((p) => p.text ?? "")
          .filter(Boolean)
          .join("\n\n");
        const text =
          fromParas ||
          (typeof d.data?.appeal?.body === "string" ? d.data.appeal.body : "") ||
          "";
        setBodyText(text);
        setOriginalBody(text);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: string, reason?: string) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/review/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: reason ?? action,
          bodyText:
            action === "APPROVE" || action === "PREVIEW_PDF"
              ? bodyText
              : undefined,
        }),
      });

      if (action === "PREVIEW_PDF") {
        if (!res.ok) {
          const d = await res.json().catch(() => null);
          throw new Error(d?.error?.message ?? "Preview failed");
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }

      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d.error?.message ?? "Action failed");
      }
      if (action === "APPROVE") {
        router.push("/admin/review?released=1");
        return;
      }
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  const appeal = data?.appeal;
  const c = data?.case as {
    publicId?: string;
    operatorName?: string;
    pcnNumber?: string;
    vrm?: string;
    parkingLocation?: string;
    parkingEventDate?: string;
    customerId?: string;
  } | null;

  const provider =
    typeof appeal?.providerId === "string" ? appeal.providerId : null;
  const model = typeof appeal?.model === "string" ? appeal.model : null;
  const edited = bodyText.trim() !== originalBody.trim();
  const hasBody = Boolean(bodyText.trim());

  return (
    <AdminPage
      title="Review appeal"
      breadcrumb={
        <>
          <Link href="/admin" className="hover:text-brand-pink">
            Dashboard
          </Link>
          <span className="mx-1">/</span>
          <Link href="/admin/review" className="hover:text-brand-pink">
            Appeals for Review
          </Link>
        </>
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {!data && !error && (
        <p className="text-sm text-brand-mute">Loading…</p>
      )}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
            <p className="font-semibold">Exception review only</p>
            <p className="mt-1 text-amber-900/80">
              Ordinary appeals auto-release after validation. This queue is for
              cases that could not safely complete automatically — edit if
              needed, then approve to release the PDF and instructions, or hold
              / reject.
            </p>
          </div>

          <AdminCard>
            <AdminCardHeader title="Case" />
            <div className="space-y-2 p-4 text-[13px]">
              <p>
                <strong>Reference:</strong> {c?.publicId ?? "—"}
              </p>
              <p>
                <strong>Operator:</strong> {c?.operatorName ?? "—"}
              </p>
              <p>
                <strong>PCN:</strong> {c?.pcnNumber ?? "—"}
              </p>
              <p>
                <strong>Vehicle:</strong> {c?.vrm ?? "—"}
              </p>
              <p>
                <strong>Location:</strong> {c?.parkingLocation ?? "—"}
              </p>
              <p>
                <strong>Event date:</strong> {c?.parkingEventDate ?? "—"}
              </p>
              <p>
                <strong>Status:</strong> {String(appeal?.status ?? "—")}
              </p>
              <p className="text-[12px] text-brand-mute">
                Generated by{" "}
                {provider || model
                  ? [provider, model].filter(Boolean).join(" · ")
                  : "AI drafting pipeline"}
              </p>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader
              title="Documents & evidence"
              right={<span>{data.documents.length}</span>}
            />
            <ul className="divide-y divide-brand-borderSoft text-[13px]">
              {data.documents.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.fileName}</p>
                    <p className="text-[11px] text-brand-mute">
                      {d.evidenceType ?? d.documentType}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <a
                      href={d.viewUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[12px] font-semibold text-brand-pink hover:underline"
                    >
                      View
                    </a>
                    <a
                      href={d.downloadUrl}
                      className="text-[12px] font-semibold text-brand-mute hover:underline"
                    >
                      Download
                    </a>
                  </div>
                </li>
              ))}
              {data.documents.length === 0 && (
                <li className="px-4 py-6 text-center text-brand-mute">
                  No uploaded files on this case.
                </li>
              )}
            </ul>
            <div className="border-t border-brand-borderSoft px-4 py-3 text-[12px] text-brand-mute">
              <p>
                <strong className="text-brand-text">Issues:</strong>{" "}
                {Array.isArray(appeal?.issuesJson)
                  ? (appeal!.issuesJson as Array<{ label?: string; code?: string }>)
                      .map((i) => i.label ?? i.code)
                      .join(", ") || "—"
                  : "—"}
              </p>
            </div>
          </AdminCard>

          <AdminCard className="lg:col-span-2">
            <AdminCardHeader
              title="Appeal letter"
              right={
                edited ? (
                  <span className="text-amber-700">Edited</span>
                ) : (
                  <span className="text-brand-mute">AI draft</span>
                )
              }
            />
            <div className="p-4">
              {!hasBody && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
                  No letter text was stored. Use <strong>Regenerate with AI</strong>{" "}
                  below, then review before approving.
                </div>
              )}
              <textarea
                className="app-input min-h-[320px] w-full font-serif text-[14px] leading-relaxed"
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                placeholder="Appeal letter will appear here after AI generation…"
              />
              <p className="mt-2 text-[12px] text-brand-mute">
                Approve freezes this exact text into the branded customer PDF,
                emails the customer, and unlocks download in their portal.
              </p>
            </div>
          </AdminCard>

          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button
              type="button"
              className="btn-brand-primary"
              disabled={!!busy || !hasBody}
              onClick={() => act("APPROVE")}
            >
              {busy === "APPROVE"
                ? "Releasing…"
                : "Approve · release PDF & notify"}
            </button>
            <button
              type="button"
              className="btn-brand-outline"
              disabled={!!busy || !hasBody}
              onClick={() => act("PREVIEW_PDF")}
            >
              {busy === "PREVIEW_PDF" ? "Building…" : "Preview PDF"}
            </button>
            <button
              type="button"
              className="btn-brand-ghost"
              disabled={!!busy}
              onClick={() => act("REGENERATE", "Admin requested AI regeneration")}
            >
              {busy === "REGENERATE" ? "Regenerating…" : "Regenerate with AI"}
            </button>
            <button
              type="button"
              className="btn-brand-ghost"
              disabled={!!busy}
              onClick={() => act("HOLD", "Held for further review")}
            >
              Hold
            </button>
            <button
              type="button"
              className="btn-brand-ghost text-red-700"
              disabled={!!busy}
              onClick={() => act("REJECT", "Rejected by admin")}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </AdminPage>
  );
}
