/**
 * Branded customer email bodies for APPEAL_READY.
 * Inline CSS for Gmail/Outlook compatibility — no external assets.
 */

export interface AppealReadyEmailContent {
  subject: string;
  text: string;
  html: string;
}

export interface AppealReadyEmailVars {
  customerName?: string | null;
  caseReference?: string | null;
  pcnNumber?: string | null;
  operatorName?: string | null;
  /** Absolute portal URL when APP_URL is configured; omit localhost. */
  portalUrl?: string | null;
  hasAttachments: boolean;
}

const PINK = "#EC1573";
const TEXT = "#111827";
const MUTE = "#6B7280";
const BORDER = "#E5E7EB";
const CANVAS = "#F5F5F7";
const PALE = "#FDF3F7";

export function buildAppealReadyEmail(
  vars: AppealReadyEmailVars,
): AppealReadyEmailContent {
  const name = (vars.customerName ?? "").trim() || "there";
  const ref = (vars.caseReference ?? "").trim();
  const pcn = (vars.pcnNumber ?? "").trim();
  const operator = (vars.operatorName ?? "").trim();
  const portal = (vars.portalUrl ?? "").trim();
  const showPortal =
    portal.length > 0 &&
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(portal);

  const subject = pcn
    ? `Your parking appeal is ready — ${pcn}`
    : "Your parking appeal is ready";

  const detailLines = [
    ref ? `Case reference: ${ref}` : null,
    pcn ? `PCN: ${pcn}` : null,
    operator ? `Operator: ${operator}` : null,
  ].filter(Boolean) as string[];

  const textParts = [
    `Hi ${name},`,
    "",
    "Your personalised parking appeal is ready.",
    "",
    ...(detailLines.length ? [...detailLines, ""] : []),
    vars.hasAttachments
      ? "Attached to this email:"
      : "Your documents are ready in your account:",
    vars.hasAttachments
      ? "- Final Appeal letter (PDF)"
      : "- Final Appeal letter",
    vars.hasAttachments
      ? "- Submission instructions (PDF)"
      : "- Submission instructions",
    "",
    "Next steps:",
    "1. Open the Final Appeal PDF and check your details.",
    "2. Follow the submission instructions to send it to the parking company.",
    "3. Keep a copy for your records.",
    "",
    ...(showPortal
      ? [`You can also view your case here: ${portal}`, ""]
      : []),
    "Parking Appeals Group",
    "https://parkingappeals.group",
  ];

  const detailsHtml = detailLines.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">
        ${detailLines
          .map((line) => {
            const [label, ...rest] = line.split(": ");
            const value = rest.join(": ");
            return `<tr>
              <td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:13px;color:${MUTE};">${escapeHtml(label ?? "")}</td>
              <td style="padding:8px 0;border-bottom:1px solid ${BORDER};font-size:13px;font-weight:600;color:${TEXT};text-align:right;">${escapeHtml(value)}</td>
            </tr>`;
          })
          .join("")}
      </table>`
    : "";

  const attachHtml = vars.hasAttachments
    ? `<div style="margin:0 0 24px;padding:16px 18px;background:${PALE};border-radius:12px;">
        <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${TEXT};">Attached PDFs</p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:${MUTE};">
          • Final Appeal letter<br/>
          • Submission instructions
        </p>
      </div>`
    : "";

  const portalHtml = showPortal
    ? `<p style="margin:0 0 8px;text-align:center;">
        <a href="${escapeAttr(portal)}" style="display:inline-block;background:${PINK};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:14px 28px;border-radius:10px;">
          Open my case
        </a>
      </p>
      <p style="margin:0 0 24px;text-align:center;font-size:12px;color:${MUTE};">Or copy: ${escapeHtml(portal)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${TEXT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BORDER};">
          <tr>
            <td style="background:${PINK};padding:22px 28px;">
              <p style="margin:0;font-size:22px;font-weight:800;letter-spacing:-0.02em;color:#ffffff;line-height:1;">
                <span style="color:#ffffff;">P</span><span style="opacity:0.95;">A</span>
                <span style="display:inline-block;margin-left:10px;vertical-align:middle;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700;">
                  Parking Appeals Group
                </span>
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 28px 8px;">
              <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;font-weight:700;color:${TEXT};">
                Your appeal is ready
              </h1>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.55;color:${MUTE};">
                Hi ${escapeHtml(name)}, your personalised parking appeal has been prepared from the details you provided.
              </p>
              ${detailsHtml}
              ${attachHtml}
              <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${TEXT};">What to do next</p>
              <ol style="margin:0 0 24px;padding-left:20px;font-size:14px;line-height:1.7;color:${MUTE};">
                <li>Open the Final Appeal PDF and check your details.</li>
                <li>Follow the submission instructions to send it to the parking company.</li>
                <li>Keep a copy for your records.</li>
              </ol>
              ${portalHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${BORDER};">
              <p style="margin:0;font-size:12px;line-height:1.5;color:${MUTE};">
                Parking Appeals Group<br/>
                This email was sent because you completed an appeal with us.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text: textParts.join("\n"), html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}
