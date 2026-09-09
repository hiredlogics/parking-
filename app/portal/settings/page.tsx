"use client";

import Link from "next/link";
import { useCrm } from "@/lib/crm/store";
import { AdminPage, AdminCard, AdminCardHeader, AdminPrimary } from "@/components/admin/ui";

export default function PortalSettingsPage() {
  const client = useCrm((s) => s.clients[0]);
  return (
    <AdminPage title="Account Settings" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title="Your details" />
        <div className="space-y-3 p-5">
          <div>
            <label className="app-label">Full name</label>
            <input className="app-input" defaultValue={client?.name ?? ""} />
          </div>
          <div>
            <label className="app-label">Email</label>
            <input className="app-input" type="email" defaultValue={client?.email ?? ""} />
          </div>
          <div>
            <label className="app-label">Phone</label>
            <input className="app-input" defaultValue={client?.phone ?? ""} />
          </div>
          <div className="flex justify-end">
            <AdminPrimary onClick={() => alert("Saved (demo).")}>Save changes</AdminPrimary>
          </div>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
