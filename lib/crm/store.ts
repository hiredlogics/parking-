"use client";

import { create } from "zustand";
import type {
  ActivityEvent,
  Appeal,
  Case,
  Client,
  Communication,
  CrmDocument,
  CrmState,
  KanbanStatus,
  Note,
  Payment,
  Priority,
  Task,
  TaskStatus,
} from "./types";
import { buildSeedState } from "./seed";

/**
 * CRM store — Zustand, hydrated from Postgres via `/api/crm/state`.
 *
 * How the data flow works:
 *
 * 1. The store starts with the local demo seed so pages have something
 *    to render before the first fetch resolves (and so the customer
 *    flow / portal still work when the visitor isn't authenticated).
 * 2. Authenticated pages (admin) call `hydrate()` on mount — that
 *    replaces the store with the server's authoritative state.
 * 3. Every mutation applies optimistically to local state AND pushes a
 *    matching row to `/api/crm/mutate` so the DB stays in sync across
 *    browsers. Sync failures are logged but never crash the UI.
 * 4. The public customer flow can bypass the authenticated endpoint
 *    via `postPublicIntake` (used by /appeal/result) — that's the one
 *    place where the visitor isn't a signed-in admin.
 */

const OPTIMISTIC_TIMEOUT_MS = 15_000;

async function postMutation(mutation: unknown): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), OPTIMISTIC_TIMEOUT_MS);
    await fetch("/api/crm/mutate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
      signal: controller.signal,
      credentials: "same-origin",
    }).finally(() => clearTimeout(t));
  } catch (err) {
    // The store is intentionally forgiving: local UI keeps working even
    // if the user isn't authenticated or the DB is offline.
    if (process.env.NODE_ENV !== "production") {
      console.warn("[useCrm] sync failed", err);
    }
  }
}

export interface CrmActions {
  reseed(): void;
  clearAll(): void;
  /** Replace store state with the server's authoritative snapshot. */
  hydrate(state: Partial<CrmState>): void;
  /** Fetch state from /api/crm/state and hydrate. Returns true on success. */
  refreshFromServer(): Promise<boolean>;
  /** Fetch state from /api/portal/state and hydrate as the current customer. */
  refreshFromPortalServer(): Promise<boolean>;

  // ---- Clients ----
  createClient(input: Pick<Client, "name" | "email"> & Partial<Client>): Client;
  findClientByEmail(email: string): Client | undefined;
  updateClient(id: string, patch: Partial<Client>): void;

  // ---- Cases ----
  createCase(input: Omit<Case, "id" | "createdAt" | "updatedAt" | "status"> & { status?: KanbanStatus }): Case;
  updateCase(id: string, patch: Partial<Case>): void;
  moveCaseStatus(id: string, status: KanbanStatus, actorId?: string): void;

  // ---- Appeals ----
  createAppeal(input: Omit<Appeal, "id" | "createdAt">): Appeal;
  updateAppeal(id: string, patch: Partial<Appeal>): void;

  // ---- Documents ----
  addDocument(input: Omit<CrmDocument, "id" | "uploadedAt">): CrmDocument;
  deleteDocument(id: string): void;

  // ---- Tasks ----
  addTask(input: Omit<Task, "id" | "createdAt" | "status"> & { status?: TaskStatus }): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  toggleTaskComplete(id: string): void;

  // ---- Notes ----
  addNote(input: Omit<Note, "id" | "createdAt">): Note;
  updateNote(id: string, patch: Partial<Note>): void;
  deleteNote(id: string): void;

  // ---- Communication ----
  logCommunication(input: Omit<Communication, "id" | "createdAt">): Communication;

  // ---- Activity ----
  addActivity(input: Omit<ActivityEvent, "id" | "createdAt">): ActivityEvent;

  // ---- Payments ----
  createPayment(input: Omit<Payment, "id" | "createdAt" | "reference"> & { reference?: string }): Payment;
}

