/**
 * Repair CASE-2026-000003 only:
 * - clear stale HIRE_OR_COMPANY_VEHICLE outstanding
 * - set PAYMENT primary route from rules letter
 * - refresh draft without hire block detail
 * - soft-delete duplicate GENERATED PDFs (keep latest)
 * - regenerate one rules-based PDF
 *
 * Usage: npx tsx scripts/fix-case-000003.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
}

import { getSql } from "../lib/db/pool";
import { ensureSchema } from "../lib/db/schema";
import {
  findCase,
  listCaseDocuments,
  addCaseDocument,
  updateCaseRoutes,
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
  const publicId = "CASE-2026-000003";
  await ensureSchema();
  const sql = getSql();

  const found = (await sql.query(
    `SELECT id FROM appeal_cases WHERE public_id = $1 LIMIT 1`,
    [publicId],
  )) as { rows?: Array<{ id: string }> } | Array<{ id: string }>;
  const rows = Array.isArray(found) ? found : (found.rows ?? []);
  const caseId = rows[0]?.id;
  if (!caseId) {
    console.error("not found");
    process.exit(1);
  }

  const c = await findCase(caseId);
  if (!c?.confirmed) {
    console.error("not confirmed");
    process.exit(1);
  }

  const docs = await listCaseDocuments(c.id, "EVIDENCE");
  const rules = await buildRulesBasedLetter({
    confirmed: c.confirmed,
    answers: c.adaptiveAnswers,
    evidenceTypes: docs.map((d) => d.evidenceType ?? "other"),
  });

  if (isAppealBodyTooThin(rules.body)) {
    console.error("rules letter still thin");
    process.exit(2);
  }

  console.log("routes:", rules.activeRoutes);
  console.log("paragraphs:", rules.matchedParagraphIds);

  await updateCaseRoutes(c.id, {
    primaryRoute: "PAYMENT",
    secondaryRoutes: rules.activeRoutes.includes("KEEPER_ROUTE")
      ? ["POFA"]
      : [],
    missingFacts: [],
    pofaRoute: null,
  });

  const paragraphsJson = JSON.stringify(rules.paragraphs);
  const now = new Date().toISOString();

  // Clear hire block copy on live draft; keep one READY draft body.
  await sql.query(
    `UPDATE case_appeal_drafts SET
       body = $2,
       paragraphs = $3::jsonb,
       status = 'READY',
       primary_route = 'PAYMENT',
       secondary_routes = $4::jsonb,
       provider_id = 'rules-engine',
       prompt_version = 'pack-v1',
       block_reason = NULL,
       block_detail = NULL
     WHERE case_id = $1 AND superseded_at IS NULL`,
    [
      c.id,
      rules.body,
      paragraphsJson,
      JSON.stringify(
        rules.activeRoutes.includes("KEEPER_ROUTE") ? ["POFA"] : [],
      ),
    ],
  );

  const appeal = await findCurrentAppeal(c.id);
  if (appeal) {
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
  }

  // Soft-delete all but keep regenerating a single fresh PDF.
  await sql.query(
    `UPDATE case_documents_meta
        SET deleted_at = $2
      WHERE case_id = $1
        AND document_type = 'GENERATED'
        AND deleted_at IS NULL`,
    [c.id, now],
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
    sourceDraftId: appeal?.sourceDraftId ?? null,
    description: "Approved appeal PDF",
    uploadedBy: "system-fix",
  });

  console.log("Fixed", publicId);
  console.log("One GENERATED PDF:", meta.fileName);
  console.log("Outstanding cleared; primary route PAYMENT");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
