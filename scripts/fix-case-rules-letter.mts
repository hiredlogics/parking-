/**
 * One-off: rebuild Formal Appeal body from Master Pack rules for a case
 * whose approved PDF only has a thin placeholder (e.g. "sdk").
 *
 * Usage: npx tsx --env-file=.env.local scripts/fix-case-rules-letter.mts CASE-2026-000003
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local without dotenv package
try {
  const envPath = resolve(process.cwd(), ".env.local");
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
} catch {
  // ignore
}

import { getSql } from "../lib/db/pool";
import { ensureSchema } from "../lib/db/schema";
import {
  findCase,
  listCaseDocuments,
  addCaseDocument,
} from "../lib/cases/repo";
import { findCurrentAppeal } from "../lib/appeals/repo";
import {
  buildRulesBasedLetter,
  isAppealBodyTooThin,
} from "../lib/appeals/rulesLetter";
import { renderAppealPdf } from "../services/documents/pdf";
import { getStorageProvider } from "../services/storage";
import { documentBasename } from "../lib/cases/documents";
import type { EvidenceItem } from "../types";

async function main() {
  const publicId = process.argv[2] ?? "CASE-2026-000003";
  await ensureSchema();

  const sql = getSql();
  const found = (await sql.query(
    `SELECT id FROM appeal_cases WHERE public_id = $1 LIMIT 1`,
    [publicId],
  )) as { rows?: Array<{ id: string }> } | Array<{ id: string }>;
  const rows = Array.isArray(found) ? found : (found.rows ?? []);
  const caseId = rows[0]?.id;
  if (!caseId) {
    console.error("Case not found:", publicId);
    process.exit(1);
  }

  const c = await findCase(caseId);
  if (!c?.confirmed) {
    console.error("Case not confirmed:", publicId);
    process.exit(1);
  }

  const docs = await listCaseDocuments(c.id, "EVIDENCE");
  const rules = await buildRulesBasedLetter({
    confirmed: c.confirmed,
    answers: c.adaptiveAnswers,
    evidenceTypes: docs.map((d) => d.evidenceType ?? "other"),
  });

  console.log("keeperSafe:", rules.keeperSafe);
  console.log("routes:", rules.activeRoutes);
  console.log("paragraphs:", rules.matchedParagraphIds);
  console.log("body length:", rules.body.length);
  console.log("--- body preview ---\n", rules.body.slice(0, 800), "\n---");

  if (isAppealBodyTooThin(rules.body)) {
    console.error("Rules letter still too thin — check answers/rules.");
    process.exit(2);
  }

  const appeal = await findCurrentAppeal(c.id);
  if (!appeal) {
    console.error("No appeal row for case");
    process.exit(1);
  }

  const now = new Date().toISOString();
  const paragraphsJson = JSON.stringify(rules.paragraphs);

  await sql.query(
    `UPDATE case_appeals SET
       body = $2,
       paragraphs = $3::jsonb,
       approved_body = $2,
       approved_paragraphs = $3::jsonb,
       updated_at = $4
     WHERE id = $1`,
    [appeal.id, rules.body, paragraphsJson, now],
  );

  await sql.query(
    `UPDATE case_appeal_drafts SET
       body = $2,
       paragraphs = $3::jsonb,
       status = 'READY',
       provider_id = 'rules-engine',
       prompt_version = 'pack-v1'
     WHERE case_id = $1 AND superseded_at IS NULL`,
    [c.id, rules.body, paragraphsJson],
  );

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

  const pdfBytes = await renderAppealPdf({
    pcn: c.confirmed,
    evidence,
    appeal: { paragraphs: rules.paragraphs },
    caseReference: c.publicId,
  });

  const fileName = `${documentBasename(c.pcnNumber, c.vrm, c.publicId)}.pdf`;
  const storage = getStorageProvider();
  const meta = await storage.put({
    fileName,
    mimeType: "application/pdf",
    bytes: pdfBytes,
    namespace: c.id,
  });

  await addCaseDocument({
    caseId: c.id,
    documentType: "GENERATED",
    evidenceType: null,
    storageKey: meta.storageKey,
    storageProvider: storage.id,
    fileName: meta.fileName,
    mimeType: "application/pdf",
    sizeBytes: meta.sizeBytes,
    sha256: meta.sha256,
    sourceDraftId: appeal.sourceDraftId,
    description: "Approved appeal PDF (rules letter refresh)",
    uploadedBy: "system-fix",
  });

  console.log("Updated appeal", appeal.id);
  console.log("New PDF:", meta.storageKey, meta.fileName);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
