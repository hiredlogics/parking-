import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setRuleActive } from "@/lib/db/repos";
import { getEffectiveRules, invalidateAppealLogicCache } from "@/lib/appealLogic";
import { RULES } from "@/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rule *conditions* (the pack's Part 6 predicates) are code, not data —
 * they are never sent to or edited from the browser. Only the active
 * on/off toggle is CRM-editable; everything else is read-only metadata
 * for staff to see which grounds are currently live.
 */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
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
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
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
  await getEffectiveRules();
  await setRuleActive(
    body.id,
    body.active,
    auth.session.email ?? auth.session.userId ?? "unknown",
  );
  invalidateAppealLogicCache();
  return NextResponse.json({ ok: true });
}
