"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AdminPage, AdminCard, AdminCardHeader } from "@/components/admin/ui";

type IssueRow = {
  id: string;
  code: string;
  label: string;
  status: string;
  knowledge?: Array<{ moduleId: string }>;
  facts?: Array<{ factKey: string }>;
};

/**
 * Admin configuration hub — live DB-backed rules that drive generation.
 * Approve still freezes the letter text into PDF; these rules shape
 * Regenerate and new paid cases.
 */
export default function AdminConfigPage() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [services, setServices] = useState<unknown[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [promptBody, setPromptBody] = useState("");
  const [emailSubject, setEmailSubject] = useState("Your parking appeal is ready");
  const [emailBody, setEmailBody] = useState(
    `Your appeal has been reviewed and is now ready.

Sign in to your account to view and download your appeal.

View My Appeal: {{viewUrl}}`,
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30_000);
    (async () => {
      try {
        const res = await fetch("/api/admin/config", {
          cache: "no-store",
          signal: ac.signal,
        });
        const d = await res.json();
        if (!d.success) throw new Error(d.error?.message ?? "Failed");
        setServices(d.data.services ?? []);
        setIssues((d.data.issues ?? []) as IssueRow[]);
      } catch (e) {
        if ((e as Error)?.name === "AbortError") {
          setError("Timed out loading configuration.");
        } else {
          setError(e instanceof Error ? e.message : "Failed");
        }
      } finally {
        clearTimeout(timer);
        setLoading(false);
      }
    })();
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, []);

  const save = async (action: string, payload: Record<string, unknown>) => {
    setSaving(action);
    setSaved(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) {
        throw new Error(d.error?.message ?? "Save failed");
      }
      setSaved(action);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

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
      {saved && (
        <p className="mb-4 text-sm text-emerald-800">
          Saved. New regenerations / emails use the updated rules.
        </p>
      )}
      {loading && <p className="mb-4 text-sm text-brand-mute">Loading rules…</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <AdminCard>
          <AdminCardHeader title="Drafting prompt (rules text)" />
          <div className="space-y-3 p-4">
            <p className="text-[12px] text-brand-mute">
              Used when you click Regenerate. Approve can also use edited
              manual letter text instead.
            </p>
            <textarea
              className="app-input min-h-[140px] w-full text-[13px]"
              value={promptBody}
              onChange={(e) => setPromptBody(e.target.value)}
              placeholder="Instructions for how the appeal letter should be drafted…"
            />
            <button
              type="button"
              className="btn-brand-primary"
              disabled={!!saving || !promptBody.trim()}
              onClick={() =>
                save("UPSERT_PROMPT", {
                  purpose: "DRAFTING",
                  name: "Drafting",
                  body: promptBody,
                })
              }
            >
              {saving === "UPSERT_PROMPT" ? "Saving…" : "Save drafting prompt"}
            </button>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader title="Appeal-ready email" />
          <div className="space-y-3 p-4">
            <p className="text-[12px] text-brand-mute">
              Sent when admin Approves. Use {"{{viewUrl}}"} for the portal link.
            </p>
            <input
              className="app-input w-full"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder="Subject"
            />
            <textarea
              className="app-input min-h-[140px] w-full text-[13px]"
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
            />
            <button
              type="button"
              className="btn-brand-primary"
              disabled={!!saving}
              onClick={() =>
                save("UPSERT_EMAIL_TEMPLATE", {
                  code: "APPEAL_READY",
                  name: "Appeal ready",
                  subject: emailSubject,
                  bodyText: emailBody,
                })
              }
            >
              {saving === "UPSERT_EMAIL_TEMPLATE" ? "Saving…" : "Save email template"}
            </button>
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            title="Services"
            right={<span className="text-[12px]">{services.length}</span>}
          />
          <ul className="divide-y divide-brand-borderSoft text-[13px]">
            {(services as Array<{ code?: string; name?: string; status?: string }>).map(
              (s, i) => (
                <li key={String(s.code ?? i)} className="px-4 py-3">
                  <p className="font-semibold">{s.name ?? s.code}</p>
                  <p className="text-[12px] text-brand-mute">
                    {s.code} · {s.status}
                  </p>
                </li>
              ),
            )}
            {!loading && services.length === 0 && (
              <li className="px-4 py-6 text-brand-mute">No services seeded yet.</li>
            )}
          </ul>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader
            title="Active issues (knowledge graph)"
            right={<span className="text-[12px]">{issues.length}</span>}
          />
          <ul className="max-h-80 divide-y divide-brand-borderSoft overflow-auto text-[13px]">
            {issues.map((issue) => (
              <li key={issue.id} className="px-4 py-3">
                <p className="font-semibold">
                  {issue.label}{" "}
                  <span className="font-mono text-[11px] text-brand-mute">
                    {issue.code}
                  </span>
                </p>
                <p className="text-[12px] text-brand-mute">
                  Knowledge:{" "}
                  {(issue.knowledge ?? []).map((k) => k.moduleId).join(", ") || "—"}
                </p>
                <p className="text-[12px] text-brand-mute">
                  Facts:{" "}
                  {(issue.facts ?? []).map((f) => f.factKey).join(", ") || "—"}
                </p>
              </li>
            ))}
            {!loading && issues.length === 0 && (
              <li className="px-4 py-6 text-brand-mute">No issues loaded.</li>
            )}
          </ul>
        </AdminCard>

        <AdminCard className="lg:col-span-2">
          <AdminCardHeader title="How approval works" />
          <div className="space-y-2 p-4 text-[13px] text-brand-mute">
            <p>
              1. Customer pays → system generates an appeal (using issues /
              knowledge / drafting prompt) → status{" "}
              <strong>AWAITING_ADMIN_APPROVAL</strong>.
            </p>
            <p>
              2. Admin opens{" "}
              <Link href="/admin/review" className="text-brand-pink">
                Appeals for Review
              </Link>
              , edits letter text if needed (or Regenerates from rules), then{" "}
              <strong>Approve &amp; release PDF</strong>.
            </p>
            <p>
              3. Customer gets the appeal-ready email and can download the PDF
              from the portal.
            </p>
          </div>
        </AdminCard>
      </div>
    </AdminPage>
  );
}
