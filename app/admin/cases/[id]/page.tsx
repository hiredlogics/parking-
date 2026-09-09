"use client";

import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useCrm, humanStatus } from "@/lib/crm/store";
import { formatCurrency, formatDate, humanCaseType, timeAgo } from "@/lib/crm/format";
import type { KanbanStatus } from "@/lib/crm/types";
import {
  AdminPage,
  AdminCard,
  AdminCardHeader,
  StatusPill,
  PriorityPill,
  AdminPrimary,
  AdminOutline,
} from "@/components/admin/ui";
import { StageStepper, stageKeyForCase } from "@/components/admin/StageStepper";
import { Tabs, type TabDef } from "@/components/admin/Tabs";

const STATUS_ORDER: KanbanStatus[] = [
  "AWAITING_REVIEW",
  "IN_PROGRESS",
  "AWAITING_CLIENT",
  "READY_TO_DRAFT",
  "COMPLETED",
];

export default function AdminCaseDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  // Select each RAW array from the store — same reference until it
  // mutates. Filter with useMemo below so we don't create a new
  // reference on every render (which would loop the store subscriber).
  const cases = useCrm((s) => s.cases);
  const clients = useCrm((s) => s.clients);
  const notesAll = useCrm((s) => s.notes);
  const tasksAll = useCrm((s) => s.tasks);
  const documentsAll = useCrm((s) => s.documents);
  const activityAll = useCrm((s) => s.activity);
  const communicationsAll = useCrm((s) => s.communications);
  const admins = useCrm((s) => s.admins);
  const move = useCrm((s) => s.moveCaseStatus);
  const addNote = useCrm((s) => s.addNote);
  const addDocument = useCrm((s) => s.addDocument);
  const addTask = useCrm((s) => s.addTask);
  const toggleTask = useCrm((s) => s.toggleTaskComplete);
  const logComm = useCrm((s) => s.logCommunication);

  const c = useMemo(() => cases.find((x) => x.id === id), [cases, id]);
  const client = useMemo(
    () => (c ? clients.find((x) => x.id === c.clientId) : undefined),
    [clients, c],
  );
  const notes = useMemo(() => notesAll.filter((n) => n.caseId === id), [notesAll, id]);
  const tasks = useMemo(() => tasksAll.filter((t) => t.caseId === id), [tasksAll, id]);
  const documents = useMemo(() => documentsAll.filter((d) => d.caseId === id), [documentsAll, id]);
  const activity = useMemo(() => activityAll.filter((a) => a.caseId === id), [activityAll, id]);
  const communications = useMemo(
    () => communicationsAll.filter((cc) => cc.caseId === id),
    [communicationsAll, id],
  );

  if (!c) return notFound();

  return (
    <AdminPage
      breadcrumb={
        <>
          <Link href="/admin/cases" className="hover:text-brand-pink">Cases</Link>
          <span className="px-1.5">›</span>
          <span className="text-brand-text/70">{c.reference}</span>
        </>
      }
      title={`Case Detail — ${humanCaseType(c.type)}`}
      actions={<StatusPill status={c.status} />}
    >
      {/* Type-aware stage stepper */}
      {["COUNTY_COURT", "CCJ_REMOVAL", "BAILIFF_ENFORCEMENT"].includes(c.type) && (
        <AdminCard className="mb-5">
          <div className="px-4 py-3">
            <StageStepper type={c.type} currentKey={stageKeyForCase(c)} />
          </div>
        </AdminCard>
      )}

      {c.type === "BAILIFF_ENFORCEMENT" && c.urgentWarning && (
        <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-800">
          <p className="font-semibold">⚠ Urgent — Enforcement Stage</p>
          <p>{c.urgentWarning}</p>
        </div>
      )}

      <Tabs
        tabs={[
          overviewTab({ c, client, admins, documents, move }),
          documentsTab({ documents, onAdd: (name, category) => addDocument({ caseId: c.id, clientId: c.clientId, name, category, sizeBytes: 12_000, mimeType: "application/pdf", uploadedBy: "adm_merika" }) }),
          timelineTab({ activity }),
          notesTab({ notes, onAdd: (content) => addNote({ caseId: c.id, clientId: c.clientId, authorId: "adm_merika", content }) }),
          tasksTab({ tasks, onAdd: (title, dueAt, priority) => addTask({ caseId: c.id, clientId: c.clientId, title, dueAt, priority, assignedTo: "adm_merika" }), onToggle: toggleTask }),
          communicationTab({ communications, onSend: (type, subject, body) => logComm({ caseId: c.id, clientId: c.clientId, type, subject, body }) }),
        ]}
      />
    </AdminPage>
  );
}

