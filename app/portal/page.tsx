"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { usePortalOverview } from "@/features/portal/usePortalOverview";

/**
 * Customer dashboard — only what matters:
 *   cases, documents, payments.
 */
export default function PortalDashboard() {
  const { data, loading } = usePortalOverview();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setName(d?.user?.name ?? null))
      .catch(() => undefined);
  }, []);

  const cases = data?.cases ?? [];
  const documents = data?.documents ?? [];
  const invoices = data?.invoices ?? [];
  const events = data?.events ?? [];
  const readyEvents = events.filter((e) =>
    e.description.toLowerCase().includes("approved"),
  );
  const latestReady = readyEvents[0] ?? null;

  return (
    <AdminPage
      title="My cases"
      breadcrumb={
        <span>Welcome back{name ? `, ${name.split(" ")[0]}` : ""}</span>
      }
    >
      {loading && (
        <p className="mb-4 text-[13px] text-brand-mute">Loading…</p>
      )}

      {latestReady && (
        <div className="mb-5 rounded-xl border border-brand-pink/30 bg-brand-pinkPale px-4 py-3">
          <p className="text-[13px] font-semibold text-brand-pink">
            {latestReady.description}
          </p>
          <p className="mt-1 text-[12px] text-brand-mute">
            Case {latestReady.casePublicId} — your branded PDF is ready to view
            and download.
          </p>
          <Link
            href={`/portal/cases/${latestReady.caseId}`}
            className="mt-2 inline-block text-[12px] font-semibold text-brand-pink hover:underline"
          >
            Open case
          </Link>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-brand-mute">
          {cases.length === 0
            ? "You have no appeals in progress."
            : `${cases.length} case${cases.length === 1 ? "" : "s"}`}
        </p>
        <Link href="/appeal/upload" className="btn-brand-primary">
          Start new appeal
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AdminCard className="lg:col-span-2">
          <AdminCardHeader
            title="Cases"
            right={<Link href="/portal/cases">View all</Link>}
          />
          <ul className="divide-y divide-brand-borderSoft">
            {cases.slice(0, 6).map((c) => (
              <li
                key={c.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/portal/cases/${c.id}`}
                    className="text-[14px] font-semibold hover:text-brand-pink"
                  >
                    {c.publicId}
                  </Link>
                  <p className="truncate text-[12px] text-brand-mute">
                    {[c.operatorName, c.pcnNumber, c.vrm]
                      .filter(Boolean)
                      .join(" · ") || "Parking appeal"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full bg-brand-pinkPale px-2.5 py-0.5 text-[11px] font-semibold text-brand-text">
                    {c.caseStatusLabel}
                  </span>
                  <Link
                    href={`/portal/cases/${c.id}`}
                    className="text-[12px] font-semibold text-brand-pink hover:underline"
                  >
                    View
                  </Link>
                </div>
              </li>
            ))}
            {cases.length === 0 && (
              <li className="px-4 py-8 text-center text-[13px] text-brand-mute">
                No cases yet.{" "}
                <Link
                  href="/appeal/upload"
                  className="font-semibold text-brand-pink"
                >
                  Upload a notice
                </Link>{" "}
                to start.
              </li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            title="Documents"
            right={<Link href="/portal/documents">View all</Link>}
          />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {documents.slice(0, 5).map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <a
                    href={d.viewUrl}
                    className="block truncate font-medium hover:text-brand-pink"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.name}
                  </a>
                  <p className="text-[11px] text-brand-mute">{d.category}</p>
                </div>
                <span className="shrink-0 text-[11px] text-brand-mute">
                  {formatDate(d.uploadedAt)}
                </span>
              </li>
            ))}
            {documents.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-mute">
                No documents yet.
              </li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Notifications" />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {events.slice(0, 6).map((e) => (
              <li key={e.id} className="px-4 py-3">
                <Link
                  href={`/portal/cases/${e.caseId}`}
                  className="font-medium hover:text-brand-pink"
                >
                  {e.description}
                </Link>
                <p className="text-[11px] text-brand-mute">
                  {e.casePublicId} · {formatDate(e.createdAt)}
                </p>
              </li>
            ))}
            {events.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-mute">
                No notifications yet.
              </li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            title="Payments"
            right={<Link href="/portal/invoices">View all</Link>}
          />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {invoices.slice(0, 5).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{p.reference}</p>
                  <p className="text-[11.5px] text-brand-mute">{p.service}</p>
                </div>
                <span className="shrink-0 font-semibold">
                  {formatCurrency(p.amount)}
                </span>
              </li>
            ))}
            {invoices.length === 0 && (
              <li className="px-4 py-6 text-center text-brand-mute">
                No payments yet.
              </li>
            )}
          </ul>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
