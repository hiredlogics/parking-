import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import {
  MAX_EVIDENCE_BYTES,
  uploadEvidenceForCase,
} from "@/lib/cases/evidence";
import { getCustomerCaseState } from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/evidence/upload  (multipart/form-data)
 *
 * Validates, stores and attaches an evidence file in one authenticated
 * step. This replaces the previous unauthenticated /api/evidence
 * endpoint, which accepted bytes from anyone with no case to bind them
 * to.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  if (session.userId) {
    const limited = await (
      await import("@/lib/rateLimit")
    ).enforceRateLimit(session.userId, "UPLOAD");
    if (limited) return limited;
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("BAD_REQUEST", "Expected a file upload.", 400);
  }

  const file = form.get("file");
  const evidenceType = form.get("type");
  const description = form.get("description");

  if (!(file instanceof Blob)) {
    return fail("NO_FILE", "No file was provided.", 400);
  }
  if (typeof evidenceType !== "string" || evidenceType.trim() === "") {
    return fail("NO_TYPE", "Tell us what kind of evidence this is.", 400);
  }
  // Cheap rejection before reading the whole body into memory.
  if (file.size > MAX_EVIDENCE_BYTES) {
    return fail(
      "FILE_TOO_LARGE",
      "That file is larger than 20 MB. Please upload a smaller version.",
      413,
    );
  }

  const result = await uploadEvidenceForCase(id, session, {
    fileName: (file as File).name || "evidence",
    mimeType: file.type || "application/octet-stream",
    bytes: new Uint8Array(await file.arrayBuffer()),
    evidenceType,
    description: typeof description === "string" ? description : null,
  });
  if (!result.ok) return failFromAccess(result);

  // Return the refreshed case so the client cache stays in step.
  const state = await getCustomerCaseState(id, session);
  if (!state.ok) return failFromAccess(state);

  return ok({ case: state.state, documentId: result.document.id });
}
