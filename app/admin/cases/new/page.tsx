"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useCrm } from "@/lib/crm/store";
import type { CaseType, Priority } from "@/lib/crm/types";
import { AdminPage, AdminCard, AdminCardHeader, AdminPrimary } from "@/components/admin/ui";
import { humanCaseType } from "@/lib/crm/format";

const TYPES: CaseType[] = [
  "COUNTY_COURT",
  "CCJ_REMOVAL",
  "BAILIFF_ENFORCEMENT",
  "PRIVATE_PARKING",
  "COUNCIL_PCN",
  "CHARGE_CERTIFICATE",
  "ORDER_FOR_RECOVERY",
];

const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function nextRef(existing: number): string {
  const seq = String(Math.max(200, existing + 1)).padStart(3, "0");
  return `PAG-2026-${seq}`;
}

export default function AdminNewCasePage() {
  const router = useRouter();
  const clients = useCrm((s) => s.clients);
  const cases = useCrm((s) => s.cases);
  const createClient = useCrm((s) => s.createClient);
  const createCase = useCrm((s) => s.createCase);
  const addActivity = useCrm((s) => s.addActivity);

  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [type, setType] = useState<CaseType>("COUNTY_COURT");
  const [priority, setPriority] = useState<Priority>("MEDIUM");
  const [summary, setSummary] = useState("");

  const submit = () => {
    let cid = clientId;
    if (clientMode === "new") {
      if (!newName.trim() || !newEmail.trim()) return;
      const c = createClient({ name: newName.trim(), email: newEmail.trim() });
      cid = c.id;
    }
    if (!cid) return;
    const c = createCase({
      clientId: cid,
      reference: nextRef(cases.length),
      type,
      priority,
      summary: summary.trim() || undefined,
      assignedTo: "adm_merika",
    });
    addActivity({
      caseId: c.id,
      clientId: cid,
      type: "CASE_CREATED",
      description: `${humanCaseType(type)} case ${c.reference} created`,
      actorId: "adm_merika",
    });
    router.push(`/admin/cases/${c.id}`);
  };

  return (
    <AdminPage
      title="New Case"
      breadcrumb={
        <>
          <Link href="/admin/cases" className="hover:text-brand-pink">Cases</Link>
          <span className="px-1.5">›</span>
          <span className="text-brand-text/70">New</span>
        </>
      }
    >
      <div className="mx-auto max-w-2xl space-y-4">
        <AdminCard>
          <AdminCardHeader title="Client" />
          <div className="space-y-4 p-5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setClientMode("existing")}
                className={`app-tile ${clientMode === "existing" ? "app-tile-active" : ""}`}
              >
                Existing client
              </button>
              <button
                type="button"
                onClick={() => setClientMode("new")}
                className={`app-tile ${clientMode === "new" ? "app-tile-active" : ""}`}
              >
                Create new client
              </button>
            </div>
            {clientMode === "existing" ? (
              <div>
                <label className="app-label">Select client</label>
                <select className="app-input" value={clientId} onChange={(e) => setClientId(e.target.value)}>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {c.email}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="app-label">Name</label>
                  <input className="app-input" value={newName} onChange={(e) => setNewName(e.target.value)} />
                </div>
                <div>
                  <label className="app-label">Email</label>
                  <input className="app-input" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Case" />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            <div>
              <label className="app-label">Case type</label>
              <select className="app-input" value={type} onChange={(e) => setType(e.target.value as CaseType)}>
                {TYPES.map((t) => <option key={t} value={t}>{humanCaseType(t)}</option>)}
              </select>
            </div>
            <div>
              <label className="app-label">Priority</label>
              <select className="app-input" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p[0] + p.slice(1).toLowerCase()}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="app-label">Summary</label>
              <textarea className="app-input min-h-24" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What's the client's situation?" />
            </div>
          </div>
        </AdminCard>

        <div className="flex items-center justify-between">
          <Link href="/admin/cases" className="btn-brand-ghost">Cancel</Link>
          <AdminPrimary onClick={submit}>Create Case</AdminPrimary>
        </div>
      </div>
    </AdminPage>
  );
}
