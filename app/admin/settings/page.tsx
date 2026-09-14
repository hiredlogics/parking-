"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader, AdminPrimary } from "@/components/admin/ui";

export default function AdminSettingsPage() {
  return (
    <AdminPage
      title="Settings"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
    >
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <AdminCard>
          <AdminCardHeader title="Organisation" />
          <div className="space-y-3 p-5 text-[13px]">
            <div>
              <label className="app-label">Company name</label>
              <input className="app-input" defaultValue="Parking Appeals Group" />
            </div>
            <div>
              <label className="app-label">Contact email</label>
              <input className="app-input" defaultValue="team@parkingappealsgroup.co.uk" />
            </div>
            <div>
              <label className="app-label">VAT number</label>
              <input className="app-input" defaultValue="GB 123 4567 89" />
            </div>
            <div className="flex justify-end">
              <AdminPrimary onClick={() => alert("Saved (demo).")}>Save</AdminPrimary>
            </div>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Integrations" />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {[
              { name: "Stripe", desc: "Payments and invoices.", state: "Not connected" },
              { name: "Postmark", desc: "Transactional email.", state: "Not connected" },
              { name: "OpenAI Vision", desc: "PCN extraction on the customer site.", state: "Connected" },
              { name: "S3", desc: "Evidence file storage.", state: "Not connected" },
            ].map((row) => (
              <li key={row.name} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="font-semibold text-brand-text">{row.name}</p>
                  <p className="text-[11.5px] text-brand-mute">{row.desc}</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                    row.state === "Connected"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {row.state}
                </span>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
