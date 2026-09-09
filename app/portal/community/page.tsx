"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function PortalCommunityPage() {
  return (
    <AdminPage title="Community" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title="Coming soon" />
        <p className="p-5 text-[13.5px] text-brand-mute">
          Member Q&amp;A and guidance articles will live here. Not part of the current demo.
        </p>
      </AdminCard>
    </AdminPage>
  );
}
