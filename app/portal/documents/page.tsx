"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useCrm } from "@/lib/crm/store";
import { formatDate } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function PortalDocumentsPage() {
  const client = useCrm((s) => s.clients[0]);
  const documentsAll = useCrm((s) => s.documents);
  const documents = useMemo(() => documentsAll.filter((d) => d.clientId === client?.id), [documentsAll, client?.id]);
  return (
    <AdminPage title="My Documents" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title={`${documents.length} document${documents.length === 1 ? "" : "s"}`} />
        <ul className="divide-y divide-brand-borderSoft">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-text">{d.name}</p>
                <p className="text-[11px] text-brand-mute">{d.category.replace(/_/g, " ")} · {formatDate(d.uploadedAt)}</p>
              </div>
              <button type="button" onClick={() => alert("Preview — demo only.")} className="text-[11.5px] font-semibold uppercase text-brand-pink">Preview</button>
            </li>
          ))}
          {documents.length === 0 && <li className="px-4 py-8 text-center text-[13px] text-brand-mute">No documents yet.</li>}
        </ul>
      </AdminCard>
    </AdminPage>
  );
}
