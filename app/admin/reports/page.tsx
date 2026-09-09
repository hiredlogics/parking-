"use client";

import Link from "next/link";
import { useCrm } from "@/lib/crm/store";
import { AdminPage, AdminCard, AdminCardHeader, KpiCard } from "@/components/admin/ui";
import { formatCurrency } from "@/lib/crm/format";

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

export default function AdminReportsPage() {
  const cases = useCrm((s) => s.cases);
  const appeals = useCrm((s) => s.appeals);
  const payments = useCrm((s) => s.payments);
  const revenue = payments.filter((p) => p.status === "PAID").reduce((s, p) => s + p.amount, 0);
  return (
    <AdminPage
      title="Reports"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tone="pink" label="Open Cases" value={cases.filter((c) => c.status !== "COMPLETED").length} icon={<Ic><rect x="4" y="6" width="16" height="14" rx="2" /></Ic>} />
        <KpiCard tone="blue" label="Completed Cases" value={cases.filter((c) => c.status === "COMPLETED").length} icon={<Ic><path d="M20 6L9 17l-5-5" /></Ic>} />
        <KpiCard tone="amber" label="Total Appeals" value={appeals.length} icon={<Ic><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6z" /></Ic>} />
        <KpiCard tone="emerald" label="Revenue" value={formatCurrency(revenue)} icon={<Ic><path d="M12 3v18" /></Ic>} />
      </div>

      <AdminCard className="mt-6">
        <AdminCardHeader title="Downloadable reports" />
        <ul className="divide-y divide-brand-borderSoft text-[13px]">
          {[
            "Cases opened this month",
            "Cases completed this month",
            "Revenue by service",
            "Client acquisition — 30 days",
            "Overdue tasks — active queue",
          ].map((label) => (
            <li key={label} className="flex items-center justify-between px-4 py-3">
              <span>{label}</span>
              <button type="button" className="text-[11.5px] font-semibold uppercase text-brand-pink" onClick={() => alert("Report generation is stubbed in the demo.")}>
                Generate CSV
              </button>
            </li>
          ))}
        </ul>
      </AdminCard>
    </AdminPage>
  );
}