// ---------- Overview ----------

function overviewTab({ c, client, admins, documents, move }: {
  c: NonNullable<ReturnType<typeof useCrm.getState>["cases"][number]>;
  client: NonNullable<ReturnType<typeof useCrm.getState>["clients"][number]> | undefined;
  admins: ReturnType<typeof useCrm.getState>["admins"];
  documents: ReturnType<typeof useCrm.getState>["documents"];
  move: ReturnType<typeof useCrm.getState>["moveCaseStatus"];
}): TabDef {
  const assigned = admins.find((a) => a.id === c.assignedTo);
  return {
    key: "overview",
    label: "Overview",
    content: (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,0.8fr)]">
        {/* Client + case info */}
        <AdminCard>
          <div className="border-b border-brand-borderSoft p-4">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-brand-pinkLight text-[13px] font-bold text-brand-pink">
                {client?.name.split(" ").map((s) => s[0]).join("").slice(0, 2) ?? "??"}
              </span>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-brand-text">
                  {client?.name ?? "Unknown"}
                </p>
                <p className="text-[11.5px] text-brand-mute">Client since {client ? formatDate(client.joinedAt) : "—"}</p>
              </div>
            </div>
            {client && (
              <div className="mt-3 space-y-1 text-[12.5px] text-brand-text/80">
                <p>📧 {client.email}</p>
                {client.phone && <p>📞 {client.phone}</p>}
                {client.address && <p>📍 {client.address}</p>}
              </div>
            )}
            <Link
              href={`/admin/clients/${c.clientId}`}
              className="mt-3 inline-block text-[11.5px] font-semibold uppercase text-brand-pink hover:underline"
            >
              View Client Profile →
            </Link>
          </div>

          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-mute">
              Case Information
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-y-3 gap-x-4 text-[12.5px]">
              <MetaField label="Reference" value={c.reference} />
              <MetaField label="Type" value={humanCaseType(c.type)} />
              <MetaField label="Status" value={humanStatus(c.status)} />
              <MetaField label="Date Created" value={formatDate(c.createdAt)} />
              <MetaField label="Assigned To" value={assigned?.name ?? "—"} />
              <MetaField label="Priority" valueNode={<PriorityPill priority={c.priority} />} />
            </dl>
          </div>
        </AdminCard>

        {/* Case details + summary + docs */}
        <div className="space-y-5">
          {(c.type === "COUNTY_COURT" || c.type === "CCJ_REMOVAL" || c.type === "BAILIFF_ENFORCEMENT") && (
            <AdminCard>
              <AdminCardHeader title="Case Details" />
              <dl className="grid grid-cols-1 gap-y-3 gap-x-6 p-4 sm:grid-cols-2 text-[12.5px]">
                {c.claimNumber && <MetaField label="Claim Number" value={c.claimNumber} />}
                {c.claimant && <MetaField label="Claimant" value={c.claimant} />}
                {c.courtName && <MetaField label="Court" value={c.courtName} />}
                {c.claimAmount != null && <MetaField label="Amount" value={formatCurrency(c.claimAmount)} />}
                {c.enforcementCompany && <MetaField label="Enforcement Company" value={c.enforcementCompany} />}
                {c.riskLevel && <MetaField label="Risk Level" value={c.riskLevel} />}
                {c.ccjBasis && <MetaField label="Basis of Application" value={c.ccjBasis} />}
              </dl>
              {c.keyDates && c.keyDates.length > 0 && (
                <div className="border-t border-brand-borderSoft p-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-brand-mute">
                    Key Dates
                  </p>
                  <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {c.keyDates.map((k) => (
                      <li key={k.label} className="rounded-lg border border-brand-borderSoft bg-brand-canvas p-3">
                        <p className="text-[11px] font-semibold uppercase text-brand-mute">{k.label}</p>
                        <p className="mt-0.5 text-[13px] font-semibold text-brand-text">
                          {formatDate(k.date)}
                        </p>
                        {k.tag && (
                          <p className="mt-1 inline-flex items-center rounded-full bg-brand-pinkLight px-2 py-0.5 text-[10.5px] font-semibold text-brand-pink">
                            {k.tag}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </AdminCard>
          )}

          {c.summary && (
            <AdminCard>
              <AdminCardHeader title="Case Summary" right={<button className="hover:underline">Edit Summary</button>} />
              <p className="p-4 text-[13px] leading-relaxed text-brand-text/85">{c.summary}</p>
            </AdminCard>
          )}

          <AdminCard>
            <AdminCardHeader title="Documents" right={<span className="text-brand-mute">{documents.length} total</span>} />
            <ul className="divide-y divide-brand-borderSoft text-[13px]">
              {documents.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between px-4 py-3">
                  <span className="truncate">{d.name}</span>
                  <span className="text-[11px] text-brand-mute">{formatDate(d.uploadedAt)}</span>
                </li>
              ))}
              {documents.length === 0 && (
                <li className="px-4 py-6 text-center text-[13px] text-brand-mute">
                  No documents yet.
                </li>
              )}
            </ul>
          </AdminCard>
        </div>

        {/* Actions */}
        <AdminCard>
          <AdminCardHeader title="Case Actions" />
          <div className="flex flex-col gap-2 p-4">
            <AdminPrimary onClick={() => alert("Document generator — hooked up per case type. Demo only.")}>
              Generate Defence
            </AdminPrimary>
            <AdminPrimary onClick={() => alert("Application draft (N244, etc.) — demo only.")}>
              Generate AOS
            </AdminPrimary>
            <AdminOutline onClick={() => alert("Request documents — email will be simulated. Demo only.")}>
              Request Documents
            </AdminOutline>
            <AdminOutline onClick={() => alert("Email client — simulated in this demo.")}>
              Email Client
            </AdminOutline>
            <AdminOutline onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })}>
              Add Note
            </AdminOutline>
            <div className="mt-2 border-t border-brand-borderSoft pt-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-brand-mute">
                Change Status
              </p>
              <select
                className="app-input h-9"
                value={c.status}
                onChange={(e) => move(c.id, e.target.value as KanbanStatus, "adm_merika")}
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{humanStatus(s)}</option>
                ))}
              </select>
            </div>
            <AdminOutline onClick={() => alert("More actions menu — demo.")} className="mt-2">
              More Actions
            </AdminOutline>
          </div>
        </AdminCard>
      </div>
    ),
  };
}

