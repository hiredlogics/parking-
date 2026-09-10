"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { usePortalOverview } from "@/features/portal/usePortalOverview";
import { formatDate } from "@/lib/crm/format";

/**
 * My Appeals — same layout as before, now backed by real cases.
 *
 * An appeal is a view of a case rather than a separate record, so this
 * lists the customer's cases that have reached confirmation.
 */
export default function PortalAppealsPage() {
  const { data, error, loading } = usePortalOverview();
  const appeals = data?.appeals ?? [];

  return (
    <AdminPage title="My Appeals" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader
          title={loading ? "Loading…" : `${appeals.length} appeal${appeals.length === 1 ? "" : "s"}`}
        />
        {error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">PCN Ref</th>
                <th className="px-4 py-2">VRM</th>
                <th className="px-4 py-2">Operator</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {appeals.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono">
                    <Link href={`/portal/cases/${a.caseId}`} className="hover:text-brand-pink hover:underline">
                      {a.pcnReference ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.vrm ?? "—"}</td>
                  <td className="px-4 py-3">{a.operator ?? "—"}</td>
                  <td className="px-4 py-3">{a.service}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-brand-pinkLight px-2 py-0.5 text-[10.5px] font-semibold text-brand-pink">
                      {a.appealStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
              {!loading && appeals.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-mute">No appeals yet.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={6} className="px-4 py-8"><div className="h-12 animate-pulse rounded-xl bg-brand-canvas" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
