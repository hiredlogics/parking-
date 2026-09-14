"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader, KpiCard } from "@/components/admin/ui";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

interface PaymentRow {
  id: string;
  caseId: string;
  casePublicId: string;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  description: string | null;
  createdAt: string;
}

export default function AdminFinancePage() {
  const [payments, setPayments] = useState<PaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/finance", { credentials: "same-origin", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? `Could not load payments (${res.status}).`);
        setPayments([]);
        return;
      }
      setPayments(json.data.payments as PaymentRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = payments ?? [];
  const revenue = rows.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const pending = rows
    .filter((p) => p.status === "PENDING" || p.status === "CHECKOUT_CREATED")
    .reduce((s, p) => s + p.amount, 0);
  const refunded = rows.filter((p) => p.status === "REFUNDED").reduce((s, p) => s + p.amount, 0);
  const paidCount = rows.filter((p) => p.status === "PAID").length;

  return (
    <AdminPage
      title="Finance"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tone="emerald" label="Revenue" value={formatCurrency(revenue)} icon={<Ic><path d="M12 3v18M18 8l-6-4-6 4M6 16l6 4 6-4" /></Ic>} />
        <KpiCard tone="pink" label="Payments" value={paidCount} icon={<Ic><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></Ic>} />
        <KpiCard tone="amber" label="Pending" value={formatCurrency(pending)} icon={<Ic><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Ic>} />
        <KpiCard tone="violet" label="Refunded" value={formatCurrency(refunded)} icon={<Ic><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /></Ic>} />
      </div>

      <AdminCard className="mt-6">
        <AdminCardHeader title={payments === null ? "Loading…" : `Transactions (${rows.length})`} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Case</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Provider</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-brand-pinkPale/50">
                  <td className="px-4 py-3 font-mono">{p.casePublicId}</td>
                  <td className="px-4 py-3">
                    {p.customerId ? (
                      <Link href={`/admin/clients/${p.customerId}`} className="font-semibold text-brand-text hover:text-brand-pink">
                        {p.customerName ?? "—"}
                      </Link>
                    ) : (
                      <span className="text-brand-text/80">{p.customerName ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-brand-text/80">{p.provider}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      p.status === "PAID"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.status === "PENDING" || p.status === "CHECKOUT_CREATED"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-700"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
              {payments !== null && rows.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-mute">No payments yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
