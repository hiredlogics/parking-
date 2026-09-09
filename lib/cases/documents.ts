import type { SessionData } from "@/lib/auth/session";
import type { EvidenceItem } from "@/types";
import { renderAppealPdf } from "@/services/documents/pdf";
import { renderAppealDocx } from "@/services/documents/docx";
import { generateAppealForCase, type GenerationFailure } from "@/lib/generation/caseGeneration";
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

  const bytes =
    format === "pdf"
      ? await renderAppealPdf(input)
      : await renderAppealDocx(input);

  return {
    ok: true,
    document: {
      bytes: new Uint8Array(bytes),
      filename: `${documentBasename(appealCase.pcnNumber, appealCase.vrm, appealCase.publicId)}.${format}`,
      contentType: CONTENT_TYPES[format],
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
