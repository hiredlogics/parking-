import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess } from "@/lib/api/envelope";
import { getCaseDocumentDelivery } from "@/lib/cases/finalDocument";
import { addCaseEvent } from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cases/[id]/documents/[docId]?disposition=inline|attachment
 *
 * Serves any document on a case — the parking notice, evidence, or the
 * final appeal PDF. `inline` backs VIEW, `attachment` backs DOWNLOAD.
 *
 * Three checks, every request: authenticated customer, ownership of
 * the case, and for the final appeal the payment entitlement. The
 * storage key is never sent to the browser.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id, docId } = await ctx.params;

  const wanted = new URL(request.url).searchParams.get("disposition");
  const disposition = wanted === "inline" ? "inline" : "attachment";

  const result = await getCaseDocumentDelivery(id, session, docId);
  if (!result.ok) return failFromAccess(result);

  if (result.delivery.kind === "redirect") {
    return NextResponse.redirect(result.delivery.url, {
      status: 307,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  if (result.document.documentType === "GENERATED") {
    await addCaseEvent({
      caseId: id,
      eventType: "DOCUMENT_DOWNLOADED",
      actorId: session.userId ?? null,
      payload: { documentId: docId, disposition },
    });
  }

  const body = new Uint8Array(result.delivery.object.bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": result.delivery.mimeType,
      "Content-Disposition": `${disposition}; filename="${result.delivery.fileName.replace(/"/g, "")}"`,
      "Content-Length": String(body.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
