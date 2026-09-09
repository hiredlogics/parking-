import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import {
  setBlockStatus,
  setModuleStatus,
  setQuotationEnabled,
} from "@/lib/kb/repo";
import { insertAuditEvent } from "@/lib/kb/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body =
  | { target: "module"; id: string; status: "ACTIVE" | "REVIEW" | "DISABLED" }
  | { target: "block"; id: string; status: "ACTIVE" | "REVIEW" | "DISABLED" }
  | { target: "quotation"; id: string; enabled: boolean };

/**
 * Administrator control over module/block status and case-law quotation
 * (KB-GOV-06, V2 §19) — no code deployment required for content changes.
 * Every change writes an audit event.
 */
export async function POST(request: Request) {
  if (!hasDb()) {
    return NextResponse.json(
      { success: false, error: { code: "DB_NOT_CONFIGURED", message: "Database is not configured." } },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
    );
  }
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid body." } },
      { status: 400 },
    );
  }
  if (!body?.target || !body?.id) {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "target and id are required." } },
      { status: 400 },
    );
  }

  try {
    if (body.target === "module") {
      await setModuleStatus(body.id, body.status);
      await insertAuditEvent({
        eventType: "KB_MODULE_STATUS_CHANGED",
        actorId: session.userId,
        payload: { moduleId: body.id, status: body.status },
      });
    } else if (body.target === "block") {
      await setBlockStatus(body.id, body.status);
      await insertAuditEvent({
        eventType: "KB_BLOCK_STATUS_CHANGED",
        actorId: session.userId,
        payload: { blockId: body.id, status: body.status },
      });
    } else if (body.target === "quotation") {
      await setQuotationEnabled(body.id, Boolean(body.enabled));
      await insertAuditEvent({
        eventType: "LEGAL_SOURCE_QUOTATION_CHANGED",
        actorId: session.userId,
        payload: { sourceId: body.id, enabled: Boolean(body.enabled) },
      });
    } else {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Unknown target." } },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, data: { updated: body.id } });
  } catch (err) {
    console.error("[api/admin/kb/status] failed:", err);
    const message = err instanceof Error ? err.message : "Update failed.";
    return NextResponse.json(
      { success: false, error: { code: "KB_UPDATE_FAILED", message } },
      { status: 500 },
    );
  }
}
