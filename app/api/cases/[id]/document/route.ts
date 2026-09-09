import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess } from "@/lib/api/envelope";
import { renderCaseDocument, type DocumentFormat } from "@/lib/cases/documents";
import { addCaseEvent } from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cases/[id]/document?format=pdf|docx
 *
 * Streams the appeal document. Rendered from the stored, validated
 * draft, so the file always matches what the customer was shown.
 *
 * This is the only route that emits appeal bytes for a case.
 */
export async function GET(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const requested = new URL(request.url).searchParams.get("format") ?? "pdf";
  if (requested !== "pdf" && requested !== "docx") {
    return fail("BAD_FORMAT", "Format must be pdf or docx.", 400);
  }

  const result = await renderCaseDocument(id, session, requested as DocumentFormat);
  if (!result.ok) return failFromAccess(result);

  await addCaseEvent({
    caseId: id,
    eventType: "DOCUMENT_DOWNLOADED",
    actorId: session.userId ?? null,
    payload: { format: requested },
  });

  const body = new Uint8Array(result.document.bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": result.document.contentType,
      "Content-Disposition": `attachment; filename="${result.document.filename}"`,
      "Content-Length": String(body.byteLength),
      // Never let a proxy or the browser cache a paid document.
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
