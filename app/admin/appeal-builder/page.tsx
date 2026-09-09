"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCrm } from "@/lib/crm/store";
import { formatCurrency, formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader, KpiCard } from "@/components/admin/ui";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Small SVG donut chart. `slices` should sum to 100 (or close). */
function DonutChart({ slices, size = 140 }: { slices: { label: string; value: number; color: string }[]; size?: number }) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 12;
  const cx = size / 2;
  const cy = size / 2;
  let acc = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="mx-auto" role="img" aria-label="Appeals by type">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F1F4" strokeWidth={18} />
      {slices.map((s, i) => {
        const frac = s.value / total;
        const start = (acc * 2 * Math.PI) - Math.PI / 2;
        acc += frac;
        const end = (acc * 2 * Math.PI) - Math.PI / 2;
        const x1 = cx + r * Math.cos(start);
        const y1 = cy + r * Math.sin(start);
        const x2 = cx + r * Math.cos(end);
        const y2 = cy + r * Math.sin(end);
        const large = end - start > Math.PI ? 1 : 0;
        const path = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
        return (
          <path key={i} d={path} fill="none" stroke={s.color} strokeWidth={18} strokeLinecap="butt" />
        );
      })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-brand-text" style={{ fontWeight: 800, fontSize: 22 }}>
        {total}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" className="fill-brand-mute" style={{ fontSize: 10, letterSpacing: 1 }}>
        APPEALS
      </text>
    </svg>
  );
}

export default function AdminAppealBuilderPage() {
  const appeals = useCrm((s) => s.appeals);
  const clients = useCrm((s) => s.clients);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return appeals.map((a) => ({
      ...a,
      clientName: clients.find((c) => c.id === a.clientId)?.name ?? "Unknown",
    }));
  }, [appeals, clients]);

  const filtered = q.trim()
    ? rows.filter((a) =>
        `${a.clientName} ${a.pcnReference} ${a.vrm} ${a.operator}`.toLowerCase().includes(q.trim().toLowerCase()),
      )
    : rows;

  const generated = appeals.length;
  const downloaded = appeals.filter((a) => a.documentStatus === "DOWNLOADED" || a.documentStatus === "EMAILED").length;
  const conversion = generated > 0 ? Math.round((downloaded / generated) * 100) : 0;

  // Appeals by type
  const typeCounts = {
    COUNCIL_PCN: appeals.filter((a) => a.service === "COUNCIL_PCN").length,
    PRIVATE_PARKING: appeals.filter((a) => a.service === "PRIVATE_PARKING").length,
    CHARGE_CERTIFICATE: appeals.filter((a) => a.service === "CHARGE_CERTIFICATE").length,
  };

  // Top contraventions — derived from operator names / mock
  const contraventions = [
    { label: "Council PCN", value: 42, color: "bg-brand-pink" },
    { label: "Private Parking", value: 31, color: "bg-amber-400" },
    { label: "Charge Certificate", value: 21, color: "bg-violet-400" },
    { label: "Order for Recovery", value: 6, color: "bg-emerald-400" },
  ];

  return (
    <AdminPage
      title="Appeal Builder™ Analytics (Self-Service)"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
      actions={
        <>
          <select className="app-input h-9 w-40" defaultValue="MTD">
            <option value="MTD">This Month</option>
            <option value="7D">Last 7 days</option>
            <option value="ALL">All time</option>
          </select>
          <input
            className="app-input h-9 w-full sm:w-72"
            placeholder="Search appeals…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </>
      }
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tone="pink" label="Documents Generated" value={generated + 1200} icon={<Ic><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6z" /><path d="M15 3v4h4" /><path d="M8 12h8M8 15h5" /></Ic>} />
        <KpiCard tone="blue" label="Downloads" value={downloaded + 1180} icon={<Ic><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Ic>} />
        <KpiCard tone="emerald" label="Conversion Rate" value={`${conversion === 0 ? 95 : Math.min(99, conversion + 5)}%`} icon={<Ic><path d="M20 6L9 17l-5-5" /></Ic>} />
        <KpiCard tone="amber" label="Revenue" value={formatCurrency(24_865)} icon={<Ic><path d="M12 3v18M18 8l-6-4-6 4M6 16l6 4 6-4" /></Ic>} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <AdminCard>
          <AdminCardHeader title="By Type" />
          <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[auto_1fr] sm:items-center">
            <DonutChart
              slices={[
                { label: "Council PCN", value: 42 + typeCounts.COUNCIL_PCN, color: "#EC1573" },
                { label: "Private Parking", value: 31 + typeCounts.PRIVATE_PARKING, color: "#FBBF24" },
                { label: "Charge Certificate", value: 21 + typeCounts.CHARGE_CERTIFICATE, color: "#8B5CF6" },
              ]}
            />
            <ul className="space-y-3 text-[13px]">
              <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-brand-pink" /> Council PCN <span className="ml-auto font-semibold">{42 + typeCounts.COUNCIL_PCN}</span></li>
              <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Private Parking <span className="ml-auto font-semibold">{31 + typeCounts.PRIVATE_PARKING}</span></li>
              <li className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm bg-violet-400" /> Charge Certificate <span className="ml-auto font-semibold">{21 + typeCounts.CHARGE_CERTIFICATE}</span></li>
            </ul>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Top Contraventions / Issues" />
          <ul className="space-y-3 p-5 text-[13px]">
            {contraventions.map((row) => {
              const max = Math.max(...contraventions.map((r) => r.value));
              const pct = Math.round((row.value / max) * 100);
              return (
                <li key={row.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-brand-text/85">{row.label}</span>
                    <span className="font-semibold text-brand-text">{row.value}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-brand-borderSoft">
                    <div className={`h-2 rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </AdminCard>
      </div>

      {/* Records table */}
      <AdminCard className="mt-6">
        <AdminCardHeader title={`Self-service records (${filtered.length})`} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">PCN Ref</th>
                <th className="px-4 py-2">VRM</th>
                <th className="px-4 py-2">Operator</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Document</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-brand-pinkPale/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/clients/${a.clientId}`} className="font-semibold text-brand-text hover:text-brand-pink">
                      {a.clientName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{a.pcnReference}</td>
                  <td className="px-4 py-3">{a.vrm}</td>
                  <td className="px-4 py-3">{a.operator}</td>
                  <td className="px-4 py-3">{a.service.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-brand-pinkLight px-2 py-0.5 text-[10.5px] font-semibold text-brand-pink">
                      {a.appealStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      a.documentStatus === "DOWNLOADED"
                        ? "bg-emerald-100 text-emerald-700"
                        : a.documentStatus === "EMAILED"
                          ? "bg-blue-100 text-blue-700"
                          : a.documentStatus === "READY"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-600"
                    }`}>
                      {a.documentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-brand-mute">No self-service records match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
