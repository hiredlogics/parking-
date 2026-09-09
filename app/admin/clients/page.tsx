"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatDate, timeAgo } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function AdminClientsPage() {
  const clients = useCrm((s) => s.clients);
  const cases = useCrm((s) => s.cases);
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    return clients.map((c) => {
      const casesForClient = cases.filter((cc) => cc.clientId === c.id);
      return {
        ...c,
        activeCases: casesForClient.filter((cc) => cc.status !== "COMPLETED").length,
        totalCases: casesForClient.length,
      };
    });
  }, [clients, cases]);

  const filtered = q.trim()
    ? rows.filter((r) =>
        `${r.name} ${r.email} ${r.phone ?? ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      )
    : rows;

  return (
    <AdminPage
      title="Clients"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
      actions={
        <input
          className="app-input h-10 w-full sm:w-80"
          placeholder="Search clients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      }
    >
      <AdminCard>
        <AdminCardHeader title={`${filtered.length} of ${clients.length} client${clients.length === 1 ? "" : "s"}`} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2 text-center">Active</th>
                <th className="px-4 py-2 text-center">Total</th>
                <th className="px-4 py-2">Last activity</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-brand-pinkPale/50">
                  <td className="px-4 py-3">
                    <Link href={`/admin/clients/${c.id}`} className="flex items-center gap-2 font-semibold text-brand-text hover:text-brand-pink">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-pinkLight text-[11px] font-bold text-brand-pink">
                        {c.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
                      </span>
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-brand-text/80">{c.email}</td>
                  <td className="px-4 py-3 text-brand-text/80">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-center font-bold text-brand-text">{c.activeCases}</td>
                  <td className="px-4 py-3 text-center text-brand-text/80">{c.totalCases}</td>
                  <td className="px-4 py-3 text-brand-mute">
                    {formatDate(c.lastActivityAt)}
                    <span className="ml-1 text-[10.5px]">({timeAgo(c.lastActivityAt)})</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                      {c.status ?? "ACTIVE"}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-brand-mute">
                    No clients match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
