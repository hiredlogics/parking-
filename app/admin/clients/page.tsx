"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatDate, timeAgo } from "@/lib/crm/format";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

interface ClientRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  joinedAt: string;
  lastActivityAt: string;
  totalCases: number;
  activeCases: number;
}

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 25_000);

    (async () => {
      try {
        const res = await fetch("/api/admin/clients", {
          credentials: "same-origin",
          cache: "no-store",
          signal: ac.signal,
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.success) {
          throw new Error(
            json?.error?.message ?? `Could not load clients (${res.status}).`,
          );
        }
        setClients(json.data.clients as ClientRow[]);
        setError(null);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          setError("Timed out loading clients. Please try again.");
        } else {
          setError(e instanceof Error ? e.message : "Could not load clients.");
        }
        setClients([]);
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  const filtered = useMemo(() => {
    if (!clients) return [];
    if (!q.trim()) return clients;
    const s = q.trim().toLowerCase();
    return clients.filter((r) =>
      `${r.name} ${r.email} ${r.phone ?? ""}`.toLowerCase().includes(s),
    );
  }, [clients, q]);

  return (
    <AdminPage
      title="Clients"
      breadcrumb={
        <Link href="/admin" className="hover:text-brand-pink">
          Dashboard
        </Link>
      }
      actions={
        <input
          className="app-input h-10 w-full sm:w-80"
          placeholder="Search clients…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      }
    >
      <AdminCard>
        <AdminCardHeader
          title={
            clients === null
              ? "Loading…"
              : `${filtered.length} of ${clients.length} client${clients.length === 1 ? "" : "s"}`
          }
        />
        {error && (
          <div className="m-4 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
            <p>{error}</p>
            <button
              type="button"
              className="btn-brand-outline"
              onClick={() => window.location.reload()}
            >
              Retry
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="min-w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">Client</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Phone</th>
                <th className="px-4 py-2 text-center">Active</th>
                <th className="px-4 py-2 text-center">Total</th>
                <th className="px-4 py-2">Last activity</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-brand-pinkPale/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/clients/${c.id}`}
                      className="flex items-center gap-2 font-semibold text-brand-text hover:text-brand-pink"
                    >
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-pinkLight text-[11px] font-bold text-brand-pink">
                        {c.name
                          .split(" ")
                          .map((s) => s[0])
                          .join("")
                          .slice(0, 2)}
                      </span>
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-brand-text/80">{c.email}</td>
                  <td className="px-4 py-3 text-brand-text/80">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-center font-bold text-brand-text">
                    {c.activeCases}
                  </td>
                  <td className="px-4 py-3 text-center text-brand-text/80">
                    {c.totalCases}
                  </td>
                  <td className="px-4 py-3 text-brand-mute">
                    {formatDate(c.lastActivityAt)}
                    <span className="ml-1 text-[10.5px]">
                      ({timeAgo(c.lastActivityAt)})
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                      {c.status}
                    </span>
                  </td>
                </tr>
              ))}
              {clients !== null && filtered.length === 0 && !error && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-brand-mute">
                    No clients match your search.
                  </td>
                </tr>
              )}
              {clients === null && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-brand-mute">
                    Loading all clients…
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
