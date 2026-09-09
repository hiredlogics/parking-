"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard } from "@/components/admin/ui";

export default function PortalMessagesPage() {
  const client = useCrm((s) => s.clients[0]);
  const msgsAll = useCrm((s) => s.communications);
  const msgs = useMemo(() => msgsAll.filter((c) => c.clientId === client?.id), [msgsAll, client?.id]);
  return (
    <AdminPage title="Messages" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <ul className="divide-y divide-brand-borderSoft">
          {msgs.map((m) => (
            <li key={m.id} className="px-4 py-3 text-[13px]">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand-text">{m.subject}</p>
                <span className="rounded-full bg-brand-canvas px-2 py-0.5 text-[10.5px] font-semibold text-brand-mute">
                  {m.type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-brand-text/85">{m.body}</p>
              <p className="mt-1 text-[11px] text-brand-mute">{formatDate(m.createdAt, { time: true })}</p>
            </li>
          ))}
          {msgs.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No messages yet.</li>}
        </ul>
      </AdminCard>
    </AdminPage>
  );
}
