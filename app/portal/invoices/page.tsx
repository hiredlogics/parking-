"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { usePortalOverview } from "@/features/portal/usePortalOverview";
import { formatCurrency, formatDate } from "@/lib/crm/format";

/**
 * Invoices — same layout as before, now backed by real payments.
 *
 * Reads `case_payments`, the rows the payment gate itself writes, so
 * there is no separate billing model to keep in step. The reference
 * shown is the case reference, which is what a customer recognises.
 */
export default function PortalInvoicesPage() {
  const { data, error, loading } = usePortalOverview();
  const invoices = data?.invoices ?? [];

  return (
    <AdminPage title="Invoices" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader
          title={loading ? "Loading…" : `${invoices.length} invoice${invoices.length === 1 ? "" : "s"}`}
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
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {invoices.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono">
                    <Link href={`/portal/cases/${p.caseId}`} className="hover:text-brand-pink hover:underline">
                      {p.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.service}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      p.status === "PAID"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.status === "FAILED" || p.status === "REFUNDED"
                          ? "bg-slate-100 text-slate-700"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
              {!loading && invoices.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-mute">No invoices yet.</td></tr>
              )}
              {loading && (
                <tr><td colSpan={5} className="px-4 py-8"><div className="h-12 animate-pulse rounded-xl bg-brand-canvas" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
