/**
 * Automatic customer release after validation PASS.
 *
 * Shared by post-payment generation and admin exception APPROVE.
 * Creates Final Appeal PDF + Instructions, unlocks the case, emails
 * the customer. No fresh AI call — text is frozen from the appeal row.
 */
import * as caseRepo from "@/lib/cases/repo";
import {
  findAppealById,
  markAppealApproved,
  type CaseAppeal,
} from "@/lib/appeals/repo";
import { queueAppealReadyEmail, processOutboxItem } from "@/lib/email/outbox";
import { insertAuditEvent } from "@/lib/kb/audit";
import { getStorageProvider } from "@/services/storage";
import { renderAppealPdf } from "@/services/documents/pdf";
import { renderInstructionsPdf } from "@/services/documents/instructionsPdf";
import { documentBasename } from "@/lib/cases/documents";
import type { EvidenceItem } from "@/types";
import { getSql } from "@/lib/db/pool";

export type ReleaseFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: string;
  message: string;
};

export type ReleaseSuccess = {
  ok: true;
  appeal: CaseAppeal;
  emailId: string | null;
  appealDocId: string;
  instructionsDocId: string;
};

function paragraphsFromBody(body: string): Array<{ id: string; text: string }> {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `p_rel_${i + 1}`, text }));
}

/**
 * Approve (if needed) + persist Final Appeal PDF + Instructions + email.
 *
 * `approvedBy` is the admin user id, or `"SYSTEM"` for automatic release.
 */
