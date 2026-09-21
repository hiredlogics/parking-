/**
 * One-shot: send branded APPEAL_READY + PDF attachments for a case.
 * Usage: npx tsx scripts/send-appeal-ready.ts case_xxx
 */
import fs from "fs";
import path from "path";

// Load .env.local into process.env before app imports.
const envPath = path.join(process.cwd(), ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  const key = line.slice(0, i).trim();
  let v = line.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = v;
}

const caseId = process.argv[2] || "case_muaxwox287fuay";

async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const nodemailer = (await import("nodemailer")).default;
  const { buildAppealReadyEmail } = await import(
    "../lib/email/templates/appealReady.ts"
  );
  const { getStorageProvider } = await import("../services/storage/index.ts");

  const sql = neon(process.env.DATABASE_URL!);

  const cases = await sql`
    SELECT c.id, c.public_id, c.pcn_number, c.operator_name,
           cl.email, cl.name
    FROM appeal_cases c
    JOIN clients cl ON cl.id = c.customer_id
    WHERE c.id = ${caseId}
  `;
  const c = cases[0];
  if (!c?.email) {
    console.error("Case/customer not found");
    process.exit(1);
  }

  const docs = await sql`
    SELECT id, document_type, storage_key, file_name, mime_type
    FROM case_documents_meta
    WHERE case_id = ${caseId}
      AND document_type IN ('GENERATED', 'INSTRUCTIONS')
      AND deleted_at IS NULL
    ORDER BY uploaded_at ASC
  `;

  const storage = getStorageProvider();
  const attachments: Array<{
    filename: string;
    content: Buffer;
    contentType: string;
  }> = [];

  for (const d of docs) {
    if (!d.storage_key) continue;
    const obj = await storage.get(d.storage_key as string);
    if (!obj?.bytes?.length) {
      console.warn("Missing bytes for", d.storage_key);
      continue;
    }
    const fallback =
      d.document_type === "INSTRUCTIONS"
        ? "Submission-Instructions.pdf"
        : "Final-Appeal.pdf";
    attachments.push({
      filename: String(d.file_name || fallback),
      content: Buffer.from(obj.bytes),
      contentType: "application/pdf",
    });
  }

  console.log(
    `Case ${caseId}: ${attachments.length} PDF(s) → ${c.email}`,
  );

  const branded = buildAppealReadyEmail({
    customerName: c.name as string,
    caseReference: c.public_id as string,
    pcnNumber: c.pcn_number as string,
    operatorName: c.operator_name as string,
    portalUrl: null,
    hasAttachments: attachments.length > 0,
  });

  const user = process.env.SMTP_USER!.trim();
  const pass = process.env.SMTP_PASSWORD!.replace(/\s+/g, "");
  const from = process.env.EMAIL_FROM_ADDRESS!.trim();

  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user, pass },
  });

  const info = await transport.sendMail({
    from: `${process.env.EMAIL_FROM_NAME || "Parking Appeals Group"} <${from}>`,
    to: c.email as string,
    subject: branded.subject,
    text: branded.text,
    html: branded.html,
    attachments,
  });

  console.log("SENT", info.messageId);
  console.log("attachments:", attachments.map((a) => a.filename).join(", "));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
