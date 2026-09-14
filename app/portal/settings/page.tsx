"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

interface Me {
  name: string;
  email: string;
  phone: string | null;
}

export default function PortalSettingsPage() {
  const [me, setMe] = useState<Me | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) setMe(d.user as Me);
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminPage title="Account Settings" breadcrumb={<Link href="/portal" className="hover:text-brand-pink">Dashboard</Link>}>
      <AdminCard>
        <AdminCardHeader title="Your details" />
        <div className="space-y-3 p-5">
          <div>
            <label className="app-label">Full name</label>
            <input className="app-input" value={me?.name ?? ""} readOnly disabled />
          </div>
          <div>
            <label className="app-label">Email</label>
            <input className="app-input" type="email" value={me?.email ?? ""} readOnly disabled />
          </div>
          <div>
            <label className="app-label">Phone</label>
            <input className="app-input" value={me?.phone ?? ""} readOnly disabled />
          </div>
          <p className="text-[12px] text-brand-mute">
            To update your details, contact us — self-service editing isn&apos;t available yet.
          </p>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
