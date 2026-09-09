import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { ensureSeeded } from "@/lib/db/seed-server";
import {
  deleteDocument,
  deleteNote,
  insertActivity,
  insertCommunication,
  insertDocument,
  insertNote,
  insertPayment,
  upsertAppeal,
  upsertCase,
  upsertClient,
  upsertTask,
} from "@/lib/db/repos";
import type {
  ActivityEvent,
  Appeal,
  Case,
  Client,
  Communication,
  CrmDocument,
  Note,
  Payment,
  Task,
} from "@/lib/crm/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mutation =
  | { kind: "client.upsert"; payload: Client }
  | { kind: "case.upsert"; payload: Case }
  | { kind: "appeal.upsert"; payload: Appeal }
  | { kind: "document.insert"; payload: CrmDocument }
  | { kind: "document.delete"; payload: { id: string } }
  | { kind: "task.upsert"; payload: Task }
  | { kind: "note.insert"; payload: Note }
  | { kind: "note.delete"; payload: { id: string } }
  | { kind: "communication.insert"; payload: Communication }
  | { kind: "activity.insert"; payload: ActivityEvent }
  | { kind: "payment.insert"; payload: Payment };

async function apply(m: Mutation): Promise<void> {
  switch (m.kind) {
    case "client.upsert":
      return upsertClient(m.payload);
    case "case.upsert":
      return upsertCase(m.payload);
    case "appeal.upsert":
      return upsertAppeal(m.payload);
    case "document.insert":
      return insertDocument(m.payload);
    case "document.delete":
      return deleteDocument(m.payload.id);
    case "task.upsert":
      return upsertTask(m.payload);
    case "note.insert":
      return insertNote(m.payload);
    case "note.delete":
      return deleteNote(m.payload.id);
    case "communication.insert":
      return insertCommunication(m.payload);
    case "activity.insert":
      return insertActivity(m.payload);
    case "payment.insert":
      return insertPayment(m.payload);
  }
}

export async function POST(request: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const mutations: Mutation[] = Array.isArray((body as { mutations?: unknown[] })?.mutations)
    ? ((body as { mutations: Mutation[] }).mutations)
    : [body as Mutation];

  try {
    await ensureSeeded();
    for (const m of mutations) {
      await apply(m);
    }
    return NextResponse.json({ ok: true, applied: mutations.length });
  } catch (err) {
    console.error("[api/crm/mutate] failed:", err);
    const message = err instanceof Error ? err.message : "Mutation failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
