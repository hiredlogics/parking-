"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";
import { fetchCaseList, type CaseListItem } from "@/features/appeal/caseSync";
import { caseNextStep, caseStatusLabel } from "@/lib/cases/labels";

/**
 * My Cases.
 *
 * Reads real appeal cases from the server rather than the legacy CRM
 * store, so what the customer sees here is the same case the appeal
 * journey is working on.
 */
export default function PortalCasesPage() {
  const [cases, setCases] = useState<CaseListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetchCaseList();
      if (cancelled) return;
      if (!res.ok) {
        setError(res.message);
        setCases([]);
        return;
      }
      setCases(res.data.cases);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminPage
      title="My Cases"
      breadcrumb={
        <Link href="/portal" className="hover:text-brand-pink">
          Dashboard
        </Link>
      }
    >
      <AdminCard>
        <AdminCardHeader
          title={
            cases === null
              ? "Loading…"
              : `${cases.length} case${cases.length === 1 ? "" : "s"}`
          }
          right={
            <Link href="/appeal/upload" className="btn-brand-primary">
              Start a new appeal
            </Link>
          }
        />

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Vehicle</th>
                <th className="px-4 py-2">Operator</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Updated</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {cases?.map((c) => {
                const next = caseNextStep(c.status, c.paymentStatus);
                return (
                  <tr key={c.id} className="hover:bg-brand-canvas">
                    <td className="px-4 py-3 font-semibold">
                      <Link
                        href={`/portal/cases/${c.id}`}
                        className="hover:text-brand-pink hover:underline"
                        data-testid={`case-link-${c.id}`}
                      >
                        {c.publicId}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-brand-text/80">
                      {c.vrm ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-brand-text/80">
                      {c.operatorName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-brand-pinkPale px-2.5 py-1 text-[11px] font-semibold text-brand-text">
                        {caseStatusLabel(c.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-brand-mute">
                      {new Date(c.updatedAt).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {next && (
                        <Link
                          href={next.href(c.id)}
                          className="text-[12px] font-semibold text-brand-pink hover:underline"
                        >
                          {next.label} →
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}

              {cases !== null && cases.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-brand-mute">
                    <p className="font-semibold text-brand-text">No appeals yet</p>
                    <p className="mt-1">
                      Upload a parking notice and we will take it from there.
                    </p>
                    <Link href="/appeal/upload" className="btn-brand-primary mt-4">
                      Start an appeal
                    </Link>
                  </td>
                </tr>
              )}

              {cases === null && (
                <tr>
                  <td colSpan={6} className="px-4 py-8">
                    <div className="h-16 animate-pulse rounded-xl bg-brand-canvas" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </AdminPage>
  );
}