function MetaField({ label, value, valueNode }: { label: string; value?: string; valueNode?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[10.5px] font-semibold uppercase tracking-widest text-brand-mute">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-medium text-brand-text">{valueNode ?? value ?? "—"}</dd>
    </div>
  );
}

// ---------- Documents ----------

function documentsTab({ documents, onAdd }: {
  documents: ReturnType<typeof useCrm.getState>["documents"];
  onAdd: (name: string, category: ReturnType<typeof useCrm.getState>["documents"][number]["category"]) => void;
}): TabDef {
  return {
    key: "documents",
    label: "Documents",
    content: <DocumentsTabContent documents={documents} onAdd={onAdd} />,
  };
}

function DocumentsTabContent({
  documents,
  onAdd,
}: {
  documents: ReturnType<typeof useCrm.getState>["documents"];
  onAdd: (name: string, category: ReturnType<typeof useCrm.getState>["documents"][number]["category"]) => void;
}) {
  const [name, setName] = useState("");
  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader title="Upload a document" />
        <div className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
          <input
            className="app-input flex-1"
            placeholder="Document name, e.g. Response letter.pdf"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select id="doc-cat" className="app-input sm:max-w-[240px]" defaultValue="CORRESPONDENCE">
            <option value="PARKING_NOTICE">Parking Notice</option>
            <option value="EVIDENCE">Evidence</option>
            <option value="APPEAL">Appeal</option>
            <option value="COURT_FORM">Court Form</option>
            <option value="CLAIM_FORM">Claim Form</option>
            <option value="WITNESS_STATEMENT">Witness Statement</option>
            <option value="CONSENT_ORDER">Consent Order</option>
            <option value="CORRESPONDENCE">Correspondence</option>
            <option value="OTHER">Other</option>
          </select>
          <AdminPrimary
            onClick={() => {
              const cat = (document.getElementById("doc-cat") as HTMLSelectElement).value as
                | "CORRESPONDENCE";
              if (!name.trim()) return;
              onAdd(name.trim(), cat);
              setName("");
            }}
          >
            Add
          </AdminPrimary>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader title={`${documents.length} document${documents.length === 1 ? "" : "s"}`} />
        <ul className="divide-y divide-brand-borderSoft">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center justify-between px-4 py-3 text-[13px]">
              <div className="min-w-0">
                <p className="truncate font-medium text-brand-text">{d.name}</p>
                <p className="text-[11px] text-brand-mute">
                  {d.category.replace(/_/g, " ")} · {formatDate(d.uploadedAt)}
                </p>
              </div>
              <div className="flex items-center gap-3 text-[11.5px] text-brand-pink">
                <button type="button" onClick={() => alert("Preview — demo only.")}>Preview</button>
                <button type="button" onClick={() => alert("Download — demo only.")}>Download</button>
              </div>
            </li>
          ))}
          {documents.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-brand-mute">
              No documents on this case yet.
            </li>
          )}
        </ul>
      </AdminCard>
    </div>
  );
}

