import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/pool";
import { ensureSeeded } from "@/lib/db/seed-server";
import {
  listActivity,
  listAppeals,
  listCases,
  listCommunications,
  listDocuments,
  listNotes,
  listPayments,
  listTasks,
} from "@/lib/db/repos";
import { requireCustomer } from "@/lib/auth/require-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Portal state — everything for the signed-in customer only. The admin
 * CRM has a separate /api/crm/state that returns the entire dataset.
 */
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const auth = await requireCustomer();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    await ensureSeeded();
    const client = auth.client;
    const cid = client.id;
    const [cases, appeals, documents, tasks, notes, communications, activity, payments] =
      await Promise.all([
        listCases(),
        listAppeals(),
        listDocuments(),
        listTasks(),
        listNotes(),
        listCommunications(),
        listActivity(),
        listPayments(),
      ]);
    const state = {
      client,
      cases: cases.filter((c) => c.clientId === cid),
      appeals: appeals.filter((a) => a.clientId === cid),
      documents: documents.filter((d) => d.clientId === cid),
      tasks: tasks.filter((t) => t.clientId === cid),
      notes: notes.filter((n) => n.clientId === cid),
      communications: communications.filter((c) => c.clientId === cid),
      activity: activity.filter((a) => a.clientId === cid),
      payments: payments.filter((p) => p.clientId === cid),
    };
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error("[api/portal/state] failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load portal state.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
