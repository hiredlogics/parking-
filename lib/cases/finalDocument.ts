import type { SessionData } from "@/lib/auth/session";
import type { EvidenceItem } from "@/types";
import { renderAppealPdf } from "@/services/documents/pdf";
import { renderAppealDocx } from "@/services/documents/docx";
import { getStorageProvider, SIGNED_URL_TTL_SECONDS } from "@/services/storage";
import type { StoredObject } from "@/services/storage";
import {
  generateAppealForCase,
  type GenerationFailure,
} from "@/lib/generation/caseGeneration";
import * as repo from "./repo";
import { requireCaseAccess, type AccessFailure } from "./service";
import { requireStepEntitlement } from "./service";
import type { AppealDraftRow } from "./draftRepo";
import type { CaseDocument } from "./types";
import { documentBasename } from "./documents";

/**
 * Final appeal document.
 *
 * The missing link that kept the finished PDF out of My Documents: the
 * validated appeal was persisted, but the PDF was rendered on demand
 * and never recorded, so no GENERATED row existed for the portal to
 * find.
 *
 * The immutability rule this module enforces:
 *
 *   validated draft → PDF rendered ONCE → stored → metadata row
 *                                              → every download reads that row
 *
 * A download never re-runs drafting and never calls a model. If PDF
 * generation fails the validated draft is untouched and generation is
 * retried from it — the two failures are deliberately separable,
 * because a paid-for appeal must not be lost to a rendering problem.
 */

export type FinalDocumentFailure =
  | AccessFailure
  | GenerationFailure
  | { ok: false; status: 402 | 409 | 503; code: string; message: string };

export interface FinalDocument {
  document: CaseDocument;
  draft: AppealDraftRow;
  /** True when this call rendered it rather than reusing a stored file. */
  created: boolean;
}

const PDF_MIME = "application/pdf";

/**
 * Ensure a stored final-appeal PDF exists for the case, and return it.
 *
 * Idempotent per validated draft: a second call reuses the stored file.
 * A regenerated draft gets its own document, so history is preserved.
 */
export async function ensureFinalAppealDocument(
  caseId: string,
  session: SessionData,
): Promise<{ ok: true; final: FinalDocument } | FinalDocumentFailure> {
  // Entitlement lives in generateAppealForCase — no unpaid case reaches
  // a draft, so none reaches a PDF either.
  const generated = await generateAppealForCase(caseId, session);
  if (!generated.ok) return generated;
  const draft = generated.draft;

  if (draft.status !== "READY" || draft.paragraphs.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "APPEAL_NOT_RELEASED",
      message:
        "This appeal is with our team for review and is not available to download yet.",
    };
  }

  // Already rendered for this exact validated draft — reuse it.
  const existing = await repo.findGeneratedDocumentForDraft(caseId, draft.id);
  if (existing) {
    return { ok: true, final: { document: existing, draft, created: false } };
  }

  const appealCase = await repo.findCase(caseId);
  if (!appealCase?.confirmed) {
    return {
      ok: false,
      status: 409,
      code: "CONFIRMATION_REQUIRED",
      message: "The notice details must be confirmed before the appeal can be issued.",
    };
  }

  const evidence = await evidenceItemsFor(caseId);
  const filename = `${documentBasename(
    appealCase.pcnNumber,
    appealCase.vrm,
    appealCase.publicId,
  )}.pdf`;

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(
      await renderAppealPdf({
        pcn: appealCase.confirmed,
        evidence,
        // The exact text that passed validation.
        appeal: { paragraphs: draft.paragraphs },
      }),
    );
  } catch (err) {
    // The validated draft survives. Retry renders again from it.
    console.error("[finalDocument] PDF rendering failed:", err);
    await repo.addCaseEvent({
      caseId,
      eventType: "PDF_GENERATION_FAILED",
      actorId: session.userId ?? null,
      payload: { draftId: draft.id, stage: "render" },
    });
    return {
      ok: false,
      status: 503,
      code: "PDF_RENDER_FAILED",
      message: "We could not produce your appeal document. Please try again shortly.",
    };
  }

  let stored;
  try {
    stored = await getStorageProvider().put({
      fileName: filename,
      mimeType: PDF_MIME,
      bytes,
      namespace: caseId,
    });
  } catch (err) {
    console.error("[finalDocument] PDF storage failed:", err);
    await repo.addCaseEvent({
      caseId,
      eventType: "PDF_GENERATION_FAILED",
      actorId: session.userId ?? null,
      payload: { draftId: draft.id, stage: "storage" },
    });
    return {
      ok: false,
      status: 503,
      code: "PDF_STORAGE_FAILED",
      message: "We could not save your appeal document. Please try again shortly.",
    };
  }

  const document = await repo.addCaseDocument({
    caseId,
    documentType: "GENERATED",
    storageKey: stored.storageKey,
    storageProvider: getStorageProvider().id,
    fileName: filename,
    mimeType: PDF_MIME,
    sizeBytes: stored.sizeBytes,
    sha256: stored.sha256,
    uploadedBy: "SYSTEM",
    // Ties the file to the validated appeal it came from.
    sourceDraftId: draft.id,
    description: `Final appeal (v${draft.version})`,
  });

  await repo.addCaseEvent({
    caseId,
    eventType: "PDF_GENERATED",
    actorId: session.userId ?? null,
    payload: {
      documentId: document.id,
      draftId: draft.id,
      draftVersion: draft.version,
      sizeBytes: stored.sizeBytes,
      storageProvider: getStorageProvider().id,
    },
  });

  return { ok: true, final: { document, draft, created: true } };
}

