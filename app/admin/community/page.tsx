"use client";

import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

export default function AdminCommunityPage() {
  return (
    <AdminPage title="Community" breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title="Coming soon" />
        <p className="p-5 text-[13.5px] text-brand-mute">
          Community threads, guidance articles and member Q&amp;A live here in the full product. Not part of the current demo scope.
        </p>
      </AdminCard>
    </AdminPage>
  );
}
