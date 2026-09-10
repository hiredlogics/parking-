"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatCurrency, formatDate, timeAgo } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { usePortalOverview } from "@/features/portal/usePortalOverview";

/**
 * My Dashboard — layout unchanged.
 *
 * Cases, Appeals, Documents and Invoices now come from the real case
 * model. Recent activity and Messages still read the V1 CRM demo store
 * because no customer-facing source exists for them yet; they are the
 * only remaining mock panels.
 */
export default function PortalDashboard() {
  const { data } = usePortalOverview();

  // Still demo: no real messaging or customer-facing activity feed.
  const client = useCrm((s) => s.clients[0]);
  const messagesAll = useCrm((s) => s.communications);
  const activityAll = useCrm((s) => s.activity);
  const cid = client?.id;
  const messages = useMemo(
    () => messagesAll.filter((c) => c.clientId === cid),
    [messagesAll, cid],
  );
  const activity = useMemo(
    () => activityAll.filter((a) => a.clientId === cid),
    [activityAll, cid],
  );

  const cases = data?.cases ?? [];
  const appeals = data?.appeals ?? [];
  const documents = data?.documents ?? [];
  const invoices = data?.invoices ?? [];

  return (
    <AdminPage
      title="My Dashboard"
      breadcrumb={<span>Welcome back{client ? `, ${client.name.split(" ")[0]}` : ""}</span>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <AdminCard>
          <AdminCardHeader title="My Cases" right={<Link href="/portal/cases">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft">
            {cases.slice(0, 4).map((c) => (
              <li key={c.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <Link
                    href={`/portal/cases/${c.id}`}
                    className="truncate text-[13px] font-semibold hover:text-brand-pink"
                  >
                    {c.publicId}
                  </Link>
                  <p className="text-[11px] text-brand-mute">
                    {c.operatorName ?? "Parking charge"}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-brand-pinkPale px-2 py-0.5 text-[10.5px] font-semibold text-brand-text">
                  {c.caseStatusLabel}
                </span>
              </li>
            ))}
            {cases.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No cases yet.</li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="My Appeals" right={<Link href="/portal/appeals">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft">
            {appeals.slice(0, 4).map((a) => (
              <li key={a.id} className="px-4 py-3">
                <p className="text-[13px] font-semibold">{a.pcnReference ?? "—"}</p>
                <p className="text-[11px] text-brand-mute">
                  {[a.operator, a.vrm, a.appealStatus].filter(Boolean).join(" · ")}
                </p>
              </li>
            ))}
            {appeals.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No appeals yet.</li>
            )}
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
            {activity.length === 0 && (
              <li className="px-4 py-6 text-center text-[13px] text-brand-mute">Nothing recent.</li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Recent documents" right={<Link href="/portal/documents">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {documents.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3">
                <span className="truncate">{d.name}</span>
                <span className="shrink-0 text-[11px] text-brand-mute">
                  {formatDate(d.uploadedAt)}
                </span>
              </li>
            ))}
            {documents.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-mute">No documents.</li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Messages" right={<Link href="/portal/messages">Open</Link>} />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {messages.slice(0, 3).map((m) => (
              <li key={m.id} className="px-4 py-3">
                <p className="font-semibold text-brand-text">{m.subject}</p>
                <p className="mt-0.5 text-[11.5px] text-brand-mute">
                  {formatDate(m.createdAt, { time: true })}
                </p>
              </li>
            ))}
            {messages.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-mute">Inbox empty.</li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Invoices" right={<Link href="/portal/invoices">View all</Link>} />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {invoices.slice(0, 3).map((p) => (
              <li key={p.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.reference}</p>
                  <p className="text-[11.5px] text-brand-mute">{p.service}</p>
                </div>
                <span className="shrink-0 font-semibold">{formatCurrency(p.amount)}</span>
              </li>
            ))}
            {invoices.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-mute">No invoices.</li>
            )}
          </ul>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
