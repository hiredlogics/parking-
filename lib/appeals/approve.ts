/**
 * Admin approval of a generated appeal.
 *
 * APPROVE is the release gate. PDF is rendered from frozen approved
 * text only — never from a fresh AI call.
 */
import type { SessionData } from "@/lib/auth/session";
import * as caseRepo from "@/lib/cases/repo";
import {
  findAppealById,
  markAppealApproved,
  markAppealHeld,
  markAppealRejected,
  type CaseAppeal,
} from "@/lib/appeals/repo";
import { queueAppealReadyEmail, processOutboxItem } from "@/lib/email/outbox";
import { insertAuditEvent } from "@/lib/kb/audit";
import { getStorageProvider } from "@/services/storage";
import { renderAppealPdf } from "@/services/documents/pdf";
import { documentBasename } from "@/lib/cases/documents";
import type { EvidenceItem } from "@/types";
import { getSql } from "@/lib/db/pool";

export type ApprovalFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409;
  code: string;
  message: string;
};

function requireAdmin(session: SessionData): ApprovalFailure | null {
  if (!session.userId || session.kind !== "ADMIN") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      message: "Admin access required.",
    };
  }
  return null;
}

function paragraphsFromBody(body: string): Array<{ id: string; text: string }> {
  return body
    .split(/\n\s*\n/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `p_manual_${i + 1}`, text }));
}

export async function approveAppeal(
  appealId: string,
  session: SessionData,
  opts: { bodyText?: string | null } = {},
): Promise<{ ok: true; appeal: CaseAppeal; emailId: string | null } | ApprovalFailure> {
  const denied = requireAdmin(session);
  if (denied) return denied;

  const before = await findAppealById(appealId);
  if (!before) {
    return { ok: false, status: 404, code: "NOT_FOUND", message: "Appeal not found." };
  }

  const override = opts.bodyText?.trim() || null;
  const hasExisting =
    Boolean(before.body?.trim()) && before.paragraphs.length > 0;
  if (!override && !hasExisting) {
    return {
      ok: false,
      status: 409,
      code: "NO_BODY",
      message:
        "This appeal has no text to approve. Paste the letter text, then Approve.",
    };
  }

  const overrideParagraphs = override ? paragraphsFromBody(override) : null;

  const appeal = await markAppealApproved({
    appealId,
    approvedBy: session.userId!,
    body: override,
    paragraphs: overrideParagraphs,
  });

  const appealCase = await caseRepo.findCase(appeal.caseId);
  if (!appealCase?.confirmed) {
    return { ok: false, status: 404, code: "CASE_NOT_FOUND", message: "Case not found." };
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

  const paragraphs = appeal.approvedParagraphs ?? appeal.paragraphs;
  const pdfBytes = await renderAppealPdf({
    pcn: appealCase.confirmed,
    evidence,
    appeal: { paragraphs },
  });

  const fileName = `${documentBasename(
    appealCase.pcnNumber,
    appealCase.vrm,
    appealCase.publicId,
  )}.pdf`;

  const storage = getStorageProvider();
  const meta = await storage.put({
    fileName,
    mimeType: "application/pdf",
    bytes: pdfBytes,
    namespace: appeal.caseId,
  });

  await caseRepo.addCaseDocument({
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
    description: "Approved appeal PDF",
    uploadedBy: session.userId!,
  });

  await caseRepo.setCaseStatus(appeal.caseId, "UNLOCKED");
  await caseRepo.setAwaitingAdminApproval(appeal.caseId, false);
  await caseRepo.markSubmitted(appeal.caseId);

  await caseRepo.addCaseEvent({
    caseId: appeal.caseId,
    eventType: "APPEAL_APPROVED",
    actorId: session.userId!,
    payload: {
      appealId: appeal.id,
      approvedVersion: appeal.approvedVersion,
      sha256: meta.sha256,
      storageKey: meta.storageKey,
    },
  });

  await insertAuditEvent({
    eventType: "APPEAL_APPROVED",
    caseId: appeal.caseId,
    actorId: session.userId!,
    payload: {
      appealId: appeal.id,
      knowledgeSnapshot: appeal.knowledgeSnapshot,
      moduleIds: appeal.moduleIds,
      sha256: meta.sha256,
    },
  });

  let emailId: string | null = null;
  try {
    const sql = getSql();
    const res = (await sql.query(`SELECT email FROM clients WHERE id = $1`, [
      appealCase.customerId,
    ])) as { rows?: Array<{ email: string }> };
    const recipient = res.rows?.[0]?.email ?? null;
    if (recipient) {
      emailId = await queueAppealReadyEmail({
        caseId: appeal.caseId,
        appealId: appeal.id,
        recipient,
      });
      void processOutboxItem(emailId);
    }
  } catch (err) {
    console.error("[approveAppeal] email queue failed (approval kept):", err);
  }

  return { ok: true, appeal, emailId };
}

export async function holdAppeal(
  appealId: string,
  session: SessionData,
  reason: string,
  notes?: string,
): Promise<{ ok: true; appeal: CaseAppeal } | ApprovalFailure> {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const appeal = await markAppealHeld(appealId, reason, notes);
  await caseRepo.addCaseEvent({
    caseId: appeal.caseId,
    eventType: "APPEAL_HELD",
    actorId: session.userId!,
    payload: { appealId, reason },
  });
  return { ok: true, appeal };
}

export async function rejectAppeal(
  appealId: string,
  session: SessionData,
  reason: string,
  notes?: string,
): Promise<{ ok: true; appeal: CaseAppeal } | ApprovalFailure> {
  const denied = requireAdmin(session);
  if (denied) return denied;
  const appeal = await markAppealRejected(appealId, reason, notes);
  await caseRepo.addCaseEvent({
    caseId: appeal.caseId,
    eventType: "APPEAL_REJECTED",
    actorId: session.userId!,
    payload: { appealId, reason },
  });
  return { ok: true, appeal };
}
