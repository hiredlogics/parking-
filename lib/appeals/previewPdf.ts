/**
 * Admin-only PDF preview from current letter text (does not store or release).
 */
import type { SessionData } from "@/lib/auth/session";
import * as caseRepo from "@/lib/cases/repo";
import { findAppealById } from "@/lib/appeals/repo";
import { renderAppealPdf } from "@/services/documents/pdf";
import { documentBasename } from "@/lib/cases/documents";
import type { EvidenceItem } from "@/types";
import type { ApprovalFailure } from "./approve";

function paragraphsFromBody(body: string): Array<{ id: string; text: string }> {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `p_preview_${i + 1}`, text }));
}

export async function previewAppealPdf(
  appealId: string,
  session: SessionData,
  opts: { bodyText?: string | null } = {},
): Promise<
  | { ok: true; bytes: Uint8Array; fileName: string }
  | ApprovalFailure
> {
  if (!session.userId || session.kind !== "ADMIN") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Admin access required.",
    };
  }

  const appeal = await findAppealById(appealId);
  if (!appeal) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Appeal not found." };
  }

  const appealCase = await caseRepo.findCase(appeal.caseId);
  if (!appealCase?.confirmed) {
    return { ok: false, status: 404, code: "CASE_NOT_FOUND", message: "Case not found." };
  }

  const override = opts.bodyText?.trim() || null;
  const paragraphs = override
    ? paragraphsFromBody(override)
    : appeal.paragraphs?.length
      ? appeal.paragraphs
      : appeal.body?.trim()
        ? paragraphsFromBody(appeal.body)
        : [];

  if (paragraphs.length === 0) {
    return {
      ok: false,
      status: 409,
      code: "NO_BODY",
      message: "There is no appeal text to preview yet.",
    };
  }

  const docs = await caseRepo.listCaseDocuments(appeal.caseId, "EVIDENCE");
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
    caseReference: appealCase.publicId,
  });

  const fileName = `${documentBasename(
    appealCase.pcnNumber,
    appealCase.vrm,
    appealCase.publicId,
  )}-preview.pdf`;

  return { ok: true, bytes, fileName };
}
