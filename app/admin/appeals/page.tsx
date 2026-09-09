"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

/**
 * Appeal case list — the real V2 cases from `appeal_cases`.
 *
 * The Kanban board at /admin/cases still shows the legacy CRM matters.
 * This is the view of what customers are actually going through.
 */

interface AdminCaseRow {
  id: string;
  publicId: string;
  customerName: string | null;
  customerEmail: string | null;
  status: string;
  operatorName: string | null;
  pcnNumber: string | null;
  vrm: string | null;
  primaryRoute: string | null;
  sufficiencyStatus: string;
  outstandingCount: number;
  paymentStatus: string;
  outOfScopeReason: string | null;
  updatedAt: string;
}

const FILTERS = [
  { value: "ALL", label: "All cases" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "AWAITING_PAYMENT", label: "Awaiting payment" },
  { value: "PAID", label: "Paid" },
  { value: "MANUAL_REVIEW", label: "Needs review" },
] as const;

export default function AdminAppealsPage() {
  const [rows, setRows] = useState<AdminCaseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("ALL");
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/admin/cases", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok || !json?.success) {
        setError(json?.error?.message ?? `Could not load cases (${res.status}).`);
        setRows([]);
        return;
      }
      setRows(json.data.cases as AdminCaseRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (filter === "MANUAL_REVIEW") {
        if (r.status !== "MANUAL_REVIEW" && r.status !== "OUT_OF_SCOPE") return false;
      } else if (filter === "PAID") {
        if (r.paymentStatus !== "PAID") return false;
      } else if (filter === "AWAITING_PAYMENT") {
        if (r.paymentStatus === "PAID" || r.sufficiencyStatus !== "SUFFICIENT") return false;
      } else if (filter === "IN_PROGRESS") {
        if (r.paymentStatus === "PAID" || r.sufficiencyStatus === "SUFFICIENT") return false;
      }
      if (q.trim()) {
        const bag =
          `${r.publicId} ${r.customerName ?? ""} ${r.customerEmail ?? ""} ${r.vrm ?? ""} ${r.pcnNumber ?? ""} ${r.operatorName ?? ""}`.toLowerCase();
        if (!bag.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filter, q]);

  return (
    <AdminPage
      title="Appeal Cases"
      breadcrumb={
        <Link href="/admin" className="hover:text-brand-pink">
          Dashboard
        </Link>
      }
    >
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
        <select
          className="app-input h-10"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          className="app-input h-10"
          placeholder="Search reference, customer, VRM or PCN…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <AdminCard>
        <AdminCardHeader
          title={rows === null ? "Loading…" : `${visible.length} case${visible.length === 1 ? "" : "s"}`}
        />

        {error && (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            {error}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Reference</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Vehicle</th>
                <th className="px-4 py-2">Primary ground</th>
                <th className="px-4 py-2">Stage</th>
                <th className="px-4 py-2">Payment</th>
                <th className="px-4 py-2">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-brand-canvas">
                  <td className="px-4 py-3 font-semibold">
                    <Link
                      href={`/admin/appeals/${r.id}`}
                      className="hover:text-brand-pink hover:underline"
                    >
                      {r.publicId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-brand-text">{r.customerName ?? "—"}</div>
                    <div className="text-[11px] text-brand-mute">{r.customerEmail}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-brand-text/80">{r.vrm ?? "—"}</td>
                  <td className="px-4 py-3 text-brand-text/80">{r.primaryRoute ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-brand-pinkPale px-2.5 py-1 text-[11px] font-semibold">
                      {r.status}
                    </span>
                    {r.outstandingCount > 0 && (
                      <span className="ml-1.5 text-[11px] text-brand-mute">
                        {r.outstandingCount} outstanding
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[12px]">{r.paymentStatus}</td>
                  <td className="px-4 py-3 text-brand-mute">
                    {new Date(r.updatedAt).toLocaleDateString("en-GB")}
                  </td>
                </tr>
              ))}

              {rows !== null && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-brand-mute">
                    No appeal cases match.
                  </td>
                </tr>
              )}
              {rows === null && (
                <tr>
                  <td colSpan={7} className="px-4 py-8">
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
