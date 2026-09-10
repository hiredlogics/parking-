"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { usePortalOverview } from "@/features/portal/usePortalOverview";
import { formatDate } from "@/lib/crm/format";

/**
 * My Documents — same layout as before, now backed by real uploads.
 *
 * The old Preview button called `alert("demo only")`. Evidence now
 * links to the ownership-checked download route; the parking notice and
 * generated appeal are reached from the case itself.
 */
export default function PortalDocumentsPage() {
  const { data, error, loading } = usePortalOverview();
  const documents = data?.documents ?? [];

  return (
    <AdminPage title="My Documents" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader
          title={loading ? "Loading…" : `${documents.length} document${documents.length === 1 ? "" : "s"}`}
        />
        {error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        )}
        <ul className="divide-y divide-brand-borderSoft">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-text">
                  {d.name}
                  {d.isFinalAppeal && (
                    <span className="ml-2 rounded-full bg-brand-green/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-green">
                      Ready
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-brand-mute">
                  {d.category} · {d.casePublicId} · {formatDate(d.uploadedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* Both routes re-check ownership and, for the final
                    appeal, the payment entitlement. */}
                <a
                  href={d.viewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] font-semibold uppercase text-brand-pink hover:underline"
                  data-testid={`view-${d.id}`}
                >
                  View
                </a>
                <a
                  href={d.downloadUrl}
                  className="text-[11.5px] font-semibold uppercase text-brand-pink hover:underline"
                  data-testid={`download-${d.id}`}
                >
                  Download
                </a>
                <Link
                  href={`/portal/cases/${d.caseId}`}
                  className="text-[11.5px] font-semibold uppercase text-brand-mute hover:text-brand-text"
                >
                  Case
                </Link>
              </div>
            </li>
          ))}
          {!loading && documents.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No documents yet.</li>
          )}
          {loading && (
            <li className="px-4 py-8"><div className="h-12 animate-pulse rounded-xl bg-brand-canvas" /></li>
          )}
        </ul>
      </AdminCard>
    </AdminPage>
  );
}
