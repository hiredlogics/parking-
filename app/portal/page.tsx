"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatCurrency, formatDate, humanCaseType, timeAgo } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader, StatusPill } from "@/components/admin/ui";

export default function PortalDashboard() {
  const client = useCrm((s) => s.clients[0]);
  const casesAll = useCrm((s) => s.cases);
  const appealsAll = useCrm((s) => s.appeals);
  const documentsAll = useCrm((s) => s.documents);
  const messagesAll = useCrm((s) => s.communications);
  const activityAll = useCrm((s) => s.activity);
  const paymentsAll = useCrm((s) => s.payments);

  const cid = client?.id;
  const cases = useMemo(() => casesAll.filter((c) => c.clientId === cid), [casesAll, cid]);
  const appeals = useMemo(() => appealsAll.filter((a) => a.clientId === cid), [appealsAll, cid]);
  const documents = useMemo(() => documentsAll.filter((d) => d.clientId === cid), [documentsAll, cid]);
  const messages = useMemo(() => messagesAll.filter((c) => c.clientId === cid), [messagesAll, cid]);
  const activity = useMemo(() => activityAll.filter((a) => a.clientId === cid), [activityAll, cid]);
  const payments = useMemo(() => paymentsAll.filter((p) => p.clientId === cid), [paymentsAll, cid]);

  return (
    <AdminPage title="My Dashboard" breadcrumb={<span>Welcome back{client ? `, ${client.name.split(" ")[0]}` : ""}</span>}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <AdminCard>
          <AdminCardHeader title="My Cases" right={<Link href="/portal/cases">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft">
            {cases.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{c.reference}</p>
                  <p className="text-[11px] text-brand-mute">{humanCaseType(c.type)}</p>
                </div>
                <StatusPill status={c.status} size="sm" />
              </li>
            ))}
            {cases.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No cases yet.</li>}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="My Appeals" right={<Link href="/portal/appeals">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft">
            {appeals.slice(0, 4).map((a) => (
              <li key={a.id} className="px-4 py-3">
                <p className="text-[13px] font-semibold">{a.pcnReference}</p>
                <p className="text-[11px] text-brand-mute">
                  {a.operator} · {a.vrm} · {a.appealStatus}
                </p>
              </li>
            ))}
            {appeals.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No appeals yet.</li>}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Recent activity" />
          <ul className="divide-y divide-brand-borderSoft">
            {activity.slice(0, 5).map((a) => (
              <li key={a.id} className="px-4 py-3 text-[13px]">
                <p>{a.description}</p>
                <p className="mt-0.5 text-[11px] text-brand-mute">{timeAgo(a.createdAt)}</p>
              </li>
            ))}
            {activity.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-brand-mute">Nothing recent.</li>}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Recent documents" right={<Link href="/portal/documents">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {documents.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <span className="truncate">{d.name}</span>
                <span className="text-[11px] text-brand-mute">{formatDate(d.uploadedAt)}</span>
              </li>
            ))}
            {documents.length === 0 && <li className="px-4 py-6 text-center text-brand-mute">No documents.</li>}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Messages" right={<Link href="/portal/messages">Open</Link>} />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {messages.slice(0, 3).map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="font-semibold text-brand-text">{m.subject}</p>
                <p className="mt-0.5 text-[11.5px] text-brand-mute">{formatDate(m.createdAt, { time: true })}</p>
              </li>
            ))}
            {messages.length === 0 && <li className="px-4 py-6 text-center text-brand-mute">Inbox empty.</li>}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Invoices" right={<Link href="/portal/invoices">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {payments.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold">{p.reference}</p>
                  <p className="text-[11.5px] text-brand-mute">{p.service}</p>
                </div>
                <span className="font-semibold">{formatCurrency(p.amount)}</span>
              </li>
            ))}
            {payments.length === 0 && <li className="px-4 py-6 text-center text-brand-mute">No invoices.</li>}
          </ul>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
