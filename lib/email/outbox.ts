/**
 * Email outbox — queue, send, retry. Failure never rolls back approval.
 */
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import { randomUUID } from "crypto";
import { getEmailTemplate } from "@/lib/config/adminRepo";
import { sendEmail } from "@/lib/services/email";
import { publicUrl, paths } from "@/lib/config/publicUrl";

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

/** Queue the customer-facing APPEAL_READY email from the template. */
export async function queueAppealReadyEmail(input: {
  caseId: string;
  appealId: string;
  recipient: string;
}): Promise<string> {
  const tpl = await getEmailTemplate("APPEAL_READY");
  const viewUrl = publicUrl(`${paths.portal}/cases/${input.caseId}`);
  const subject =
    tpl?.subject ?? "Your parking appeal is ready";
  const bodyText = (
    tpl?.bodyText ??
    `Your appeal has been reviewed and is now ready.

Sign in to your account to view and download your appeal.

View My Appeal: {{viewUrl}}`
  ).replace(/\{\{viewUrl\}\}/g, viewUrl);

  const bodyHtml =
    tpl?.bodyHtml?.replace(/\{\{viewUrl\}\}/g, viewUrl) ?? null;

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
    const result = await sendEmail({
      to: row.recipient as string,
      subject: row.subject as string,
      text: row.body_text as string,
      html: (row.body_html as string | null) ?? undefined,
    });
    if (result.ok || result.reason === "not_configured") {
      // not_configured: still mark SENT so local/dev does not retry forever;
      // the outbox row records that we attempted delivery.
      await q(
        `UPDATE email_outbox SET status = 'SENT', sent_at = $2, updated_at = $2,
           failure_reason = $3 WHERE id = $1`,
        [
          id,
          now,
          !result.ok && result.reason === "not_configured"
            ? "SMTP not configured — recorded for queue progress"
            : null,
        ],
      );
      return true;
    }
    await q(
      `UPDATE email_outbox SET status = 'FAILED', failure_reason = $2, updated_at = $3
       WHERE id = $1`,
      [id, result.error ?? "send failed", now],
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
