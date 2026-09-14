"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

/**
 * Admin configuration hub — Services, Issues, Knowledge, Prompts, etc.
 * Live DB-backed; changes apply to new processing without rebuild.
 */
export default function AdminConfigPage() {
  const [data, setData] = useState<{
    services: unknown[];
    issues: unknown[];
    message?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) throw new Error(d.error?.message ?? "Failed");
        setData(d.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <AdminPage
      title="Configuration"
      breadcrumb={
        <Link href="/admin" className="hover:text-brand-pink">
          Dashboard
        </Link>
      }
    >
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        <AdminCard>
          <AdminCardHeader title="Services" />
          <pre className="max-h-64 overflow-auto p-4 text-[11px]">
            {JSON.stringify(data?.services ?? [], null, 2)}
          </pre>
        </AdminCard>
        <AdminCard>
          <AdminCardHeader title="Issues (active graph)" />
          <pre className="max-h-64 overflow-auto p-4 text-[11px]">
            {JSON.stringify(data?.issues ?? [], null, 2)}
          </pre>
        </AdminCard>
        <AdminCard className="md:col-span-2">
          <AdminCardHeader title="How to change the system" />
          <div className="space-y-2 p-4 text-[13px] text-brand-mute">
            <p>
              Services, issues, required facts, and knowledge links live in
              PostgreSQL. Seed/bootstrap creates the initial graph; POST
              /api/admin/config can upsert services, issues, facts, knowledge
              links, prompts, validation rules, and email templates without a
              frontend rebuild. Changes apply to new processing after
              activation; existing appeals keep their snapshots.
            </p>
            <p>
              Related:{" "}
              <Link href="/admin/review" className="text-brand-pink">
                Appeals for Review
              </Link>
              {" · "}
              <Link href="/api/admin/kb" className="text-brand-pink">
                Knowledge API
              </Link>
            </p>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
