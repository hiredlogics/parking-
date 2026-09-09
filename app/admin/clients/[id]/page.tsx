"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatCurrency, formatDate, humanCaseType, timeAgo } from "@/lib/crm/format";
import {
  AdminPage,
  AdminCard,
  AdminCardHeader,
  StatusPill,
  AdminPrimary,
  AdminOutline,
} from "@/components/admin/ui";
import { Tabs, type TabDef } from "@/components/admin/Tabs";

export default function AdminClientProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const clients = useCrm((s) => s.clients);
  const casesAll = useCrm((s) => s.cases);
  const appealsAll = useCrm((s) => s.appeals);
  const documentsAll = useCrm((s) => s.documents);
  const communicationsAll = useCrm((s) => s.communications);
  const notesAll = useCrm((s) => s.notes);
  const paymentsAll = useCrm((s) => s.payments);
  const addNote = useCrm((s) => s.addNote);

  const client = useMemo(() => clients.find((c) => c.id === id), [clients, id]);
  const cases = useMemo(() => casesAll.filter((c) => c.clientId === id), [casesAll, id]);
  const appeals = useMemo(() => appealsAll.filter((a) => a.clientId === id), [appealsAll, id]);
  const documents = useMemo(() => documentsAll.filter((d) => d.clientId === id), [documentsAll, id]);
  const communications = useMemo(() => communicationsAll.filter((c) => c.clientId === id), [communicationsAll, id]);
  const notes = useMemo(() => notesAll.filter((n) => n.clientId === id), [notesAll, id]);
  const payments = useMemo(() => paymentsAll.filter((p) => p.clientId === id), [paymentsAll, id]);

  if (!client) return notFound();

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

          <div className="flex flex-wrap gap-2">
            <AdminPrimary onClick={() => alert("New Case (demo)")}>+ New Case</AdminPrimary>
            <AdminOutline onClick={() => alert("Send message (demo)")}>Send Message</AdminOutline>
            <AdminOutline onClick={() => alert("Upload document (demo)")}>Upload Document</AdminOutline>
          </div>
        </div>
      </AdminCard>

      <Tabs
        tabs={[
          overviewTab({ cases, documents, notes, onAddNote: (content) => addNote({ clientId: id, authorId: "adm_merika", content }) }),
          casesTab({ cases }),
          documentsTab({ documents }),
          communicationTab({ communications }),
          invoicesTab({ payments }),
          notesTabAll({ notes, onAddNote: (content) => addNote({ clientId: id, authorId: "adm_merika", content }) }),
          appealsTab({ appeals }),
        ]}
      />
    </AdminPage>
  );
}

