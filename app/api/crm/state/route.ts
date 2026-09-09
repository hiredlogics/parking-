import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/pool";
import { ensureSeeded } from "@/lib/db/seed-server";
import { listAdmins, loadState } from "@/lib/db/repos";
import { getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  try {
    await ensureSeeded();
    const [admins, state] = await Promise.all([listAdmins(), loadState()]);
    return NextResponse.json({ ok: true, state: { ...state, admins } });
  } catch (err) {
    console.error("[api/crm/state] failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load CRM state.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
