"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function ReviewAppealDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const [data, setData] = useState<{
    appeal: Record<string, unknown>;
    case: Record<string, unknown> | null;
    evidence: Array<Record<string, unknown>>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) return;
    fetch(`/api/admin/review/${id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error?.message ?? "Failed");
        setData(d.data);
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
        body: JSON.stringify({ action, reason: reason ?? action }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d.error?.message ?? "Action failed");
      }
      if (action === "APPROVE") {
        router.push("/admin/review");
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
    confirmed?: Record<string, unknown>;
    customerId?: string;
  } | null;

  const paragraphs = Array.isArray(appeal?.paragraphs)
    ? (appeal!.paragraphs as Array<{ id: string; text: string }>)
    : [];

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
          <AdminCard>
            <AdminCardHeader title="Case" />
            <div className="space-y-2 p-4 text-[13px]">
              <p>
                <strong>Reference:</strong> {c?.publicId ?? "—"}
              </p>
              <p>
                <strong>Customer:</strong> {c?.customerId ?? "—"}
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
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader title="Issues & knowledge" />
            <div className="space-y-2 p-4 text-[13px]">
              <p>
                <strong>Issues:</strong>{" "}
                {Array.isArray(appeal?.issuesJson)
                  ? (appeal!.issuesJson as Array<{ label?: string; code?: string }>)
                      .map((i) => i.label ?? i.code)
                      .join(", ") || "—"
                  : "—"}
              </p>
              <p>
                <strong>Modules:</strong>{" "}
                {Array.isArray(appeal?.moduleIds)
                  ? (appeal!.moduleIds as string[]).join(", ") || "—"
                  : "—"}
              </p>
              <p>
                <strong>Evidence files:</strong> {data.evidence?.length ?? 0}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">
                  Facts snapshot
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-brand-canvas p-2 text-[11px]">
                  {JSON.stringify(appeal?.factsSnapshot ?? {}, null, 2)}
                </pre>
              </details>
              <details className="mt-2">
                <summary className="cursor-pointer font-semibold">
                  Validation
                </summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-brand-canvas p-2 text-[11px]">
                  {JSON.stringify(appeal?.validationJson ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          </AdminCard>

          <AdminCard className="lg:col-span-2">
            <AdminCardHeader title="Generated appeal" />
            <article className="space-y-3 p-4 text-[14px] leading-relaxed">
              {paragraphs.length === 0 && (
                <p className="text-brand-mute">No body text on this appeal.</p>
              )}
              {paragraphs.map((p) => (
                <p key={p.id}>{p.text}</p>
              ))}
            </article>
          </AdminCard>

          <div className="flex flex-wrap gap-3 lg:col-span-2">
            <button
              type="button"
              className="btn-brand-primary"
              disabled={!!busy}
              onClick={() => act("APPROVE")}
            >
              {busy === "APPROVE" ? "Approving…" : "Approve"}
            </button>
            <button
              type="button"
              className="btn-brand-outline"
              disabled={!!busy}
              onClick={() => act("REGENERATE", "Admin requested regeneration")}
            >
              {busy === "REGENERATE" ? "Regenerating…" : "Regenerate"}
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