export type DocumentDelivery =
  | { kind: "redirect"; url: string; expiresInSeconds: number }
  | { kind: "stream"; object: StoredObject; fileName: string; mimeType: string };

/**
 * Resolve a download for ANY document on a case.
 *
 * Ownership is checked every time, and a GENERATED document
 * additionally requires the payment entitlement — the stored PDF is
 * the paid deliverable, so a storage key must never be sufficient to
 * fetch it.
 */
export async function getCaseDocumentDelivery(
  caseId: string,
  session: SessionData,
  documentId: string,
): Promise<
  | { ok: true; delivery: DocumentDelivery; document: CaseDocument }
  | FinalDocumentFailure
> {
  const access = await requireCaseAccess(caseId, session, "read");
  if (!access.ok) return access;

  const doc = await repo.findCaseDocument(documentId);
  // The document must belong to THIS case, or a valid id from one case
  // could read another.
  if (!doc || doc.caseId !== caseId) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "File not found." };
  }

  if (doc.documentType === "GENERATED") {
    const entitled = await requireStepEntitlement(caseId, session, "PDF");
    if (!entitled.ok) return entitled;
  }

  const storage = getStorageProvider();
  const signed = await storage.signedUrl(doc.storageKey, {
    expiresInSeconds: SIGNED_URL_TTL_SECONDS,
    downloadName: doc.fileName,
  });
  if (signed) {
    return {
      ok: true,
      document: doc,
      delivery: {
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
      status: 409,
      code: "OBJECT_MISSING",
      message: "That file is no longer available.",
    };
  }
  return {
    ok: true,
    document: doc,
    delivery: {
      kind: "stream",
      object,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
    },
  };
}

/** Re-render a Word copy from the same validated draft. */
export async function renderFinalAppealDocx(
  caseId: string,
  session: SessionData,
): Promise<
  | { ok: true; bytes: Uint8Array; filename: string }
  | FinalDocumentFailure
> {
  const final = await ensureFinalAppealDocument(caseId, session);
  if (!final.ok) return final;

  const appealCase = await repo.findCase(caseId);
  if (!appealCase?.confirmed) {
    return {
      ok: false, status: 409, code: "CONFIRMATION_REQUIRED",
      message: "The notice details must be confirmed.",
    };
  }
  const bytes = await renderAppealDocx({
    pcn: appealCase.confirmed,
    evidence: await evidenceItemsFor(caseId),
    appeal: { paragraphs: final.final.draft.paragraphs },
  });
  return {
    ok: true,
    bytes: new Uint8Array(bytes),
    filename: final.final.document.fileName.replace(/\.pdf$/, ".docx"),
  };
}

async function evidenceItemsFor(caseId: string): Promise<EvidenceItem[]> {
  const docs = await repo.listCaseDocuments(caseId, "EVIDENCE");
  return docs.map((d) => ({
    id: d.id,
    type: (d.evidenceType ?? "other") as EvidenceItem["type"],
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storageKey: d.storageKey,
    uploadedAt: d.uploadedAt,
    description: d.description ?? undefined,
  }));
}
