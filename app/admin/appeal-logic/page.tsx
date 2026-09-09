"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AdminPage, AdminCard, AdminCardHeader, AdminPrimary, AdminOutline } from "@/components/admin/ui";

interface RuleRow {
  id: string;
  route: string | null;
  paragraphIds: string[];
  description: string;
  active: boolean;
}

interface ParagraphRow {
  id: string;
  title: string;
  trigger: string;
  category: string;
  priority: number;
  text: string;
  active: boolean;
}

function Ic({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

/** Small on/off switch backed by a checkbox, styled as a pill toggle. */
function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        checked ? "bg-brand-pink" : "bg-brand-borderSoft"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function RulesSection() {
  const [rules, setRules] = useState<RuleRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/appeal-rules", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.ok ? setRules(d.rules) : setError(d.error ?? "Failed to load rules.")))
      .catch(() => setError("Failed to load rules."));
  }, []);

  const filtered = useMemo(() => {
    if (!rules) return [];
    const term = q.trim().toLowerCase();
    if (!term) return rules;
    return rules.filter((r) =>
      `${r.id} ${r.description} ${r.route ?? ""}`.toLowerCase().includes(term),
    );
  }, [rules, q]);

  const toggle = async (rule: RuleRow) => {
    const next = !rule.active;
    setSavingId(rule.id);
    setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, active: next } : r)) ?? prev);
    try {
      const res = await fetch("/api/admin/appeal-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, active: next }),
      });
      const d = await res.json();
      if (!d.ok) throw new Error(d.error ?? "Save failed.");
    } catch (err) {
      // Revert on failure.
      setRules((prev) => prev?.map((r) => (r.id === rule.id ? { ...r, active: !next } : r)) ?? prev);
      setError(err instanceof Error ? err.message : "Failed to update rule.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <AdminCard>
      <AdminCardHeader
        title={`Rules (${rules?.length ?? 0})`}
        right={<span className="font-normal text-brand-mute">Conditions are code — only on/off is editable here</span>}
      />
      <div className="border-b border-brand-borderSoft p-4">
        <input
          className="app-input h-9 w-full sm:w-80"
          placeholder="Search by ID, route or description…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error && <p className="px-4 py-2 text-[12px] text-red-600">{error}</p>}
      {!rules && !error && <p className="px-4 py-6 text-[13px] text-brand-mute">Loading rules…</p>}
      {rules && (
        <div className="max-h-[520px] overflow-y-auto">
          <table className="min-w-full text-[13px]">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-[11px] uppercase tracking-widest text-brand-mute">
                <th className="px-4 py-2">ID</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Route</th>
                <th className="px-4 py-2">Paragraphs</th>
                <th className="px-4 py-2">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-borderSoft">
              {filtered.map((r) => (
                <tr key={r.id} className={!r.active ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-mono text-[12px]">{r.id}</td>
                  <td className="px-4 py-3 text-brand-text/85">{r.description}</td>
                  <td className="px-4 py-3 text-brand-mute">{r.route ?? "—"}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-brand-mute">
                    {r.paragraphIds.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Toggle checked={r.active} disabled={savingId === r.id} onChange={() => toggle(r)} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-brand-mute">No rules match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AdminCard>
  );
}

function ParagraphEditor({
  paragraph,
  onSaved,
}: {
  paragraph: ParagraphRow;
  onSaved: (updated: ParagraphRow) => void;
}) {
  const [title, setTitle] = useState(paragraph.title);
  const [text, setText] = useState(paragraph.text);
  const [active, setActive] = useState(paragraph.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<Array<{ label: string; excerpt: string }>>([]);

  const dirty = title !== paragraph.title || text !== paragraph.text || active !== paragraph.active;

  const save = async () => {
    setSaving(true);
    setError(null);
    setViolations([]);
    try {
      const res = await fetch("/api/admin/appeal-paragraphs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: paragraph.id, title, text, active }),
      });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error ?? "Save failed.");
        setViolations(d.violations ?? []);
        return;
      }
      onSaved({ ...paragraph, title, text, active });
    } catch {
      setError("Failed to save. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-brand-borderSoft bg-brand-canvas/40 p-4">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-[12px] font-semibold text-brand-text">
          <Toggle checked={active} onChange={setActive} />
          {active ? "Active" : "Disabled"}
        </label>
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-mute">Title</label>
        <input className="app-input w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-mute">
          Approved text (keeper-safe checked on save)
        </label>
        <textarea
          className="app-input w-full font-mono text-[12.5px] leading-relaxed"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <p className="font-semibold">{error}</p>
          {violations.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {violations.map((v, i) => (
                <li key={i}>
                  <span className="font-semibold">{v.label}:</span> “…{v.excerpt}…”
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center gap-2">
        <AdminPrimary onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </AdminPrimary>
        {dirty && !saving && (
          <AdminOutline
            onClick={() => {
              setTitle(paragraph.title);
              setText(paragraph.text);
              setActive(paragraph.active);
              setError(null);
              setViolations([]);
            }}
          >
            Discard changes
          </AdminOutline>
        )}
      </div>
    </div>
  );
}

function ParagraphsSection() {
  const [paragraphs, setParagraphs] = useState<ParagraphRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/appeal-paragraphs", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => (d.ok ? setParagraphs(d.paragraphs) : setError(d.error ?? "Failed to load paragraphs.")))
      .catch(() => setError("Failed to load paragraphs."));
  }, []);

  const filtered = useMemo(() => {
    if (!paragraphs) return [];
    const term = q.trim().toLowerCase();
    if (!term) return paragraphs;
    return paragraphs.filter((p) =>
      `${p.id} ${p.title} ${p.category} ${p.trigger}`.toLowerCase().includes(term),
    );
  }, [paragraphs, q]);

  return (
    <AdminCard className="mt-6">
      <AdminCardHeader
        title={`Approved paragraphs (${paragraphs?.length ?? 0})`}
        right={<span className="font-normal text-brand-mute">Every edit is re-checked for keeper-safety</span>}
      />
      <div className="border-b border-brand-borderSoft p-4">
        <input
          className="app-input h-9 w-full sm:w-80"
          placeholder="Search by ID, title, category or trigger…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {error && <p className="px-4 py-2 text-[12px] text-red-600">{error}</p>}
      {!paragraphs && !error && <p className="px-4 py-6 text-[13px] text-brand-mute">Loading paragraphs…</p>}
      {paragraphs && (
        <div className="max-h-[640px] overflow-y-auto divide-y divide-brand-borderSoft">
          {filtered.map((p) => (
            <div key={p.id}>
              <button
                type="button"
                onClick={() => setOpenId(openId === p.id ? null : p.id)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-brand-pinkPale/40 ${!p.active ? "opacity-50" : ""}`}
              >
                <span className="font-mono text-[11.5px] text-brand-mute">{p.id}</span>
                <span className="flex-1 truncate text-[13px] font-semibold text-brand-text">{p.title}</span>
                <span className="rounded-full bg-brand-pinkLight px-2 py-0.5 text-[10.5px] font-semibold uppercase text-brand-pink">
                  {p.category}
                </span>
                <span className="text-brand-mute">
                  <Ic>{openId === p.id ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}</Ic>
                </span>
              </button>
              {openId === p.id && (
                <ParagraphEditor
                  paragraph={p}
                  onSaved={(updated) =>
                    setParagraphs((prev) => prev?.map((row) => (row.id === updated.id ? updated : row)) ?? prev)
                  }
                />
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-8 text-center text-brand-mute">No paragraphs match.</p>
          )}
        </div>
      )}
    </AdminCard>
  );
}

export default function AdminAppealLogicPage() {
  return (
    <AdminPage
      title="Appeal Logic"
      breadcrumb={<Link href="/admin" className="hover:text-brand-pink">Dashboard</Link>}
    >
      <p className="mb-4 max-w-3xl text-[13px] text-brand-mute">
        Rule conditions and paragraph wording come from the Master Developer Pack. You can switch
        any rule or paragraph on/off, and edit approved paragraph wording, without a developer.
        Adding brand-new rule conditions still requires a code change.
      </p>
      <RulesSection />
      <ParagraphsSection />
    </AdminPage>
  );
}
