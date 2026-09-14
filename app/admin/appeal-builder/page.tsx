"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader, KpiCard } from "@/components/admin/ui";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const READY_LIFECYCLE = new Set(["GENERATED", "SUBMITTED", "COMPLETED"]);

interface CaseRow {
  id: string;
  publicId: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  lifecycleStatus: string;
  serviceType: string;
  operatorName: string | null;
  pcnNumber: string | null;
  vrm: string | null;
  paymentStatus: string;
  createdAt: string;
}

interface PaymentRow {
  status: string;
  amount: number;
}

/**
 * Self-service Appeal Builder is the real customer flow — every row
 * here is a live `appeal_cases` record with `serviceType =
 * PRIVATE_PARKING_INITIAL_APPEAL`, the only service currently offered.
 */
export default function AdminAppealBuilderPage() {
  const [rows, setRows] = useState<CaseRow[] | null>(null);
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [casesRes, financeRes] = await Promise.all([
        fetch("/api/admin/cases", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin/finance", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const casesJson = await casesRes.json().catch(() => null);
      const financeJson = await financeRes.json().catch(() => null);
      if (cancelled) return;
      if (!casesRes.ok || !casesJson?.success) {
        setError(casesJson?.error?.message ?? `Could not load appeals (${casesRes.status}).`);
        setRows([]);
      } else {
        setRows(casesJson.data.cases as CaseRow[]);
      }
      if (financeRes.ok && financeJson?.success) {
        setPayments(financeJson.data.payments as PaymentRow[]);
      } else {
        setPayments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    if (!q.trim()) return rows;
    const s = q.trim().toLowerCase();
    return rows.filter((a) =>
      `${a.customerName ?? ""} ${a.pcnNumber ?? ""} ${a.vrm ?? ""} ${a.operatorName ?? ""}`
        .toLowerCase()
        .includes(s),
    );
  }, [rows, q]);

  const generated = rows?.length ?? 0;
  const ready = rows?.filter((r) => READY_LIFECYCLE.has(r.lifecycleStatus)).length ?? 0;
  const conversion = generated > 0 ? Math.round((ready / generated) * 100) : 0;
  const revenue = (payments ?? []).filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);

  return (
    <AdminPage
      title="Appeal Builder™ (Self-Service)"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
      actions={
        <input
          className="app-input h-9 w-full sm:w-72"
          placeholder="Search appeals…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tone="pink" label="Appeals Generated" value={generated} icon={<Ic><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6z" /><path d="M15 3v4h4" /><path d="M8 12h8M8 15h5" /></Ic>} />
        <KpiCard tone="blue" label="Ready / Submitted" value={ready} icon={<Ic><path d="M12 4v11" /><path d="M7 10l5 5 5-5" /><path d="M5 20h14" /></Ic>} />
        <KpiCard tone="emerald" label="Conversion Rate" value={`${conversion}%`} icon={<Ic><path d="M20 6L9 17l-5-5" /></Ic>} />
        <KpiCard tone="amber" label="Revenue" value={formatCurrency(revenue)} icon={<Ic><path d="M12 3v18M18 8l-6-4-6 4M6 16l6 4 6-4" /></Ic>} />
      </div>

      {/* Records table */}
      <AdminCard className="mt-6">
        <AdminCardHeader title={rows === null ? "Loading…" : `Self-service records (${filtered.length})`} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">PCN Ref</th>
                <th className="px-4 py-2">VRM</th>
                <th className="px-4 py-2">Operator</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-brand-pinkPale/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/appeals/${a.id}`} className="font-semibold text-brand-text hover:text-brand-pink">
                      {a.customerName ?? "Unknown"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono">{a.pcnNumber ?? "—"}</td>
                  <td className="px-4 py-3">{a.vrm ?? "—"}</td>
                  <td className="px-4 py-3">{a.operatorName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-brand-pinkLight px-2 py-0.5 text-[10.5px] font-semibold text-brand-pink">
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px]">{a.paymentStatus}</td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
              {rows !== null && filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-brand-mute">No self-service records match.</td></tr>
              )}
              {rows === null && (
                <tr><td colSpan={7} className="px-4 py-8"><div className="h-16 animate-pulse rounded-xl bg-brand-canvas" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