export async function releaseAppealToCustomer(input: {
  appealId: string;
  approvedBy: string;
  /** Optional override body (admin edit path). */
  bodyText?: string | null;
  paragraphs?: Array<{ id: string; text: string }> | null;
  eventType?: "APPEAL_READY" | "APPEAL_APPROVED";
}): Promise<ReleaseSuccess | ReleaseFailure> {
  const before = await findAppealById(input.appealId);
  if (!before) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Appeal not found." };
  }

  const override = input.bodyText?.trim() || null;
  const hasExisting =
    Boolean(before.body?.trim()) && before.paragraphs.length > 0;
  if (!override && !hasExisting) {
    return {
      ok: false,
      status: 409,
      code: "NO_BODY",
      message: "This appeal has no text to release.",
    };
  }

  let appeal: CaseAppeal = before;
  if (before.status !== "APPROVED") {
    appeal = await markAppealApproved({
      appealId: input.appealId,
      approvedBy: input.approvedBy,
      body: override,
      paragraphs: input.paragraphs
        ?? (override ? paragraphsFromBody(override) : null),
    });
  }

  const appealCase = await caseRepo.findCase(appeal.caseId);
  if (!appealCase?.confirmed) {
    return { ok: false, status: 404, code: "CASE_NOT_FOUND", message: "Case not found." };
  }

  const existingGenerated = await caseRepo.listCaseDocuments(
    appeal.caseId,
    "GENERATED",
  );
  const existingInstructions = await caseRepo.listCaseDocuments(
    appeal.caseId,
    "INSTRUCTIONS",
  );
  const alreadyReleased =
    existingGenerated.length > 0 &&
    existingInstructions.length > 0 &&
    appealCase.status === "UNLOCKED";

  let appealDocId = existingGenerated.at(-1)?.id ?? "";
  let instructionsDocId = existingInstructions.at(-1)?.id ?? "";

  if (!alreadyReleased) {
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

    const paragraphs =
      appeal.approvedParagraphs ??
      appeal.paragraphs ??
      (appeal.body ? paragraphsFromBody(appeal.body) : []);

    const storage = getStorageProvider();
    const base = documentBasename(
      appealCase.pcnNumber,
      appealCase.vrm,
      appealCase.publicId,
    );

    if (!appealDocId) {
      const pdfBytes = await renderAppealPdf({
        pcn: appealCase.confirmed,
        evidence,
        appeal: { paragraphs },
        caseReference: appealCase.publicId,
      });
      const meta = await storage.put({
        fileName: `${base}.pdf`,
        mimeType: "application/pdf",
        bytes: pdfBytes,
        namespace: appeal.caseId,
      });
      const doc = await caseRepo.addCaseDocument({
        caseId: appeal.caseId,
        documentType: "GENERATED",
        evidenceType: null,
        storageKey: meta.storageKey,
        storageProvider: storage.id,
        fileName: meta.fileName,
        mimeType: "application/pdf",
        sizeBytes: meta.sizeBytes,
        sha256: meta.sha256,
        sourceDraftId: appeal.sourceDraftId,
        description: "Final Appeal PDF",
        uploadedBy: input.approvedBy,
      });
      appealDocId = doc.id;
    }

    if (!instructionsDocId) {
      const instrBytes = await renderInstructionsPdf({
        caseReference: appealCase.publicId,
        operatorName: appealCase.operatorName,
        pcnNumber: appealCase.pcnNumber,
      });
      const meta = await storage.put({
        fileName: `${base}-instructions.pdf`,
        mimeType: "application/pdf",
        bytes: instrBytes,
        namespace: appeal.caseId,
      });
      const doc = await caseRepo.addCaseDocument({
        caseId: appeal.caseId,
        documentType: "INSTRUCTIONS",
        evidenceType: null,
        storageKey: meta.storageKey,
        storageProvider: storage.id,
        fileName: meta.fileName,
        mimeType: "application/pdf",
        sizeBytes: meta.sizeBytes,
        sha256: meta.sha256,
        sourceDraftId: appeal.sourceDraftId,
        description: "Appeal submission instructions",
        uploadedBy: input.approvedBy,
      });
      instructionsDocId = doc.id;
    }

    await caseRepo.setCaseStatus(appeal.caseId, "UNLOCKED");
    await caseRepo.setAwaitingAdminApproval(appeal.caseId, false);
    await caseRepo.markSubmitted(appeal.caseId);

    const eventType = input.eventType ?? "APPEAL_READY";
    await caseRepo.addCaseEvent({
      caseId: appeal.caseId,
      eventType,
      actorId: input.approvedBy === "SYSTEM" ? null : input.approvedBy,
      payload: {
        appealId: appeal.id,
        approvedVersion: appeal.approvedVersion,
        appealDocId,
        instructionsDocId,
        automatic: input.approvedBy === "SYSTEM",
      },
    });

    await insertAuditEvent({
      eventType,
      caseId: appeal.caseId,
      actorId: input.approvedBy === "SYSTEM" ? null : input.approvedBy,
      payload: {
        appealId: appeal.id,
        knowledgeSnapshot: appeal.knowledgeSnapshot,
        moduleIds: appeal.moduleIds,
        automatic: input.approvedBy === "SYSTEM",
      },
    });
  }

  let emailId: string | null = null;
  try {
    const sql = getSql();
    const res = (await sql.query(
      `SELECT email, name FROM clients WHERE id = $1`,
      [appealCase.customerId],
    )) as
      | { rows?: Array<{ email: string | null; name: string | null }> }
      | Array<{ email: string | null; name: string | null }>;
    const clientRow = Array.isArray(res) ? res[0] : res.rows?.[0];
    const recipient = clientRow?.email?.trim() || null;
    if (!recipient) {
      console.warn(
        `[releaseAppealToCustomer] no customer email for case ${appeal.caseId} — skipped APPEAL_READY mail`,
      );
    } else {
      const prior = (await sql.query(
        `SELECT id FROM email_outbox
         WHERE case_id = $1 AND email_type = 'APPEAL_READY' AND status = 'SENT'
         LIMIT 1`,
        [appeal.caseId],
      )) as { rows?: Array<{ id: string }> } | Array<{ id: string }>;
      const alreadySent = Array.isArray(prior)
        ? prior.length > 0
        : (prior.rows?.length ?? 0) > 0;

      if (!alreadySent) {
        emailId = await queueAppealReadyEmail({
          caseId: appeal.caseId,
          appealId: appeal.id,
          recipient,
          customerName: clientRow?.name,
          caseReference: appealCase.publicId,
          pcnNumber: appealCase.pcnNumber,
          operatorName: appealCase.operatorName,
          hasAttachments: true,
        });
        void processOutboxItem(emailId).then((sent) => {
          if (!sent) {
            console.warn(
              `[releaseAppealToCustomer] APPEAL_READY email queued but send failed (id=${emailId}). Check SMTP_* in .env.local / Vercel.`,
            );
          }
        });
      }
    }
  } catch (err) {
    console.error("[releaseAppealToCustomer] email queue failed (release kept):", err);
  }

  return { ok: true, appeal, emailId, appealDocId, instructionsDocId };
}
