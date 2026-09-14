import type { SessionData } from "@/lib/auth/session";
import type { EvidenceItem } from "@/types";
import { renderAppealPdf } from "@/services/documents/pdf";
import { type GenerationFailure } from "@/lib/generation/caseGeneration";
import { findCurrentAppeal } from "@/lib/appeals/repo";
import { getStorageProvider } from "@/services/storage";
import { requireCaseAccess, type AccessFailure } from "./service";
import * as repo from "./repo";

/**
 * Case document rendering.
 *
 * After admin APPROVE, the PDF of record is the stored GENERATED file
 * (or a re-render from frozen approved paragraphs). Download never
 * depends on the draft still being READY — MANUAL_REVIEW cases can be
 * approved with admin/manual text and still download.
 */

export type DocumentFormat = "pdf" | "docx";

export interface RenderedDocument {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

const CONTENT_TYPES: Record<DocumentFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export async function renderCaseDocument(
  caseId: string,
  session: SessionData,
  format: DocumentFormat,
): Promise<
  | { ok: true; document: RenderedDocument }
  | GenerationFailure
  | AccessFailure
  | { ok: false; status: 409; code: string; message: string }
> {
  const access = await requireCaseAccess(caseId, session);
  if (!access.ok) return access;

  const paid =
    access.appealCase.paymentStatus === "PAID" ||
    access.appealCase.paymentStatus === "NOT_REQUIRED";
  if (!paid) {
    return {
      ok: false,
      status: 402,
      code: "PAYMENT_REQUIRED",
      message: "Payment is required before the appeal can be downloaded.",
    };
  }

  const appeal = await findCurrentAppeal(caseId);
  if (!appeal || appeal.status !== "APPROVED") {
    return {
      ok: false,
      status: 409,
      code: "APPEAL_NOT_RELEASED",
      message:
        "This appeal is with our team for review and is not available to download yet.",
    };
  }

  const paragraphs =
    (appeal.approvedParagraphs && appeal.approvedParagraphs.length > 0
      ? appeal.approvedParagraphs
      : appeal.paragraphs) ?? [];

  if (paragraphs.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "APPEAL_NOT_RELEASED",
      message:
        "This appeal is with our team for review and is not available to download yet.",
    };
  }

  const appealCase = access.appealCase;
  if (!appealCase.confirmed) {
    return {
      ok: false,
      status: 409,
      code: "CONFIRMATION_REQUIRED",
      message: "The notice details must be confirmed before downloading.",
    };
  }

  if (format === "docx") {
    return {
      ok: false,
      status: 409,
      code: "DOCX_NOT_AVAILABLE",
      message:
        "Word download is not available yet. Please download the PDF — it is the released appeal of record.",
    };
  }

  // Prefer the immutable PDF written at approve time.
  const generatedDocs = await repo.listCaseDocuments(caseId, "GENERATED");
  const preferred =
    (appeal.sourceDraftId
      ? [...generatedDocs]
          .reverse()
          .find((d) => d.sourceDraftId === appeal.sourceDraftId)
      : null) ?? generatedDocs[generatedDocs.length - 1];

  if (preferred) {
    const object = await getStorageProvider().get(preferred.storageKey);
    if (object) {
      return {
        ok: true,
        document: {
          bytes: new Uint8Array(object.bytes),
          filename: preferred.fileName,
          contentType: preferred.mimeType || CONTENT_TYPES.pdf,
        },
      };
    }
  }

  const docs = await repo.listCaseDocuments(caseId, "EVIDENCE");
  const evidence: EvidenceItem[] = docs.map((d) => ({
    id: d.id,
    type: (d.evidenceType ?? "other") as EvidenceItem["type"],
    fileName: d.fileName,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    storageKey: d.storageKey,
    uploadedAt: d.uploadedAt,
    description: d.description ?? undefined,
  }));

  const bytes = await renderAppealPdf({
    pcn: appealCase.confirmed,
    evidence,
    appeal: { paragraphs },
  });

  return {
    ok: true,
    document: {
      bytes: new Uint8Array(bytes),
      filename: `${documentBasename(appealCase.pcnNumber, appealCase.vrm, appealCase.publicId)}.pdf`,
      contentType: CONTENT_TYPES.pdf,
    },
  };
}

/** Filename safe for a Content-Disposition header. */
export function documentBasename(
  pcnNumber: string | null,
  vrm: string | null,
  fallback: string,
): string {
  const raw = pcnNumber ?? vrm ?? fallback;
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
  return `Parking-Appeal-${safe || fallback}`;
}
