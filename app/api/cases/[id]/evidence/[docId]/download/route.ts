import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess } from "@/lib/api/envelope";
import { getEvidenceDownload } from "@/lib/cases/evidence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/cases/[id]/evidence/[docId]/download
 *
 * Ownership is checked here, every time. The storage key is never
 * exposed to the client and is not a capability on its own.
 *
 * When the provider can sign, this 307s to a URL that expires in two
 * minutes so the bytes come straight from object storage. Otherwise the
 * file is streamed through the server.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string; docId: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id, docId } = await ctx.params;

  const result = await getEvidenceDownload(id, session, docId);
  if (!result.ok) return failFromAccess(result);

  if (result.download.kind === "redirect") {
    return NextResponse.redirect(result.download.url, {
      status: 307,
      headers: {
        // The signed URL is short-lived; never let it be cached or
        // leak through a referrer header.
        "Cache-Control": "private, no-store, max-age=0",
        "Referrer-Policy": "no-referrer",
      },
    });
  }

  const { object, fileName } = result.download;
  const body = new Uint8Array(object.bytes);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": object.mimeType,
      "Content-Disposition": `attachment; filename="${fileName.replace(/"/g, "")}"`,
      "Content-Length": String(body.byteLength),
      // Never render an uploaded file inline in the app's origin.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store, max-age=0",
    },
  });
}
