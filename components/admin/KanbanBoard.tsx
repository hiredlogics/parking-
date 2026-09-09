"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCrm, humanStatus } from "@/lib/crm/store";
import { humanCaseType, formatDate, statusColor, priorityColor } from "@/lib/crm/format";
import type { Case, KanbanStatus } from "@/lib/crm/types";
import { PriorityPill } from "./ui";

const COLUMNS: { status: KanbanStatus; count: (all: Case[]) => number }[] = [
  { status: "AWAITING_REVIEW", count: (all) => all.filter((c) => c.status === "AWAITING_REVIEW").length },
  { status: "IN_PROGRESS", count: (all) => all.filter((c) => c.status === "IN_PROGRESS").length },
  { status: "AWAITING_CLIENT", count: (all) => all.filter((c) => c.status === "AWAITING_CLIENT").length },
  { status: "READY_TO_DRAFT", count: (all) => all.filter((c) => c.status === "READY_TO_DRAFT").length },
  { status: "COMPLETED", count: (all) => all.filter((c) => c.status === "COMPLETED").length },
];

export function KanbanBoard({ filter }: { filter: (c: Case) => boolean }) {
  const cases = useCrm((s) => s.cases);
  const clients = useCrm((s) => s.clients);
  const notes = useCrm((s) => s.notes);
  const move = useCrm((s) => s.moveCaseStatus);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<KanbanStatus | null>(null);

  const filtered = useMemo(() => cases.filter(filter), [cases, filter]);
  const clientById = useMemo(() => Object.fromEntries(clients.map((c) => [c.id, c])), [clients]);
  const noteCountByCase = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notes) if (n.caseId) map.set(n.caseId, (map.get(n.caseId) ?? 0) + 1);
    return map;
  }, [notes]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
      {COLUMNS.map(({ status }) => {
        const c = statusColor(status);
        const list = filtered.filter((cc) => cc.status === status);
        const active = dropTarget === status;
        return (
          <section
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setDropTarget(status);
            }}
            onDragLeave={() => setDropTarget((prev) => (prev === status ? null : prev))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain");
              if (id) move(id, status, "adm_merika");
              setDraggingId(null);
              setDropTarget(null);
            }}
            className={`min-h-[400px] rounded-xl border ${active ? "border-brand-pink bg-brand-pinkPale" : "border-brand-border bg-brand-canvas"} p-3 transition`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`inline-block h-2 w-2 rounded-full ${c.bg.replace("bg-", "bg-").replace("-100", "-500")}`} />
                <h3 className="text-[12.5px] font-bold uppercase tracking-wider text-brand-text">
                  {humanStatus(status)}
                </h3>
              </div>
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${c.bg} ${c.text} ${c.ring}`}>
                {list.length}
              </span>
            </div>

            <ul className="space-y-2.5">
              {list.map((cc) => {
                const client = clientById[cc.clientId];
                const isDragging = draggingId === cc.id;
                return (
                  <li
                    key={cc.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", cc.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDraggingId(cc.id);
                    }}
                    onDragEnd={() => setDraggingId(null)}
                    className={`cursor-grab rounded-lg border border-brand-border bg-white p-3 shadow-card transition ${
                      isDragging ? "opacity-40" : "hover:-translate-y-0.5 hover:shadow-cardHover"
                    }`}
                  >
                    <Link href={`/admin/cases/${cc.id}`} className="block">
                      <p className="truncate text-[13px] font-semibold text-brand-text">
                        {client?.name ?? "Unknown"}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-brand-mute">
                        {humanCaseType(cc.type)}
                      </p>
                      <p className="mt-1 text-[11px] font-mono text-brand-mute">
                        {cc.reference}
                      </p>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-brand-mute">
                        <span>{formatDate(cc.updatedAt)}</span>
                        <span className="flex items-center gap-2">
                          <span className="inline-flex items-center gap-1">
                            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v9A2.5 2.5 0 0 1 17.5 17H12l-4.5 4v-4H6.5A2.5 2.5 0 0 1 4 14.5v-9z" />
                            </svg>
                            {noteCountByCase.get(cc.id) ?? 0}
                          </span>
                        </span>
                      </div>
                      {cc.priority !== "LOW" && (
                        <div className="mt-2">
                          <PriorityPill priority={cc.priority} />
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
              {list.length === 0 && (
                <li className="rounded-lg border border-dashed border-brand-border py-6 text-center text-[12px] text-brand-mute">
                  Drop cases here
                </li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Silence "unused" for named export used only above.
export { priorityColor };
