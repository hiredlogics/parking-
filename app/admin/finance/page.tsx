"use client";

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

export default function AdminFinancePage() {
  const payments = useCrm((s) => s.payments);
  const clients = useCrm((s) => s.clients);

  const revenue = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  const pending = payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
  const refunded = payments.filter((p) => p.status === "REFUNDED").reduce((s, p) => s + p.amount, 0);
  const paidCount = payments.filter((p) => p.status === "PAID").length;

  return (
    <AdminPage
      title="Finance"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
      actions={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-pinkLight px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-brand-pink">
          Stripe integration not connected
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tone="emerald" label="Revenue" value={formatCurrency(revenue)} icon={<Ic><path d="M12 3v18M18 8l-6-4-6 4M6 16l6 4 6-4" /></Ic>} />
        <KpiCard tone="pink" label="Payments" value={paidCount} icon={<Ic><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M2 10h20" /></Ic>} />
        <KpiCard tone="amber" label="Pending" value={formatCurrency(pending)} icon={<Ic><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Ic>} />
        <KpiCard tone="violet" label="Refunded" value={formatCurrency(refunded)} icon={<Ic><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /></Ic>} />
      </div>

      <AdminCard className="mt-6">
        <AdminCardHeader title={`Transactions (${payments.length})`} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {payments.map((p) => {
                const client = clients.find((c) => c.id === p.clientId);
                return (
                  <tr key={p.id} className="hover:bg-brand-pinkPale/50">
                    <td className="px-4 py-3 font-mono">{p.reference}</td>
                    <td className="px-4 py-3">
                      <Link href={`/admin/clients/${p.clientId}`} className="font-semibold text-brand-text hover:text-brand-pink">
                        {client?.name ?? "—"}
                      </Link>
                    </td>
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
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-brand-borderSoft p-4 text-[11.5px] text-brand-mute">
          Stripe / payments provider is intentionally out of scope for this demo. Transactions above use seeded fixtures.
        </div>
      </AdminCard>
    </AdminPage>
  );
}
