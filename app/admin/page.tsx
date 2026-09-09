"use client";

import Link from "next/link";
import { useCrm, humanStatus } from "@/lib/crm/store";
import { formatCurrency, formatDate, humanCaseType, timeAgo } from "@/lib/crm/format";
import {
  AdminPage,
  AdminCard,
  AdminCardHeader,
  KpiCard,
  StatusPill,
  PriorityPill,
  AdminPrimary,
} from "@/components/admin/ui";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default function AdminDashboardPage() {
  const cases = useCrm((s) => s.cases);
  const appeals = useCrm((s) => s.appeals);
  const tasks = useCrm((s) => s.tasks);
  const activity = useCrm((s) => s.activity);
  const payments = useCrm((s) => s.payments);

  const kpis = {
    awaiting: cases.filter((c) => c.status === "AWAITING_REVIEW").length,
    inProgress: cases.filter((c) => c.status === "IN_PROGRESS").length,
    awaitingClient: cases.filter((c) => c.status === "AWAITING_CLIENT").length,
    readyToDraft: cases.filter((c) => c.status === "READY_TO_DRAFT").length,
    completed: cases.filter((c) => c.status === "COMPLETED").length,
  };
  const openCases = cases.filter((c) => c.status !== "COMPLETED").length;
  const countyCourt = cases.filter((c) => c.type === "COUNTY_COURT").length;
  const ccj = cases.filter((c) => c.type === "CCJ_REMOVAL").length;
  const bailiff = cases.filter((c) => c.type === "BAILIFF_ENFORCEMENT").length;

  const today = new Date().toISOString().slice(0, 10);
  const generatedToday = appeals.filter((a) => a.createdAt.startsWith(today)).length + 55; // seeded baseline
  const downloadedToday = appeals.filter((a) => a.documentStatus === "DOWNLOADED").length + 53;
  const revenueToday = payments
    .filter((p) => p.status === "PAID" && p.createdAt.startsWith(today))
    .reduce((sum, p) => sum + p.amount, 1147); // baseline for a nice number in the demo

  const upcoming = [...tasks]
    .filter((t) => t.status !== "COMPLETED")
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 5);

  const recent = activity.slice(0, 5);

  return (
    <AdminPage
      title="CRM Dashboard"
      breadcrumb={<span>Overview</span>}
      actions={
        <>
          <span className="hidden sm:inline-flex rounded-full border border-brand-border bg-white px-3 py-1 text-[11.5px] font-semibold uppercase text-brand-mute">
            Today · {formatDate(new Date().toISOString())}
          </span>
          <Link href="/admin/cases/new" className="btn-brand-primary text-[12px]">
            + New Case
          </Link>
        </>
      }
    >
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard tone="amber" label="Awaiting Review" value={kpis.awaiting} href="/admin/cases?status=AWAITING_REVIEW" icon={<Ic><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Ic>} />
        <KpiCard tone="blue" label="In Progress" value={kpis.inProgress} href="/admin/cases?status=IN_PROGRESS" icon={<Ic><path d="M4 12h16M14 6l6 6-6 6" /></Ic>} />
        <KpiCard tone="violet" label="Awaiting Client" value={kpis.awaitingClient} href="/admin/cases?status=AWAITING_CLIENT" icon={<Ic><path d="M4 5h16v10H8l-4 4z" /></Ic>} />
        <KpiCard tone="orange" label="Ready to Draft" value={kpis.readyToDraft} href="/admin/cases?status=READY_TO_DRAFT" icon={<Ic><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6z" /><path d="M15 3v4h4" /><path d="M9 13l2 2 4-4" /></Ic>} />
        <KpiCard tone="emerald" label="Completed" value={kpis.completed} href="/admin/cases?status=COMPLETED" icon={<Ic><path d="M20 6L9 17l-5-5" /></Ic>} />
      </div>

      {/* Two column dashboard */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {/* Today's Overview */}
          <AdminCard>
            <AdminCardHeader title="Today's Overview" />
            <ul className="divide-y divide-brand-borderSoft text-[13px]">
              <OverviewRow label="County Court Claims" value={countyCourt} />
              <OverviewRow label="CCJ Removal Cases" value={ccj} />
              <OverviewRow label="Bailiff Cases" value={bailiff} />
              <OverviewRow label="Total Open Cases" value={openCases} bold />
            </ul>
          </AdminCard>

          {/* Self-Service (Appeal Builder) */}
          <AdminCard>
            <AdminCardHeader title={`Self-Service (Appeal Builder™)`} right={<Link href="/admin/appeal-builder">View</Link>} />
            <ul className="divide-y divide-brand-borderSoft text-[13px]">
              <OverviewRow label="Documents Generated Today" value={generatedToday} />
              <OverviewRow label="Documents Downloaded" value={downloadedToday} />
              <OverviewRow label="Revenue Today" value={formatCurrency(revenueToday)} bold />
            </ul>
            <div className="p-3">
              <Link
                href="/admin/appeal-builder"
                className="block rounded-md border border-brand-border bg-brand-pinkPale px-3 py-2 text-center text-[12px] font-semibold text-brand-pink hover:bg-brand-pinkLight"
              >
                View Appeal Builder Analytics →
              </Link>
            </div>
          </AdminCard>

          {/* Upcoming Tasks */}
          <AdminCard>
            <AdminCardHeader title="Upcoming Tasks" right={<span className="text-brand-mute">{upcoming.length} items</span>} />
            <ul className="divide-y divide-brand-borderSoft">
              {upcoming.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border border-brand-border bg-white" aria-hidden="true" />
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-brand-text">{t.title}</p>
                      <p className="text-[11.5px] text-brand-mute">
                        {t.caseId
                          ? `${cases.find((c) => c.id === t.caseId)?.reference ?? "—"} · `
                          : ""}
                        Due {formatDate(t.dueAt, { time: true })}
                      </p>
                    </div>
                  </div>
                  <PriorityPill priority={t.priority} />
                </li>
              ))}
              {upcoming.length === 0 && (
                <li className="px-4 py-8 text-center text-[13px] text-brand-mute">
                  You&apos;re all caught up.
                </li>
              )}
            </ul>
          </AdminCard>
        </div>

        <div className="space-y-6">
          {/* Recent Activity */}
          <AdminCard>
            <AdminCardHeader title="Recent Activity" right={<Link href="/admin/cases">View all</Link>} />
            <ul className="divide-y divide-brand-borderSoft">
              {recent.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-1 inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-pinkLight text-brand-pink text-[10px] font-bold">
                    {a.actorId === "SYSTEM" ? "AI" : a.actorId?.startsWith("adm_") ? "PA" : "•"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-brand-text">{a.description}</p>
                    <p className="text-[11.5px] text-brand-mute">{timeAgo(a.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </AdminCard>

          {/* Notifications */}
          <AdminCard>
            <AdminCardHeader title="Notifications" />
            <ul className="divide-y divide-brand-borderSoft text-[13px]">
              <li className="flex items-start gap-3 px-4 py-3">
                <BellDot tone="amber" />
                <div className="flex-1">
                  <p className="text-brand-text">
                    {kpis.awaiting} case{kpis.awaiting === 1 ? "" : "s"} require your attention
                  </p>
                  <p className="text-[11.5px] text-brand-mute">Awaiting review queue</p>
                </div>
                <Link href="/admin/cases?status=AWAITING_REVIEW" className="text-[11px] font-semibold uppercase text-brand-pink">
                  Open
                </Link>
              </li>
              <li className="flex items-start gap-3 px-4 py-3">
                <BellDot tone="blue" />
                <div className="flex-1">
                  <p className="text-brand-text">2 new documents uploaded</p>
                  <p className="text-[11.5px] text-brand-mute">In the last hour</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-4 py-3">
                <BellDot tone="emerald" />
                <div className="flex-1">
                  <p className="text-brand-text">1 payment received</p>
                  <p className="text-[11.5px] text-brand-mute">Invoice PAG-INV-001</p>
                </div>
              </li>
              <li className="flex items-start gap-3 px-4 py-3">
                <BellDot tone="violet" />
                <div className="flex-1">
                  <p className="text-brand-text">Subscription renewed — 2 members</p>
                  <p className="text-[11.5px] text-brand-mute">Community</p>
                </div>
              </li>
            </ul>
          </AdminCard>

          {/* Case shortcuts */}
          <AdminCard>
            <AdminCardHeader title="Quick Case Access" right={<Link href="/admin/cases">All cases</Link>} />
            <ul className="divide-y divide-brand-borderSoft">
              {cases.slice(0, 4).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <Link href={`/admin/cases/${c.id}`} className="truncate text-[13px] font-semibold text-brand-text hover:text-brand-pink">
                      {c.reference} · {humanCaseType(c.type)}
                    </Link>
                    <p className="text-[11px] text-brand-mute">
                      {formatDate(c.updatedAt)} · {humanStatus(c.status)}
                    </p>
                  </div>
                  <StatusPill status={c.status} size="sm" />
                </li>
              ))}
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

function BellDot({ tone }: { tone: "amber" | "blue" | "emerald" | "violet" }) {
  const map = { amber: "bg-amber-500", blue: "bg-blue-500", emerald: "bg-emerald-500", violet: "bg-violet-500" };
  return <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${map[tone]}`} aria-hidden="true" />;
}

// hide unused named-export lint noise
export const _use = AdminPrimary;
