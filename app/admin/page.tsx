"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, timeAgo } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader, KpiCard } from "@/components/admin/ui";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

interface DashboardData {
  kpis: {
    total: number;
    inProgress: number;
    readyForPayment: number;
    underReview: number;
    completed: number;
  };
  createdToday: number;
  revenueToday: number;
  openCases: number;
  recentCases: Array<{
    id: string;
    publicId: string;
    customerName: string | null;
    status: string;
    lifecycleStatus: string;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    caseId: string;
    casePublicId: string;
    description: string;
    createdAt: string;
  }>;
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25_000);

    (async () => {
      try {
        const res = await fetch("/api/admin/dashboard", {
          credentials: "same-origin",
          cache: "no-store",
          signal: ac.signal,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(
            json?.error?.message ?? `Could not load the dashboard (${res.status}).`,
          );
        }
        setData(json.data as DashboardData);
        setError(null);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          setError("Timed out loading the dashboard. Please try again.");
        } else {
          setError(e instanceof Error ? e.message : "Could not load the dashboard.");
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

  const kpis = data?.kpis ?? {
    total: 0,
    inProgress: 0,
    readyForPayment: 0,
    underReview: 0,
    completed: 0,
  };

  return (
    <AdminPage title="Dashboard" breadcrumb={<span>Overview</span>}>
      {error && (
        <div className="mb-4 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p>{error}</p>
          <button
            type="button"
            className="btn-brand-outline"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {loading && !data && (
        <p className="mb-4 text-sm text-brand-mute">Loading dashboard…</p>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard tone="pink" label="Total Cases" value={loading && !data ? "…" : kpis.total} href="/admin/appeals" icon={<Ic><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6z" /><path d="M15 3v4h4" /></Ic>} />
        <KpiCard tone="blue" label="In Progress" value={loading && !data ? "…" : kpis.inProgress} href="/admin/appeals" icon={<Ic><path d="M4 12h16M14 6l6 6-6 6" /></Ic>} />
        <KpiCard tone="amber" label="Awaiting Payment" value={loading && !data ? "…" : kpis.readyForPayment} href="/admin/appeals" icon={<Ic><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Ic>} />
        <KpiCard tone="violet" label="Under Review" value={loading && !data ? "…" : kpis.underReview} href="/admin/review" icon={<Ic><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Ic>} />
        <KpiCard tone="emerald" label="Completed" value={loading && !data ? "…" : kpis.completed} href="/admin/appeals" icon={<Ic><path d="M20 6L9 17l-5-5" /></Ic>} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <AdminCard>
            <AdminCardHeader title="Today's Overview" />
            <ul className="divide-y divide-brand-borderSoft text-[13px]">
              <OverviewRow label="Cases Created Today" value={loading && !data ? "…" : (data?.createdToday ?? 0)} />
              <OverviewRow label="Revenue Today" value={loading && !data ? "…" : formatCurrency(data?.revenueToday ?? 0)} />
              <OverviewRow label="Total Open Cases" value={loading && !data ? "…" : (data?.openCases ?? 0)} bold />
            </ul>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader title="Quick Case Access" right={<Link href="/admin/appeals">All cases</Link>} />
            <ul className="divide-y divide-brand-borderSoft">
              {(data?.recentCases ?? []).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/admin/appeals/${c.id}`} className="truncate text-[13px] font-semibold text-brand-text hover:text-brand-pink">
                      {c.publicId} {c.customerName ? `· ${c.customerName}` : ""}
                    </Link>
                    <p className="text-[11px] text-brand-mute">
                      {new Date(c.updatedAt).toLocaleDateString("en-GB")} · {c.status}
                    </p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-brand-pinkPale px-2.5 py-1 text-[11px] font-semibold text-brand-pink">
                    {c.lifecycleStatus.replace(/_/g, " ")}
                  </span>
                </li>
              ))}
              {data && data.recentCases.length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No cases yet.</li>
              )}
              {loading && !data && (
                <li className="px-4 py-8 text-center text-[13px] text-brand-mute">Loading cases…</li>
              )}
            </ul>
          </AdminCard>
        </div>

        <div className="space-y-6">
          <AdminCard>
            <AdminCardHeader
              title="Exception review queue"
              right={<Link href="/admin/review">Open queue</Link>}
            />
            <div className="space-y-2 p-4 text-[13px] text-brand-mute">
              <p>
                Normal appeals release automatically after validation. This
                queue is only for genuine exceptions (safety failure, out of
                scope, or unresolvable facts).
              </p>
              <Link href="/admin/review" className="btn-brand-primary inline-flex">
                Open exception queue
              </Link>
            </div>
          </AdminCard>

          <AdminCard>
            <AdminCardHeader title="Recent Activity" />
            <ul className="divide-y divide-brand-borderSoft">
              {(data?.recentActivity ?? []).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink text-[10px] font-bold">
                    •
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/appeals/${a.caseId}`} className="text-[13px] text-brand-text hover:text-brand-pink">
                      {a.description} — {a.casePublicId}
                    </Link>
                    <p className="text-[11.5px] text-brand-mute">{timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
              {data && data.recentActivity.length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No activity yet.</li>
              )}
              {loading && !data && (
                <li className="px-4 py-8 text-center text-[13px] text-brand-mute">Loading activity…</li>
              )}
            </ul>
          </AdminCard>
        </div>
      </div>
    </AdminPage>
  );
}

function OverviewRow({ label, value, bold }: { label: string; value: string | number; bold?: boolean }) {
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <span className={bold ? "font-semibold text-brand-text" : "text-brand-text/80"}>{label}</span>
      <span className={`font-black ${bold ? "text-brand-pink" : "text-brand-text"}`}>{value}</span>
    </li>
  );
}
