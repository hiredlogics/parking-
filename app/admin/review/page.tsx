"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

interface QueueItem {
  appeal: {
    id: string;
    caseId: string;
    status: string;
    createdAt: string;
    moduleIds: string[];
    issuesJson: Array<{ code?: string; label?: string }>;
  };
  case: {
    id: string;
    publicId: string;
    operatorName: string | null;
    pcnNumber: string | null;
    vrm: string | null;
  } | null;
}

export default function AppealsForReviewPage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20_000);

    (async () => {
      try {
        const res = await fetch("/api/admin/review", {
          cache: "no-store",
          signal: ac.signal,
        });
        const d = await res.json().catch(() => null);
        if (!res.ok || !d?.success) {
          throw new Error(
            d?.error?.message ?? `Failed to load (${res.status})`,
          );
        }
        setItems(d.data.items ?? []);
        setError(null);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          setError("Timed out loading the review queue. Please try again.");
        } else {
          setError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        clearTimeout(timer);
        setLoading(false);
      }
    })();

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  return (
    <AdminPage
      title="Appeals for Review"
      breadcrumb={
        <Link href="/admin" className="hover:text-brand-pink">
          Dashboard
        </Link>
      }
    >
      <AdminCard>
        <AdminCardHeader
          title="Awaiting approval"
          right={
            <span className="text-[12px] text-brand-mute">
              {loading ? "…" : `${items.length} in queue`}
            </span>
          }
        />
        {loading && (
          <p className="p-4 text-sm text-brand-mute">Loading queue…</p>
        )}
        {error && (
          <div className="space-y-3 p-4">
            <p className="text-sm text-red-700">{error}</p>
            <button
              type="button"
              className="btn-brand-outline"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <p className="p-4 text-sm text-brand-mute">
            No appeals waiting for review. After a customer pays, generated
            appeals appear here for approval.
          </p>
        )}
        {!loading && !error && items.length > 0 && (
          <ul className="divide-y divide-brand-borderSoft">
            {items.map((item) => (
              <li
                key={item.appeal.id}
                className="flex items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="text-[14px] font-semibold text-brand-text">
                    {item.case?.pcnNumber ??
                      item.case?.publicId ??
                      item.appeal.caseId}
                  </p>
                  <p className="text-[12px] text-brand-mute">
                    {item.case?.operatorName ?? "—"} · {item.case?.vrm ?? "—"} ·{" "}
                    {item.appeal.status}
                  </p>
                  <p className="mt-1 text-[12px] text-brand-mute">
                    Issues:{" "}
                    {(item.appeal.issuesJson ?? [])
                      .map((i) => i.label ?? i.code)
                      .filter(Boolean)
                      .join(", ") || "—"}
                  </p>
                </div>
                <Link
                  href={`/admin/review/${item.appeal.id}`}
                  className="btn-brand-primary text-[12px]"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </AdminCard>
    </AdminPage>
  );
}
