import nodemailer, { type Transporter } from "nodemailer";

/**
 * EmailService — thin nodemailer wrapper.
 *
 * Reads credentials from the SMTP_* env vars only. When none are set
 * (or placeholders like your-gmail@gmail.com remain), returns
 * `{ ok: false, reason: "not_configured" }`.
 */

export interface EmailAttachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export type SendEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "not_configured" | "send_failed"; error?: string };

const PLACEHOLDER_RE =
  /your-?gmail|example\.com|noreply@example|changeme|placeholder/i;

function readConfig(): {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromAddress: string;
} | null {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  // Gmail app passwords are often pasted with spaces — strip them.
  const pass = process.env.SMTP_PASSWORD?.replace(/\s+/g, "").trim();
  const fromAddress = process.env.EMAIL_FROM_ADDRESS?.trim();
  if (!host || !user || !pass || !fromAddress) return null;
  if (PLACEHOLDER_RE.test(user) || PLACEHOLDER_RE.test(fromAddress)) {
    console.warn(
      "[EmailService] SMTP_USER / EMAIL_FROM_ADDRESS still look like placeholders — emails will not send.",
    );
    return null;
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  const secure = String(process.env.SMTP_SECURE ?? "").toLowerCase() === "true";
  const fromName = process.env.EMAIL_FROM_NAME?.trim() || "Parking Appeals Group";
  return { host, port, secure, user, pass, fromName, fromAddress };
}

let cachedTransport: Transporter | null = null;
let cachedKey: string | null = null;

function getTransport(cfg: NonNullable<ReturnType<typeof readConfig>>): Transporter {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (cachedTransport && cachedKey === key) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  cachedKey = key;
  return cachedTransport;
}

export function isEmailConfigured(): boolean {
  return readConfig() !== null;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const cfg = readConfig();
  if (!cfg) return { ok: false, reason: "not_configured" };
  try {
    const transport = getTransport(cfg);
    const info = await transport.sendMail({
      from: `${cfg.fromName} <${cfg.fromAddress}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      attachments: input.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
        contentType: a.contentType,
      })),
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error("[EmailService] send failed:", err);
    return {
      ok: false,
      reason: "send_failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
