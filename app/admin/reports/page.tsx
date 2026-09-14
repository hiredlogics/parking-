"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader, KpiCard } from "@/components/admin/ui";
import { formatCurrency } from "@/lib/crm/format";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

interface ReportsData {
  totalCases: number;
  openCases: number;
  completedCases: number;
  revenue: number;
  pending: number;
  refunded: number;
  byLifecycle: Record<string, number>;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  IN_PROGRESS: "In progress",
  READY_FOR_PAYMENT: "Waiting for payment",
  PAID: "Being prepared",
  GENERATING: "Being prepared",
  UNDER_REVIEW: "Under review",
  GENERATED: "Appeal ready",
  SUBMITTED: "Submitted",
  COMPLETED: "Completed",
  MANUAL_REVIEW: "Under review",
};

export default function AdminReportsPage() {
  const [data, setData] = useState<ReportsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/reports", { credentials: "same-origin", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? `Could not load reports (${res.status}).`);
        return;
      }
      setData(json.data as ReportsData);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byLifecycle = data?.byLifecycle ?? {};

  return (
    <AdminPage
      title="Reports"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tone="pink" label="Open Cases" value={data?.openCases ?? 0} icon={<Ic><rect x="4" y="6" width="16" height="14" rx="2" /></Ic>} />
        <KpiCard tone="blue" label="Completed Cases" value={data?.completedCases ?? 0} icon={<Ic><path d="M20 6L9 17l-5-5" /></Ic>} />
        <KpiCard tone="emerald" label="Revenue" value={formatCurrency(data?.revenue ?? 0)} icon={<Ic><path d="M12 3v18" /></Ic>} />
        <KpiCard tone="amber" label="Pending" value={formatCurrency(data?.pending ?? 0)} icon={<Ic><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Ic>} />
      </div>

      <AdminCard className="mt-6">
        <AdminCardHeader title="Cases by status" />
        <ul className="divide-y divide-brand-borderSoft text-[13px]">
          {Object.entries(byLifecycle).map(([status, count]) => (
            <li key={status} className="flex items-center justify-between px-4 py-3">
              <span>{LIFECYCLE_LABELS[status] ?? status.replace(/_/g, " ")}</span>
              <span className="font-semibold text-brand-text">{count}</span>
            </li>
          ))}
          {data && Object.keys(byLifecycle).length === 0 && (
            <li className="px-4 py-8 text-center text-brand-mute">No cases yet.</li>
          )}
        </ul>
      </AdminCard>
    </AdminPage>
  );
}