// ---- Overview ----
function overviewTab({ cases, documents, notes, onAddNote }: {
  cases: ReturnType<typeof useCrm.getState>["cases"];
  documents: ReturnType<typeof useCrm.getState>["documents"];
  notes: ReturnType<typeof useCrm.getState>["notes"];
  onAddNote: (content: string) => void;
}): TabDef {
  return {
    key: "overview",
    label: "Overview",
    content: (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <AdminCard>
            <AdminCardHeader title={`Active Cases (${cases.filter((c) => c.status !== "COMPLETED").length})`} right={<Link href="/admin/cases">View all</Link>} />
            <div className="overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                    <th className="px-4 py-2">Case Reference</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Date Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-borderSoft">
                  {cases.slice(0, 6).map((c) => (
                    <tr key={c.id} className="hover:bg-brand-pinkPale/50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/cases/${c.id}`} className="font-semibold text-brand-text hover:text-brand-pink">
                          {c.reference}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-brand-text/80">{humanCaseType(c.type)}</td>
                      <td className="px-4 py-3"><StatusPill status={c.status} size="sm" /></td>
                      <td className="px-4 py-3 text-brand-mute">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                  {cases.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-mute">No cases yet.</td></tr>
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
                  <span className="truncate">{d.name}</span>
                  <span className="text-[11px] text-brand-mute">{formatDate(d.uploadedAt)}</span>
                </li>
              ))}
              {documents.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No documents yet.</li>}
            </ul>
          </AdminCard>
        </div>

        <AdminCard>
          <AdminCardHeader title="Notes" />
          <QuickAddNote onAddNote={onAddNote} />
          <ul className="divide-y divide-brand-borderSoft">
            {notes.slice(0, 5).map((n) => (
              <li key={n.id} className="px-4 py-3 text-[13px]">
                <p className="text-brand-text">{n.content}</p>
                <p className="mt-1 text-[11px] text-brand-mute">{formatDate(n.createdAt, { time: true })}</p>
              </li>
            ))}
            {notes.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-brand-mute">No notes.</li>}
          </ul>
        </AdminCard>
      </div>
    ),
  };
}

function QuickAddNote({ onAddNote }: { onAddNote: (c: string) => void }) {
  const [t, setT] = useState("");
  return (
    <div className="border-b border-brand-borderSoft p-4">
      <textarea
        className="app-input min-h-16"
        placeholder="Add a note about this client…"
        value={t}
        onChange={(e) => setT(e.target.value)}
      />
      <div className="mt-2 flex justify-end">
        <AdminPrimary
          onClick={() => {
            if (!t.trim()) return;
            onAddNote(t.trim());
            setT("");
          }}
        >
          Add Note
        </AdminPrimary>
      </div>
    </div>
  );
}

// ---- Cases ----
function casesTab({ cases }: { cases: ReturnType<typeof useCrm.getState>["cases"] }): TabDef {
  return {
    key: "cases",
    label: `Cases (${cases.length})`,
    content: (
      <AdminCard>
        <AdminCardHeader title="All cases for this client" />
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {cases.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <Link href={`/admin/cases/${c.id}`} className="font-semibold text-brand-text hover:text-brand-pink">
                      {c.reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-brand-text/80">{humanCaseType(c.type)}</td>
                  <td className="px-4 py-3"><StatusPill status={c.status} size="sm" /></td>
                  <td className="px-4 py-3 text-brand-mute">{formatDate(c.updatedAt)}</td>
                </tr>
              ))}
              {cases.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-brand-mute">No cases yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    ),
  };
}

// ---- Documents ----
function documentsTab({ documents }: { documents: ReturnType<typeof useCrm.getState>["documents"] }): TabDef {
  return {
    key: "documents",
    label: `Documents (${documents.length})`,
    content: (
      <AdminCard>
        <ul className="divide-y divide-brand-borderSoft">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-text">{d.name}</p>
                <p className="text-[11px] text-brand-mute">{d.category.replace(/_/g, " ")} · {formatDate(d.uploadedAt)}</p>
              </div>
              <button type="button" onClick={() => alert("Preview — demo only.")} className="text-[11.5px] font-semibold uppercase text-brand-pink">
                Preview
              </button>
            </li>
          ))}
          {documents.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No documents.</li>}
        </ul>
      </AdminCard>
    ),
  };
}

// ---- Communication ----
function communicationTab({ communications }: { communications: ReturnType<typeof useCrm.getState>["communications"] }): TabDef {
  return {
    key: "communication",
    label: `Communication (${communications.length})`,
    content: (
      <AdminCard>
        <ul className="divide-y divide-brand-borderSoft">
          {communications.map((c) => (
            <li key={c.id} className="px-4 py-3 text-[13px]">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand-text">{c.subject}</p>
                <span className="rounded-full bg-brand-canvas px-2 py-0.5 text-[10.5px] font-semibold text-brand-mute">
                  {c.type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-brand-text/85">{c.body}</p>
              <p className="mt-1 text-[11px] text-brand-mute">{formatDate(c.createdAt, { time: true })}</p>
            </li>
          ))}
          {communications.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No messages yet.</li>}
        </ul>
      </AdminCard>
    ),
  };
}

// ---- Invoices ----
function invoicesTab({ payments }: { payments: ReturnType<typeof useCrm.getState>["payments"] }): TabDef {
  return {
    key: "invoices",
    label: `Invoices (${payments.length})`,
    content: (
      <AdminCard>
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
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                        p.status === "PAID"
                          ? "bg-emerald-100 text-emerald-700"
                          : p.status === "PENDING"
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
                <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-mute">No invoices yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    ),
  };
}

// ---- Notes (full) ----
function notesTabAll({ notes, onAddNote }: {
  notes: ReturnType<typeof useCrm.getState>["notes"];
  onAddNote: (content: string) => void;
}): TabDef {
  return {
    key: "notes",
    label: `Notes (${notes.length})`,
    content: (
      <div className="space-y-4">
        <AdminCard>
          <QuickAddNote onAddNote={onAddNote} />
        </AdminCard>
        <AdminCard>
          <ul className="divide-y divide-brand-borderSoft">
            {notes.map((n) => (
              <li key={n.id} className="px-4 py-3 text-[13px]">
                <p className="text-brand-text">{n.content}</p>
                <p className="mt-1 text-[11px] text-brand-mute">{formatDate(n.createdAt, { time: true })}</p>
              </li>
            ))}
            {notes.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No notes.</li>}
          </ul>
        </AdminCard>
      </div>
    ),
  };
}

// ---- Appeals ----
function appealsTab({ appeals }: { appeals: ReturnType<typeof useCrm.getState>["appeals"] }): TabDef {
  return {
    key: "appeals",
    label: `Appeals (${appeals.length})`,
    content: (
      <AdminCard>
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
              {appeals.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-mute">No self-service appeals yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    ),
  };
}