const genId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const useCrm = create<CrmState & CrmActions>()((set, get) => ({
  ...buildSeedState(),

  reseed: () => set(() => ({ ...buildSeedState() })),
  clearAll: () =>
    set(() => ({
      clients: [],
      cases: [],
      appeals: [],
      documents: [],
      tasks: [],
      notes: [],
      communications: [],
      activity: [],
      payments: [],
      admins: get().admins,
    })),

  hydrate: (state) => {
    set((s) => ({
      clients: state.clients ?? s.clients,
      cases: state.cases ?? s.cases,
      appeals: state.appeals ?? s.appeals,
      documents: state.documents ?? s.documents,
      tasks: state.tasks ?? s.tasks,
      notes: state.notes ?? s.notes,
      communications: state.communications ?? s.communications,
      activity: state.activity ?? s.activity,
      payments: state.payments ?? s.payments,
      admins: state.admins ?? s.admins,
      seededAt: state.seededAt ?? s.seededAt,
    }));
  },
  refreshFromServer: async () => {
    if (typeof window === "undefined") return false;
    try {
      const res = await fetch("/api/crm/state", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.ok || !data.state) return false;
      get().hydrate(data.state);
      return true;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useCrm] refreshFromServer failed", err);
      }
      return false;
    }
  },
  refreshFromPortalServer: async () => {
    if (typeof window === "undefined") return false;
    try {
      const res = await fetch("/api/portal/state", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!data.ok || !data.state) return false;
      const s = data.state as {
        client: Client;
        cases: Case[];
        appeals: Appeal[];
        documents: CrmDocument[];
        tasks: Task[];
        notes: Note[];
        communications: Communication[];
        activity: ActivityEvent[];
        payments: Payment[];
      };
      get().hydrate({
        clients: [s.client],
        cases: s.cases,
        appeals: s.appeals,
        documents: s.documents,
        tasks: s.tasks,
        notes: s.notes,
        communications: s.communications,
        activity: s.activity,
        payments: s.payments,
      });
      return true;
    } catch (err) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[useCrm] refreshFromPortalServer failed", err);
      }
      return false;
    }
  },

  // ---- Clients ----
  createClient: (input) => {
    const now = new Date().toISOString();
    const c: Client = {
      id: input.id ?? genId("cl"),
      name: input.name,
      email: input.email,
      phone: input.phone,
      address: input.address,
      status: input.status ?? "ACTIVE",
      joinedAt: now,
      lastActivityAt: now,
    };
    set((s) => ({ clients: [c, ...s.clients] }));
    void postMutation({ kind: "client.upsert", payload: c });
    return c;
  },
  findClientByEmail: (email) =>
    get().clients.find((c) => c.email.toLowerCase() === email.toLowerCase()),
  updateClient: (id, patch) => {
    let updated: Client | undefined;
    set((s) => ({
      clients: s.clients.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, ...patch, lastActivityAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (updated) void postMutation({ kind: "client.upsert", payload: updated });
  },

  // ---- Cases ----
  createCase: (input) => {
    const now = new Date().toISOString();
    const c: Case = {
      id: genId("case"),
      status: input.status ?? "AWAITING_REVIEW",
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    set((s) => ({ cases: [c, ...s.cases] }));
    void postMutation({ kind: "case.upsert", payload: c });
    return c;
  },
  updateCase: (id, patch) => {
    let updated: Case | undefined;
    set((s) => ({
      cases: s.cases.map((c) => {
        if (c.id !== id) return c;
        updated = { ...c, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (updated) void postMutation({ kind: "case.upsert", payload: updated });
  },
  moveCaseStatus: (id, status, actorId) => {
    const prev = get().cases.find((c) => c.id === id);
    if (!prev || prev.status === status) return;
    const now = new Date().toISOString();
    const activity: ActivityEvent = {
      id: genId("act"),
      caseId: id,
      clientId: prev.clientId,
      type: "STATUS_CHANGED",
      description: `Status: ${humanStatus(prev.status)} → ${humanStatus(status)}`,
      createdAt: now,
      actorId,
    };
    const nextCase: Case = { ...prev, status, updatedAt: now };
    set((s) => ({
      cases: s.cases.map((c) => (c.id === id ? nextCase : c)),
      activity: [activity, ...s.activity],
    }));
    void postMutation({ kind: "case.upsert", payload: nextCase });
    void postMutation({ kind: "activity.insert", payload: activity });
  },

  // ---- Appeals ----
  createAppeal: (input) => {
    const now = new Date().toISOString();
    const a: Appeal = { id: genId("ap"), createdAt: now, ...input };
    set((s) => ({ appeals: [a, ...s.appeals] }));
    void postMutation({ kind: "appeal.upsert", payload: a });
    return a;
  },
  updateAppeal: (id, patch) => {
    let updated: Appeal | undefined;
    set((s) => ({
      appeals: s.appeals.map((a) => {
        if (a.id !== id) return a;
        updated = { ...a, ...patch };
        return updated;
      }),
    }));
    if (updated) void postMutation({ kind: "appeal.upsert", payload: updated });
  },

  // ---- Documents ----
  addDocument: (input) => {
    const now = new Date().toISOString();
    const d: CrmDocument = { id: genId("doc"), uploadedAt: now, ...input };
    set((s) => ({ documents: [d, ...s.documents] }));
    void postMutation({ kind: "document.insert", payload: d });
    return d;
  },
  deleteDocument: (id) => {
    set((s) => ({ documents: s.documents.filter((d) => d.id !== id) }));
    void postMutation({ kind: "document.delete", payload: { id } });
  },

  // ---- Tasks ----
  addTask: (input) => {
    const t: Task = {
      id: genId("t"),
      status: input.status ?? "OPEN",
      createdAt: new Date().toISOString(),
      ...input,
    };
    set((s) => ({ tasks: [t, ...s.tasks] }));
    void postMutation({ kind: "task.upsert", payload: t });
    return t;
  },
  updateTask: (id, patch) => {
    let updated: Task | undefined;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, ...patch };
        return updated;
      }),
    }));
    if (updated) void postMutation({ kind: "task.upsert", payload: updated });
  },
  toggleTaskComplete: (id) => {
    let updated: Task | undefined;
    set((s) => ({
      tasks: s.tasks.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, status: t.status === "COMPLETED" ? "OPEN" : "COMPLETED" };
        return updated;
      }),
    }));
    if (updated) void postMutation({ kind: "task.upsert", payload: updated });
  },

  // ---- Notes ----
  addNote: (input) => {
    const n: Note = { id: genId("n"), createdAt: new Date().toISOString(), ...input };
    set((s) => ({ notes: [n, ...s.notes] }));
    void postMutation({ kind: "note.insert", payload: n });
    return n;
  },
  updateNote: (id, patch) => {
    let updated: Note | undefined;
    set((s) => ({
      notes: s.notes.map((n) => {
        if (n.id !== id) return n;
        updated = { ...n, ...patch, updatedAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (updated) void postMutation({ kind: "note.insert", payload: updated });
  },
  deleteNote: (id) => {
    set((s) => ({ notes: s.notes.filter((n) => n.id !== id) }));
    void postMutation({ kind: "note.delete", payload: { id } });
  },

  // ---- Communication ----
  logCommunication: (input) => {
    const c: Communication = { id: genId("c"), createdAt: new Date().toISOString(), ...input };
    set((s) => ({ communications: [c, ...s.communications] }));
    void postMutation({ kind: "communication.insert", payload: c });
    return c;
  },

  // ---- Activity ----
  addActivity: (input) => {
    const e: ActivityEvent = { id: genId("act"), createdAt: new Date().toISOString(), ...input };
    set((s) => ({ activity: [e, ...s.activity] }));
    void postMutation({ kind: "activity.insert", payload: e });
    return e;
  },

  // ---- Payments ----
  createPayment: (input) => {
    const state = get();
    const seq = String(state.payments.length + 1).padStart(3, "0");
    const p: Payment = {
      id: genId("pay"),
      createdAt: new Date().toISOString(),
      reference: input.reference ?? `PAG-INV-${seq}`,
      ...input,
    };
    set((s) => ({ payments: [p, ...s.payments] }));
    void postMutation({ kind: "payment.insert", payload: p });
    return p;
  },
}));

export function humanStatus(s: KanbanStatus): string {
  switch (s) {
    case "AWAITING_REVIEW":
      return "Awaiting Review";
    case "IN_PROGRESS":
      return "In Progress";
    case "AWAITING_CLIENT":
      return "Awaiting Client";
    case "READY_TO_DRAFT":
      return "Ready to Draft";
    case "COMPLETED":
      return "Completed";
  }
}

export function humanPriority(p: Priority): string {
  switch (p) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "URGENT":
      return "Urgent";
  }
}
