import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { findOrder } from "@/lib/db/orders";
import { renderOrderDocument } from "@/lib/services/documents/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams the clean PDF/DOCX for a paid order. Refuses to render
 * anything when payment status is not PAID — this is the security gate.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const order = await findOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  if (order.clientId !== session.userId && session.kind !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const format = (new URL(request.url).searchParams.get("format") ?? "pdf") as "pdf" | "docx";
  if (format !== "pdf" && format !== "docx") {
    return NextResponse.json({ ok: false, error: "Invalid format" }, { status: 400 });
  }

  const result = await renderOrderDocument(id, format);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason }, { status: result.status });
  }
  return new Response(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
