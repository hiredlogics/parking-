import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { setRuleActive } from "@/lib/db/repos";
import { getEffectiveRules } from "@/lib/appealLogic";
import { RULES } from "@/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  if (!session.userId || session.kind === "CUSTOMER") {
    return null;
  }
  return session;
}

/**
 * Rule *conditions* (the pack's Part 6 predicates) are code, not data —
 * they are never sent to or edited from the browser. Only the active
 * on/off toggle is CRM-editable; everything else is read-only metadata
 * for staff to see which grounds are currently live.
 */
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const rules = await getEffectiveRules();
  return NextResponse.json({
    ok: true,
    rules: rules.map((r) => ({
      id: r.id,
      route: r.route ?? null,
      paragraphIds: r.paragraphIds,
      description: r.description,
      active: r.active !== false,
    })),
  });
}

export async function PATCH(request: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  let body: { id?: string; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.id !== "string" || typeof body.active !== "boolean") {
    return NextResponse.json({ ok: false, error: "id and active are required" }, { status: 400 });
  }
  if (!RULES.some((r) => r.id === body.id)) {
    return NextResponse.json({ ok: false, error: "Unknown rule id" }, { status: 404 });
  }
  await getEffectiveRules(); // ensures the row exists (seeds on first use)
  await setRuleActive(body.id, body.active, session.email ?? session.userId ?? "unknown");
  return NextResponse.json({ ok: true });
}
