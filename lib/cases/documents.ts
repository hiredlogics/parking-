import type { SessionData } from "@/lib/auth/session";
import type { EvidenceItem } from "@/types";
import { renderAppealPdf } from "@/services/documents/pdf";
import { generateAppealForCase, type GenerationFailure } from "@/lib/generation/caseGeneration";
import { findCurrentAppeal } from "@/lib/appeals/repo";
import { getStorageProvider } from "@/services/storage";
import { ensureFinalAppealDocument } from "./finalDocument";
import * as repo from "./repo";

/**
 * Case document rendering.
 *
 * The bytes are produced from the STORED draft — the same text that
 * passed validation — never from a fresh assembly at download time.
 * That means a re-download is byte-stable and cannot smuggle in wording
 * no validator ever saw.
 *
 * The entitlement check lives in `generateAppealForCase`, so there is no
 * path here that renders a document for an unpaid case.
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
  | { ok: false; status: 409; code: string; message: string }
> {
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

  const appealCase = await repo.findCase(caseId);
  if (!appealCase?.confirmed) {
    return {
      ok: false,
      status: 409,
      code: "CONFIRMATION_REQUIRED",
      message: "The notice details must be confirmed before downloading.",
    };
  }

  /*
   * Serve the persisted appeal, not a fresh render.
   *
   * The releasable PDF is produced once from the validated draft and
   * stored. Re-rendering on every download was measurably returning
   * different bytes each time — PDF output embeds a creation timestamp
   * — so a customer could download "their" appeal twice and get two
   * different files, neither matching the stored artefact of record.
   *
   * DOCX is deferred until a persisted artefact exists (see
   * docs/operations/DOCX_DEFERRED.md). On-demand regeneration of
   * released appeal content is not allowed in production.
   */
  if (format === "docx") {
    return {
      ok: false,
      status: 409,
      code: "DOCX_NOT_AVAILABLE",
      message:
        "Word download is not available yet. Please download the PDF — it is the released appeal of record.",
    };
  }

  if (format === "pdf") {
    const final = await ensureFinalAppealDocument(caseId, session);
    if (final.ok) {
      const doc = final.final.document;
      const object = await getStorageProvider().get(doc.storageKey);
      if (object) {
        return {
          ok: true,
          document: {
            bytes: new Uint8Array(object.bytes),
            filename: doc.fileName,
            contentType: doc.mimeType || CONTENT_TYPES.pdf,
          },
        };
      }
      // Object lost: fall through and re-render from the same draft.
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

  const input = {
    pcn: appealCase.confirmed,
    evidence,
    appeal: { paragraphs: draft.paragraphs },
  };

  const bytes = await renderAppealPdf(input);

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
