import type { SessionData } from "@/lib/auth/session";
import {
  getStorageProvider,
  SIGNED_URL_TTL_SECONDS,
  type StoredObject,
} from "@/services/storage";
import { requireCaseAccess, type AccessFailure } from "./service";
import * as repo from "./repo";
import type { CaseDocument } from "./types";

/**
 * Evidence upload and retrieval.
 *
 * Access rules, in one place so no route can forget them:
 *
 *   - Uploading requires the owning customer. Admins are read-only on a
 *     customer's case, so they cannot plant evidence.
 *   - A storage key is not a capability. Every download re-checks that
 *     the document belongs to the case, and the case to the caller.
 *   - Signed URLs are short-lived and issued only after that check.
 */

export const MAX_EVIDENCE_BYTES = 20 * 1024 * 1024;

/**
 * Deliberately narrow. Office documents and archives are excluded
 * because they can carry active content and we never need to open them.
 */
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
  "application/pdf",
  "text/plain",
];

/** Evidence categories the analysis and retrieval layers understand. */
export const ALLOWED_EVIDENCE_TYPES = new Set([
  "payment_receipt",
  "app_screenshot",
  "permit",
  "signage_photo",
  "anpr_evidence",
  "location_evidence",
  "authorisation_evidence",
  "other",
]);

export type EvidenceFailure =
  | AccessFailure
  | { ok: false; status: 400 | 413 | 415 | 503; code: string; message: string };

export function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME.includes(mime.toLowerCase());
}

/** Human-readable list for error messages and the UI. */
export const ALLOWED_MIME_LABEL = "JPEG, PNG, WebP, HEIC, GIF, PDF or plain text";

/**
 * Validate, store and attach an evidence file in one authenticated step.
 *
 * Doing it as one operation means bytes are never accepted without a
 * case to attach them to — the previous two-step flow had an
 * unauthenticated upload endpoint that would store anything.
 */
export async function uploadEvidenceForCase(
  caseId: string,
  session: SessionData,
  input: {
    fileName: string;
    mimeType: string;
    bytes: Uint8Array;
    evidenceType: string;
    description?: string | null;
  },
): Promise<{ ok: true; document: CaseDocument } | EvidenceFailure> {
  const access = await requireCaseAccess(caseId, session, "write");
  if (!access.ok) return access;

  if (!ALLOWED_EVIDENCE_TYPES.has(input.evidenceType)) {
    return {
      ok: false,
      status: 400,
      code: "BAD_EVIDENCE_TYPE",
      message: "Unrecognised evidence type.",
    };
  }
  if (input.bytes.byteLength === 0) {
    return { ok: false, status: 400, code: "EMPTY_FILE", message: "That file is empty." };
  }
  if (input.bytes.byteLength > MAX_EVIDENCE_BYTES) {
    return {
      ok: false,
      status: 413,
      code: "FILE_TOO_LARGE",
      message: "That file is larger than 20 MB. Please upload a smaller version.",
    };
  }
  if (!isAllowedMime(input.mimeType)) {
    return {
      ok: false,
      status: 415,
      code: "UNSUPPORTED_TYPE",
      message: `We can only accept ${ALLOWED_MIME_LABEL}.`,
    };
  }

  let stored;
  try {
    stored = await getStorageProvider().put({
      fileName: input.fileName,
      mimeType: input.mimeType,
      bytes: input.bytes,
      // Namespacing by case keeps each customer's objects separated.
      namespace: caseId,
    });
  } catch (err) {
    console.error("[evidence] storage put failed:", err);
    return {
      ok: false,
      status: 503,
      code: "STORAGE_UNAVAILABLE",
      message: "We could not save that file. Please try again shortly.",
    };
  }

  const document = await repo.addCaseDocument({
    caseId,
    documentType: "EVIDENCE",
    evidenceType: input.evidenceType,
    storageKey: stored.storageKey,
    storageProvider: getStorageProvider().id,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    sha256: stored.sha256,
    description: input.description ?? null,
    uploadedBy: session.userId ?? "customer",
  });

  await repo.addCaseEvent({
    caseId,
    eventType: "DOCUMENT_UPLOADED",
    actorId: session.userId ?? null,
    payload: {
      documentId: document.id,
      evidenceType: input.evidenceType,
      storageProvider: getStorageProvider().id,
      sizeBytes: stored.sizeBytes,
    },
  });

  return { ok: true, document };
}

export type EvidenceDownload =
  | { kind: "redirect"; url: string; expiresInSeconds: number }
  | { kind: "stream"; object: StoredObject; fileName: string };

/**
 * Resolve a download for one evidence item.
 *
 * Prefers a short-lived signed URL so the bytes come straight from
 * object storage. Falls back to streaming through the server when the
 * provider cannot sign (in-memory, local dev).
 */
export async function getEvidenceDownload(
  caseId: string,
  session: SessionData,
  documentId: string,
): Promise<{ ok: true; download: EvidenceDownload } | EvidenceFailure> {
  // Admins may read a customer's evidence; only owners may write.
  const access = await requireCaseAccess(caseId, session, "read");
  if (!access.ok) return access;

  const doc = await repo.findCaseDocument(documentId);
  // The document must belong to THIS case — otherwise a valid id from
  // one case could be used to read another.
  if (!doc || doc.caseId !== caseId) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "File not found." };
  }

  const storage = getStorageProvider();
  const signed = await storage.signedUrl(doc.storageKey, {
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    downloadName: doc.fileName,
  });
  if (signed) {
    return {
      ok: true,
      download: {
        kind: "redirect",
        url: signed,
        expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      },
    };
  }

  const object = await storage.get(doc.storageKey);
  if (!object) {
    return {
      ok: false,
      status: 404,
      code: "OBJECT_MISSING",
      message: "That file is no longer available.",
    };
  }
  return { ok: true, download: { kind: "stream", object, fileName: doc.fileName } };
}
