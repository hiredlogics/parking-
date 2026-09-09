"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCrm } from "@/lib/crm/store";
import { humanCaseType } from "@/lib/crm/format";
import type { CaseType, KanbanStatus } from "@/lib/crm/types";
import { AdminPage } from "@/components/admin/ui";
import { KanbanBoard } from "@/components/admin/KanbanBoard";

const TYPE_OPTIONS: { value: "ALL" | CaseType; label: string }[] = [
  { value: "ALL", label: "All Case Types" },
  { value: "COUNTY_COURT", label: "County Court" },
  { value: "CCJ_REMOVAL", label: "CCJ Removal" },
  { value: "BAILIFF_ENFORCEMENT", label: "Bailiff / Enforcement" },
  { value: "PRIVATE_PARKING", label: "Private Parking" },
  { value: "COUNCIL_PCN", label: "Council PCN" },
  { value: "CHARGE_CERTIFICATE", label: "Charge Certificate" },
  { value: "ORDER_FOR_RECOVERY", label: "Order for Recovery" },
];

const STATUS_OPTIONS: { value: "ALL" | KanbanStatus; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "AWAITING_REVIEW", label: "Awaiting Review" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "AWAITING_CLIENT", label: "Awaiting Client" },
  { value: "READY_TO_DRAFT", label: "Ready to Draft" },
  { value: "COMPLETED", label: "Completed" },
];

export default function AdminCasesPage() {
  const clients = useCrm((s) => s.clients);
  const [type, setType] = useState<"ALL" | CaseType>("ALL");
  const [status, setStatus] = useState<"ALL" | KanbanStatus>("ALL");
  const [q, setQ] = useState("");

  const filter = useMemo(() => {
    const clientById = new Map(clients.map((c) => [c.id, c]));
    return (c: {
      type: CaseType;
      status: KanbanStatus;
      reference: string;
      clientId: string;
    }) => {
      if (type !== "ALL" && c.type !== type) return false;
      if (status !== "ALL" && c.status !== status) return false;
      if (q.trim()) {
        const s = q.trim().toLowerCase();
        const client = clientById.get(c.clientId);
        const bag = `${c.reference} ${humanCaseType(c.type)} ${client?.name ?? ""} ${client?.email ?? ""}`.toLowerCase();
        if (!bag.includes(s)) return false;
      }
      return true;
    };
  }, [type, status, q, clients]);

  return (
    <AdminPage
      title="Case List"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
      actions={
        <Link href="/admin/cases/new" className="btn-brand-primary text-[12px]">
          + New Case
        </Link>
      }
    >
      {/* Filters */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,220px)_minmax(0,1fr)_auto]">
        <select className="app-input h-10" value={type} onChange={(e) => setType(e.target.value as "ALL" | CaseType)}>
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select className="app-input h-10" value={status} onChange={(e) => setStatus(e.target.value as "ALL" | KanbanStatus)}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <input
          className="app-input h-10"
          placeholder="Search cases, clients or references…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md border border-brand-border bg-white px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-brand-text hover:bg-brand-canvas"
          onClick={() => {
            setType("ALL");
            setStatus("ALL");
            setQ("");
          }}
        >
          Filters
        </button>
      </div>

      <KanbanBoard filter={filter} />
      <p className="mt-4 text-[11.5px] text-brand-mute">
        Drag any case between columns to change its status.
      </p>
    </AdminPage>
  );
}
