/**
 * Email outbox — queue, send, retry. Failure never rolls back approval.
 *
 * APPEAL_READY sends a branded HTML body and attaches the Final Appeal
 * + Instructions PDFs from storage (no localhost-only link required).
 */
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { getEmailTemplate } from "@/lib/config/adminRepo";
import {
  sendEmail,
  type EmailAttachment,
} from "@/lib/services/email";
import { publicUrl, paths, publicOrigin } from "@/lib/config/publicUrl";
import { buildAppealReadyEmail } from "@/lib/email/templates/appealReady";
import * as caseRepo from "@/lib/cases/repo";
import { getStorageProvider } from "@/services/storage";

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export async function queueEmail(input: {
  emailType: string;
  caseId: string | null;
  appealId: string | null;
  recipient: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  templateCode?: string | null;
}): Promise<string> {
  const now = new Date().toISOString();
  const id = `eml_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await q(
    `INSERT INTO email_outbox (
       id, email_type, case_id, appeal_id, recipient, subject, body_text,
       body_html, template_code, queued_at, status, attempts, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'QUEUED',0,$10,$10)`,
    [
      id,
      input.emailType,
      input.caseId,
      input.appealId,
      input.recipient,
      input.subject,
      input.bodyText,
      input.bodyHtml ?? null,
      input.templateCode ?? null,
      now,
    ],
  );
  return id;
}

function portalUrlForCase(caseId: string): string | null {
  // Never advertise localhost in customer email.
  const origin = publicOrigin();
  if (!origin || /localhost|127\.0\.0\.1/i.test(origin)) return null;
  return publicUrl(`${paths.portal}/cases/${caseId}`);
}

/** Queue the customer-facing APPEAL_READY email (branded HTML). */
export async function queueAppealReadyEmail(input: {
  caseId: string;
  appealId: string;
  recipient: string;
  customerName?: string | null;
  caseReference?: string | null;
  pcnNumber?: string | null;
  operatorName?: string | null;
  /** When true, copy says PDFs are attached (send path loads them). */
  hasAttachments?: boolean;
}): Promise<string> {
  const tpl = await getEmailTemplate("APPEAL_READY");
  const portal = portalUrlForCase(input.caseId);
  const hasAttachments = input.hasAttachments !== false;

  const branded = buildAppealReadyEmail({
    customerName: input.customerName,
    caseReference: input.caseReference,
    pcnNumber: input.pcnNumber,
    operatorName: input.operatorName,
    portalUrl: portal,
    hasAttachments,
  });

  // Prefer branded builder; allow admin subject override only when set
  // and not the thin default.
  const subject = branded.subject;
  const bodyText = branded.text;
  const bodyHtml = branded.html;

  // If admin saved a custom HTML template with {{tokens}}, honour it.
  if (tpl?.bodyHtml && tpl.bodyHtml.includes("{{")) {
    const custom = tpl.bodyHtml
      .replace(/\{\{viewUrl\}\}/g, portal ?? "")
      .replace(/\{\{customerName\}\}/g, input.customerName ?? "")
      .replace(/\{\{pcnNumber\}\}/g, input.pcnNumber ?? "")
      .replace(/\{\{caseReference\}\}/g, input.caseReference ?? "")
      .replace(/\{\{operatorName\}\}/g, input.operatorName ?? "");
    if (custom.trim().length > 200) {
      return queueEmail({
        emailType: "APPEAL_READY",
        caseId: input.caseId,
        appealId: input.appealId,
        recipient: input.recipient,
        subject: tpl.subject || subject,
        bodyText:
          tpl.bodyText
            ?.replace(/\{\{viewUrl\}\}/g, portal ?? "")
            .replace(/\{\{customerName\}\}/g, input.customerName ?? "") ??
          bodyText,
        bodyHtml: custom,
        templateCode: "APPEAL_READY",
      });
    }
  }

  return queueEmail({
    emailType: "APPEAL_READY",
    caseId: input.caseId,
    appealId: input.appealId,
    recipient: input.recipient,
    subject,
    bodyText,
    bodyHtml,
    templateCode: "APPEAL_READY",
  });
}

async function attachmentsForAppealReady(
  caseId: string,
): Promise<EmailAttachment[]> {
  const storage = getStorageProvider();
  const out: EmailAttachment[] = [];

  const generated = await caseRepo.listCaseDocuments(caseId, "GENERATED");
  const instructions = await caseRepo.listCaseDocuments(caseId, "INSTRUCTIONS");

  const appealDoc = generated.at(-1);
  const instrDoc = instructions.at(-1);

  if (appealDoc?.storageKey) {
    const obj = await storage.get(appealDoc.storageKey);
    if (obj?.bytes?.length) {
      out.push({
        filename: appealDoc.fileName?.endsWith(".pdf")
          ? appealDoc.fileName
          : "Final-Appeal.pdf",
        content: obj.bytes,
        contentType: "application/pdf",
      });
    }
  }

  if (instrDoc?.storageKey) {
    const obj = await storage.get(instrDoc.storageKey);
    if (obj?.bytes?.length) {
      out.push({
        filename: instrDoc.fileName?.endsWith(".pdf")
          ? instrDoc.fileName
          : "Submission-Instructions.pdf",
        content: obj.bytes,
        contentType: "application/pdf",
      });
    }
  }

  return out;
}

/** Attempt to send one queued email. Never throws to callers of approve. */
export async function processOutboxItem(id: string): Promise<boolean> {
  const rows = await q(`SELECT * FROM email_outbox WHERE id = $1`, [id]);
  const row = rows[0];
  if (!row || row.status === "SENT") return true;

  const now = new Date().toISOString();
  await q(
    `UPDATE email_outbox SET attempts = attempts + 1, updated_at = $2 WHERE id = $1`,
    [id, now],
  );

  try {
    let attachments: EmailAttachment[] | undefined;
    if (
      (row.email_type === "APPEAL_READY" || row.template_code === "APPEAL_READY") &&
      row.case_id
    ) {
      try {
        attachments = await attachmentsForAppealReady(row.case_id as string);
        if (!attachments.length) {
          console.warn(
            `[email/outbox] ${id} APPEAL_READY: no PDF attachments found for case ${row.case_id}`,
          );
        }
      } catch (err) {
        console.warn(`[email/outbox] ${id} attachment load failed:`, err);
      }
    }

    const result = await sendEmail({
      to: row.recipient as string,
      subject: row.subject as string,
      text: row.body_text as string,
      html: (row.body_html as string | null) ?? undefined,
      attachments,
    });
    if (result.ok) {
      await q(
        `UPDATE email_outbox SET status = 'SENT', sent_at = $2, updated_at = $2,
           failure_reason = NULL WHERE id = $1`,
        [id, now],
      );
      return true;
    }
    const reason =
      result.reason === "not_configured"
        ? "SMTP not configured — set real SMTP_USER / EMAIL_FROM_ADDRESS / SMTP_PASSWORD (not placeholders)"
        : result.error ?? "send failed";
    console.warn(`[email/outbox] ${id} → ${result.reason}: ${reason}`);
    await q(
      `UPDATE email_outbox SET status = 'FAILED', failure_reason = $2, updated_at = $3
       WHERE id = $1`,
      [id, reason, now],
    );
    return false;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await q(
      `UPDATE email_outbox SET status = 'FAILED', failure_reason = $2, updated_at = $3
       WHERE id = $1`,
      [id, msg, now],
    );
    return false;
  }
}

export async function processQueuedEmails(limit = 20): Promise<number> {
  const rows = await q(
    `SELECT id FROM email_outbox
     WHERE status = 'QUEUED' OR (status = 'FAILED' AND attempts < 5)
     ORDER BY queued_at ASC LIMIT $1`,
    [limit],
  );
  let ok = 0;
  for (const r of rows) {
    if (await processOutboxItem(r.id as string)) ok += 1;
  }
  return ok;
}
