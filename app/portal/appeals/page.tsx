"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function PortalAppealsPage() {
  const client = useCrm((s) => s.clients[0]);
  const appealsAll = useCrm((s) => s.appeals);
  const appeals = useMemo(() => appealsAll.filter((a) => a.clientId === client?.id), [appealsAll, client?.id]);
  return (
    <AdminPage title="My Appeals" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title={`${appeals.length} appeal${appeals.length === 1 ? "" : "s"}`} />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">PCN Ref</th>
                <th className="px-4 py-2">VRM</th>
                <th className="px-4 py-2">Operator</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {appeals.map((a) => (
                <tr key={a.id}>
                  <td className="px-4 py-3 font-mono">{a.pcnReference}</td>
                  <td className="px-4 py-3">{a.vrm}</td>
                  <td className="px-4 py-3">{a.operator}</td>
                  <td className="px-4 py-3">{a.service.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-brand-pinkLight px-2 py-0.5 text-[10.5px] font-semibold text-brand-pink">
                      {a.appealStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(a.createdAt)}</td>
                </tr>
              ))}
              {appeals.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-mute">No appeals yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