// ---------- Timeline ----------

function timelineTab({ activity }: {
  activity: ReturnType<typeof useCrm.getState>["activity"];
}): TabDef {
  return {
    key: "timeline",
    label: "Timeline",
    content: (
      <AdminCard>
        <AdminCardHeader title={`${activity.length} timeline event${activity.length === 1 ? "" : "s"}`} />
        <ol className="relative m-6 ms-4 border-s border-brand-border">
          {activity.length === 0 && (
            <li className="pl-6 py-8 text-[13px] text-brand-mute">No activity yet.</li>
          )}
          {activity.map((a) => (
            <li key={a.id} className="mb-6 ms-6">
              <span className="absolute -start-2 mt-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-brand-pink ring-4 ring-white" />
              <p className="text-[13px] font-medium text-brand-text">{a.description}</p>
              <p className="text-[11.5px] text-brand-mute">
                {formatDate(a.createdAt, { time: true })} · {timeAgo(a.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      </AdminCard>
    ),
  };
}

// ---------- Notes ----------

function notesTab({ notes, onAdd }: {
  notes: ReturnType<typeof useCrm.getState>["notes"];
  onAdd: (content: string) => void;
}): TabDef {
  return {
    key: "notes",
    label: "Notes",
    content: <NotesTabContent notes={notes} onAdd={onAdd} />,
  };
}

function NotesTabContent({ notes, onAdd }: {
  notes: ReturnType<typeof useCrm.getState>["notes"];
  onAdd: (content: string) => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader title="Add note" />
        <div className="p-4">
          <textarea
            className="app-input min-h-24"
            placeholder="Add a private note for the internal team…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <AdminPrimary
              onClick={() => {
                if (!text.trim()) return;
                onAdd(text.trim());
                setText("");
              }}
            >
              Save Note
            </AdminPrimary>
          </div>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader title={`${notes.length} note${notes.length === 1 ? "" : "s"}`} />
        <ul className="divide-y divide-brand-borderSoft">
          {notes.map((n) => (
            <li key={n.id} className="px-4 py-3 text-[13px]">
              <p className="text-brand-text">{n.content}</p>
              <p className="mt-1 text-[11px] text-brand-mute">
                {n.authorId} · {formatDate(n.createdAt, { time: true })}
              </p>
            </li>
          ))}
          {notes.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-brand-mute">
              No notes yet.
            </li>
          )}
        </ul>
      </AdminCard>
    </div>
  );
}

// ---------- Tasks ----------

function tasksTab({ tasks, onAdd, onToggle }: {
  tasks: ReturnType<typeof useCrm.getState>["tasks"];
  onAdd: (title: string, dueAt: string, priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT") => void;
  onToggle: (id: string) => void;
}): TabDef {
  return {
    key: "tasks",
    label: "Tasks",
    content: <TasksTabContent tasks={tasks} onAdd={onAdd} onToggle={onToggle} />,
  };
}

function TasksTabContent({ tasks, onAdd, onToggle }: {
  tasks: ReturnType<typeof useCrm.getState>["tasks"];
  onAdd: (title: string, dueAt: string, priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT") => void;
  onToggle: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader title="New task" />
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_140px_140px_auto]">
          <input
            className="app-input"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <input
            type="date"
            className="app-input"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <select
            className="app-input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as typeof priority)}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
          <AdminPrimary
            onClick={() => {
              if (!title.trim()) return;
              const dueAt = new Date(due + "T10:00:00Z").toISOString();
              onAdd(title.trim(), dueAt, priority);
              setTitle("");
            }}
          >
            Add
          </AdminPrimary>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader title={`${tasks.length} task${tasks.length === 1 ? "" : "s"}`} />
        <ul className="divide-y divide-brand-borderSoft">
          {tasks.map((t) => {
            const overdue = t.status !== "COMPLETED" && new Date(t.dueAt) < new Date();
            return (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-start gap-3">
                  <button
                    type="button"
                    aria-label={t.status === "COMPLETED" ? "Reopen task" : "Complete task"}
                    onClick={() => onToggle(t.id)}
                    className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      t.status === "COMPLETED"
                        ? "border-brand-green bg-brand-green text-white"
                        : "border-brand-border bg-white"
                    }`}
                  >
                    {t.status === "COMPLETED" && (
                      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12l4 4L20 6" />
                      </svg>
                    )}
                  </button>
                  <div className="min-w-0">
                    <p className={`truncate text-[13px] font-medium ${t.status === "COMPLETED" ? "text-brand-mute line-through" : "text-brand-text"}`}>
                      {t.title}
                    </p>
                    <p className="text-[11px] text-brand-mute">
                      Due {formatDate(t.dueAt, { time: true })}
                      {overdue && <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">Overdue</span>}
                    </p>
                  </div>
                </div>
                <PriorityPill priority={t.priority} />
              </li>
            );
          })}
          {tasks.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-brand-mute">
              No tasks yet.
            </li>
          )}
        </ul>
      </AdminCard>
    </div>
  );
}

// ---------- Communication ----------

function communicationTab({ communications, onSend }: {
  communications: ReturnType<typeof useCrm.getState>["communications"];
  onSend: (
    type: ReturnType<typeof useCrm.getState>["communications"][number]["type"],
    subject: string,
    body: string,
  ) => void;
}): TabDef {
  return {
    key: "communication",
    label: "Communication",
    content: <CommunicationTabContent communications={communications} onSend={onSend} />,
  };
}

function CommunicationTabContent({ communications, onSend }: {
  communications: ReturnType<typeof useCrm.getState>["communications"];
  onSend: (
    type: ReturnType<typeof useCrm.getState>["communications"][number]["type"],
    subject: string,
    body: string,
  ) => void;
}) {
  const [subject, setSubject] = useState("Case update");
  const [body, setBody] = useState("Hi, here's a quick update on your case…");
  return (
    <div className="space-y-4">
      <AdminCard>
        <AdminCardHeader title="Send email (simulated)" />
        <div className="grid grid-cols-1 gap-2 p-4">
          <input
            className="app-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
          />
          <textarea
            className="app-input min-h-24"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex justify-end">
            <AdminPrimary onClick={() => onSend("EMAIL_OUT", subject, body)}>
              Send Email
            </AdminPrimary>
          </div>
          <p className="text-[11.5px] text-brand-mute">
            No live email provider is connected. Sending logs a communication event in the CRM.
          </p>
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader title={`${communications.length} message${communications.length === 1 ? "" : "s"}`} />
        <ul className="divide-y divide-brand-borderSoft">
          {communications.map((c) => (
            <li key={c.id} className="px-4 py-3 text-[13px]">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-brand-text">{c.subject}</p>
                <span className="rounded-full bg-brand-canvas px-2 py-0.5 text-[10.5px] font-semibold text-brand-mute">
                  {c.type.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-1 text-brand-text/85">{c.body}</p>
              <p className="mt-1 text-[11px] text-brand-mute">
                {formatDate(c.createdAt, { time: true })}
              </p>
            </li>
          ))}
          {communications.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-brand-mute">
              No communication yet.
            </li>
          )}
        </ul>
      </AdminCard>
    </div>
  );
}
