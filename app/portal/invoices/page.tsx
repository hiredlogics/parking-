"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatCurrency, formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function PortalInvoicesPage() {
  const client = useCrm((s) => s.clients[0]);
  const paymentsAll = useCrm((s) => s.payments);
  const payments = useMemo(() => paymentsAll.filter((p) => p.clientId === client?.id), [paymentsAll, client?.id]);
  return (
    <AdminPage title="Invoices" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title={`${payments.length} invoice${payments.length === 1 ? "" : "s"}`} />
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
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono">{p.reference}</td>
                  <td className="px-4 py-3">{p.service}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      p.status === "PAID"
                        ? "bg-emerald-100 text-emerald-700"
                        : p.status === "PENDING"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-700"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
              {payments.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-mute">No invoices yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
