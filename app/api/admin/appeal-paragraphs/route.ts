import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { updateParagraphOverride } from "@/lib/db/repos";
import { getEffectiveParagraphs } from "@/lib/appealLogic";
import { validateKeeperSafe } from "@/lib/keeperSafe";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await getSession();
  if (!session.userId || session.kind === "CUSTOMER") {
    return null;
  }
  return session;
}

export async function GET() {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  if (!(await requireAdmin())) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const paragraphs = await getEffectiveParagraphs();
  return NextResponse.json({ ok: true, paragraphs });
}

/**
 * Edits paragraph title/text/active. Text is the pack's approved
 * wording (Part 8) — every edit is re-checked with the same
 * keeper-safe validator that gates final appeal generation
 * (lib/keeperSafe.ts) so a CRM edit can never reintroduce
 * driver-identifying wording. A failing edit is rejected outright,
 * never partially saved.
 */
export async function PATCH(request: Request) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  let body: { id?: string; title?: string; text?: string; active?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  if (
    typeof body.id !== "string" ||
    typeof body.title !== "string" ||
    typeof body.text !== "string" ||
    typeof body.active !== "boolean"
  ) {
    return NextResponse.json(
      { ok: false, error: "id, title, text and active are required" },
      { status: 400 },
    );
  }
  if (!PARAGRAPH_LIBRARY.some((p) => p.id === body.id)) {
    return NextResponse.json({ ok: false, error: "Unknown paragraph id" }, { status: 404 });
  }
  if (body.title.trim().length === 0 || body.text.trim().length === 0) {
    return NextResponse.json({ ok: false, error: "Title and text cannot be empty" }, { status: 400 });
  }

  const safety = validateKeeperSafe(body.text);
  if (!safety.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: "Keeper-safe validation failed — this wording may identify or imply the driver.",
        violations: safety.violations,
      },
      { status: 422 },
    );
  }

  await getEffectiveParagraphs(); // ensures the row exists (seeds on first use)
  await updateParagraphOverride({
    id: body.id,
    title: body.title,
    text: body.text,
    active: body.active,
    updatedBy: session.email ?? session.userId ?? "unknown",
  });
  return NextResponse.json({ ok: true });
}
