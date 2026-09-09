"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function AdminHelpPage() {
  return (
    <AdminPage title="Help & Support" breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <AdminCard>
          <AdminCardHeader title="Product help" />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            <li className="px-4 py-3">Getting started with the CRM</li>
            <li className="px-4 py-3">Setting up the Appeal Builder pipeline</li>
            <li className="px-4 py-3">Managing County Court cases</li>
            <li className="px-4 py-3">Handling bailiff / enforcement matters</li>
          </ul>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader title="Contact support" />
          <div className="p-4 text-[13px] text-brand-mute">
            <p>Email: <a href="mailto:support@parkingappealsgroup.co.uk" className="text-brand-pink hover:underline">support@parkingappealsgroup.co.uk</a></p>
            <p className="mt-2">Response within 1 business day.</p>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
