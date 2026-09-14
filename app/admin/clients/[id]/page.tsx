"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatCurrency, formatDate, timeAgo } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { Tabs, type TabDef } from "@/components/admin/Tabs";

interface ClientData {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  joinedAt: string;
  lastActivityAt: string;
}

interface CaseRow {
  id: string;
  publicId: string;
  serviceType: string;
  status: string;
  lifecycleStatus: string;
  operatorName: string | null;
  pcnNumber: string | null;
  vrm: string | null;
  paymentStatus: string;
  createdAt: string;
  updatedAt: string;
}

interface DocumentRow {
  id: string;
  fileName: string;
  documentType: string;
  casePublicId: string;
  uploadedAt: string;
}

interface PaymentRow {
  id: string;
  casePublicId: string;
  serviceType: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string;
}

interface ProfileResponse {
  client: ClientData;
  cases: CaseRow[];
  documents: DocumentRow[];
  payments: PaymentRow[];
}

export default function AdminClientProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/admin/clients/${id}`, { credentials: "same-origin", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (res.status === 404) {
        setNotFoundFlag(true);
        return;
      }
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? `Could not load this client (${res.status}).`);
        return;
      }
      setData(json.data as ProfileResponse);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (notFoundFlag) return notFound();

  if (error) {
    return (
      <AdminPage title="Client Profile">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      </AdminPage>
    );
  }

  if (!data) {
    return (
      <AdminPage title="Client Profile">
        <div className="h-32 animate-pulse rounded-xl bg-brand-canvas" />
      </AdminPage>
    );
  }

  const { client, cases, documents, payments } = data;

  return (
    <AdminPage
      breadcrumb={
        <>
          <Link href="/admin/clients" className="hover:text-brand-pink">Clients</Link>
          <span className="px-1.5">›</span>
          <span className="text-brand-text/70">{client.name}</span>
        </>
      }
      title="Client Profile"
    >
      {/* Header card */}
      <AdminCard className="mb-5">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-pinkLight text-[16px] font-bold text-brand-pink">
              {client.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}
            </span>
            <div>
              <h2 className="text-[18px] font-black tracking-tight">{client.name}</h2>
              <p className="text-[11.5px] text-brand-mute">Client ID: {client.id.toUpperCase()}</p>
              <div className="mt-2 space-y-0.5 text-[12.5px] text-brand-text/80">
                <p>📧 {client.email}</p>
                {client.phone && <p>📞 {client.phone}</p>}
                {client.address && <p>📍 {client.address}</p>}
              </div>
              <div className="mt-2 flex items-center gap-3 text-[11.5px] text-brand-mute">
                <span>Joined: {formatDate(client.joinedAt)}</span>
                <span>Last activity: {timeAgo(client.lastActivityAt)}</span>
              </div>
            </div>
          </div>
        </div>
      </AdminCard>

      <Tabs
        tabs={[
          overviewTab({ cases, documents }),
          casesTab({ cases }),
          documentsTab({ documents }),
          invoicesTab({ payments }),
        ]}
      />
    </AdminPage>
  );
}

// ---- Overview ----
function overviewTab({ cases, documents }: { cases: CaseRow[]; documents: DocumentRow[] }): TabDef {
  return {
    key: "overview",
    label: "Overview",
    content: (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <AdminCard>
          <AdminCardHeader title={`Cases (${cases.length})`} right={<Link href="/admin/appeals">View all appeals</Link>} />
          <div className="overflow-x-auto">
            <table className="min-w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Date Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-borderSoft">
                {cases.slice(0, 6).map((c) => (
                  <tr key={c.id} className="hover:bg-brand-pinkPale/50">
                    <td className="px-4 py-3">
                      <Link href={`/admin/appeals/${c.id}`} className="font-semibold text-brand-text hover:text-brand-pink">
                        {c.publicId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-brand-text/80">{c.lifecycleStatus.replace(/_/g, " ")}</td>
                    <td className="px-4 py-3 text-brand-mute">{formatDate(c.createdAt)}</td>
                  </tr>
                ))}
                {cases.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-brand-mute">No cases yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Recent Documents" right={<span className="text-brand-mute">{documents.length} total</span>} />
          <ul className="divide-y divide-brand-borderSoft">
            {documents.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
                <span className="truncate">{d.fileName}</span>
                <span className="text-[11px] text-brand-mute">{formatDate(d.uploadedAt)}</span>
              </li>
            ))}
            {documents.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No documents yet.</li>}
          </ul>
        </AdminCard>
      </div>
    ),
  };
}

// ---- Cases ----
function casesTab({ cases }: { cases: CaseRow[] }): TabDef {
  return {
    key: "cases",
    label: `Cases (${cases.length})`,
    content: (
      <AdminCard>
        <AdminCardHeader title="All appeal cases for this client" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">VRM</th>
                <th className="px-4 py-2">Operator</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/appeals/${c.id}`} className="font-semibold text-brand-text hover:text-brand-pink">
                      {c.publicId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-brand-text/80">{c.vrm ?? "—"}</td>
                  <td className="px-4 py-3 text-brand-text/80">{c.operatorName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-brand-pinkPale px-2.5 py-1 text-[11px] font-semibold">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[12px]">{c.paymentStatus}</td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-mute">No cases yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    ),
  };
}

// ---- Documents ----
function documentsTab({ documents }: { documents: DocumentRow[] }): TabDef {
  return {
    key: "documents",
    label: `Documents (${documents.length})`,
    content: (
      <AdminCard>
        <ul className="divide-y divide-brand-borderSoft">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-text">{d.fileName}</p>
                <p className="text-[11px] text-brand-mute">
                  {d.documentType.replace(/_/g, " ")} · {d.casePublicId} · {formatDate(d.uploadedAt)}
                </p>
              </div>
            </li>
          ))}
          {documents.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No documents.</li>}
        </ul>
      </AdminCard>
    ),
  };
}

// ---- Invoices ----
function invoicesTab({ payments }: { payments: PaymentRow[] }): TabDef {
  return {
    key: "invoices",
    label: `Invoices (${payments.length})`,
    content: (
      <AdminCard>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Case</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-mono">{p.casePublicId}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        p.status === "PAID"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "PENDING" || p.status === "CHECKOUT_CREATED"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(p.createdAt)}</td>
                </tr>
              ))}
              {payments.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-mute">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    ),
  };
}
