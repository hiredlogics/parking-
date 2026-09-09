import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess } from "@/lib/api/envelope";
import {
  getCustomerCaseState,
  requireCaseAccess,
  saveExtractionForCase,
} from "@/lib/cases/service";
import { addCaseDocument, addCaseEvent } from "@/lib/cases/repo";
import { getExtractionProvider } from "@/services/extraction";
import { getStorageProvider } from "@/services/storage";
import { consumeRateLimit, EXTRACTION_RATE_LIMIT } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
]);

const MAX_BYTES = 12 * 1024 * 1024;

/** Never echo anything that looks like an API key back to a browser. */
function redact(msg: string): string {
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, "sk-[redacted]");
}

/**
 * POST /api/cases/[id]/extract  (multipart/form-data)
 *
 * Reads a parking notice and persists the result against the case.
 *
 * This replaces the previously PUBLIC /api/extract. Every call here is
 * a paid vision request, so three things gate it:
 *
 *   1. a customer session,
 *   2. ownership of the case the extraction is bound to,
 *   3. a per-user hourly rate limit.
 *
 * The notice itself is stored as a PCN document, so the source of the
 * extracted facts remains auditable.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  // Ownership before anything expensive.
  const access = await requireCaseAccess(id, session, "write");
  if (!access.ok) return failFromAccess(access);

  const rule = EXTRACTION_RATE_LIMIT();
  const limit = await consumeRateLimit(session.userId!, rule);
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "RATE_LIMITED",
          message: `You have reached the limit of ${rule.limit} notice reads per hour. Please try again later.`,
        },
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(limit.retryAfterSeconds),
          "X-RateLimit-Limit": String(limit.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": limit.resetAt,
        },
      },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("BAD_REQUEST", "Expected a file upload.", 400);
  }

  const file = form.get("file");
  const hint = form.get("hint");
  if (!(file instanceof Blob)) {
    return fail("NO_FILE", "No file was provided.", 400);
  }

  const mime = ((file as File).type || "application/octet-stream").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return fail("UNSUPPORTED_TYPE", "Please upload a PDF, JPG or PNG.", 415);
  }
  if (file.size > MAX_BYTES) {
    return fail("FILE_TOO_LARGE", "That file is larger than 12 MB.", 413);
  }

  let provider;
  try {
    provider = getExtractionProvider();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cases/extract] provider not configured:", redact(message));
    // Configuration detail stays server-side.
    return fail(
      "EXTRACTION_UNAVAILABLE",
      "Notice reading is temporarily unavailable. Please try again shortly.",
      503,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = (file as File).name || "notice";

  let result;
  try {
    result = await provider.extract({
      name: fileName,
      mimeType: mime,
      bytes,
      hint: typeof hint === "string" ? hint : undefined,
    });
  } catch (err) {
    console.error("[cases/extract] extraction failed:", err);
    return fail(
      "EXTRACTION_FAILED",
      "We could not read that notice. Please try a clearer photo or a PDF.",
      502,
    );
  }

  // Keep the source document so the extracted facts stay auditable.
  try {
    const stored = await getStorageProvider().put({
      fileName,
      mimeType: mime,
      bytes,
      namespace: id,
    });
    await addCaseDocument({
      caseId: id,
      documentType: "PCN",
      storageKey: stored.storageKey,
      storageProvider: getStorageProvider().id,
      fileName: stored.fileName,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      uploadedBy: session.userId ?? "customer",
    });
  } catch (err) {
    // A storage failure must not discard a successful extraction.
    console.error("[cases/extract] could not store the notice:", err);
    await addCaseEvent({
      caseId: id,
      eventType: "PCN_STORAGE_FAILED",
      actorId: session.userId ?? null,
      payload: { fileName },
    });
  }

  const saved = await saveExtractionForCase(id, session, result);
  if (!saved.ok) return failFromAccess(saved);

  const state = await getCustomerCaseState(id, session);
  if (!state.ok) return failFromAccess(state);

  return NextResponse.json(
    { success: true, data: { case: state.state, extraction: result } },
    {
      status: 200,
      headers: {
        "X-RateLimit-Limit": String(limit.limit),
        "X-RateLimit-Remaining": String(limit.remaining),
        "X-RateLimit-Reset": limit.resetAt,
      },
    },
  );
}