/**
 * Show the post-AI-analysis object for Euro Car Parks — BEFORE customer
 * questions and BEFORE appeal generation.
 *
 * Uses the same Euro Car Parks notice fields the production corpus carries.
 * If a real uploaded case exists in the DB, prefer that.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  process.env[m[1].trim()] = v;
}

const { getSql } = await import("../lib/db/pool");
const { classifyAllegation } = await import("../lib/reasoning/allegation");
const { evaluateIssues } = await import("../lib/engine/issueEngine");
const { deriveKnownFacts, FACT } = await import("../lib/facts/facts");
const { buildCaseIntelligence } = await import("../lib/cases/caseIntelligence");
const { resolveAnswersWithDefaults } = await import("../lib/rules/factDefaults");
const { ensureAdminConfigSeeded } = await import("../lib/config/seedAdminConfig");
const { runDocumentTriage } = await import("../lib/triage/runTriage");

await ensureAdminConfigSeeded();

console.log("\n=== 1. Look for a real Euro Car Parks case in the DB ===");
const sql = getSql();
const found = await sql.query(
  `SELECT id, public_id, status,
          confirmed_json, extraction_json, case_intelligence_json,
          adaptive_answers, questioning_complete,
          document_type, sender_name, parking_operator_name, case_stage
     FROM appeal_cases
    WHERE LOWER(COALESCE(confirmed_json->>'operator_name','')) LIKE '%euro%'
       OR LOWER(COALESCE(extraction_json->'raw'->>'operator_name','')) LIKE '%euro%'
       OR LOWER(COALESCE(parking_operator_name,'')) LIKE '%euro%'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 3`,
);
const rows = Array.isArray(found) ? found : ((found as { rows?: unknown[] }).rows ?? []);
console.log("matching cases:", rows.length);

let extractionOutput: unknown = null;
let source = "fixture-reconstruction";

if (rows[0]) {
  const r = rows[0] as Record<string, unknown>;
  source = `database case ${r.id} / ${r.public_id}`;
  extractionOutput = {
    source,
    caseId: r.id,
    publicId: r.public_id,
    status: r.status,
    documentUnderstanding: {
      documentType: r.document_type,
      senderName: r.sender_name,
      parkingOperatorName: r.parking_operator_name,
      caseStage: r.case_stage,
    },
    extraction: r.extraction_json,
    confirmed: r.confirmed_json,
    caseIntelligence: r.case_intelligence_json,
    adaptiveAnswersBeforeQuestions: r.adaptive_answers,
    questioningComplete: r.questioning_complete,
  };
  console.log(JSON.stringify(extractionOutput, null, 2));
} else {
  console.log("No live Euro Car Parks upload found in DB — reconstructing from the known production notice fields + pipeline stages that run BEFORE questions.");
}

/** Known Euro Car Parks notice used in production fixtures / client tests. */
const euroRaw = {
  operator_name: "Euro Car Parks",
  pcn_number: "88812545842",
  vrm: "KJ19KYN",
  parking_location: "Sainsburys Willesden Green",
  parking_event_date: "2026-08-29",
  notice_issue_date: "2026-09-04",
  entry_time: "13:05",
  exit_time: "14:14",
  total_recorded_duration: 69,
  charge_amount: 100,
  alleged_breach: "A voucher/receipt was not validated at the kiosk",
  notice_route: "POSTAL",
  uk_jurisdiction: "ENGLAND_WALES",
  case_stage: "INITIAL_OPERATOR_APPEAL",
};

console.log("\n=== 2. AI extraction output shape (what upload/extract returns) ===");
const extractionResultShape = {
  raw: euroRaw,
  confidence: {
    operator_name: 0.9,
    pcn_number: 0.9,
    vrm: 0.9,
    parking_location: 0.85,
    parking_event_date: 0.9,
    notice_issue_date: 0.9,
    entry_time: 0.85,
    exit_time: 0.85,
    total_recorded_duration: 0.8,
    charge_amount: 0.9,
    alleged_breach: 0.85,
    notice_route: 0.8,
  },
  warnings: [] as string[],
  provider: "openai-extraction (when OPENAI_API_KEY set)",
  note: "AI is instructed to EXTRACT fields only — it does not output issue codes, grounds, or legal conclusions.",
};
console.log(JSON.stringify(extractionResultShape, null, 2));

console.log("\n=== 3. Immediately after extraction — BEFORE customer questions ===");
const confirmed = { ...euroRaw, confirmedAt: "2026-09-24T00:00:00.000Z" };
const allegation = classifyAllegation(euroRaw.alleged_breach);

// Defaults only (keeper/driver) — what confirm may add before fact-gap
const { answers } = resolveAnswersWithDefaults(confirmed as never, {}, []);
const facts = deriveKnownFacts({
  confirmed: confirmed as never,
  answers,
  evidenceTypes: [],
});
const issues = await evaluateIssues({ facts, evidenceTypes: [] });
const intelligence = buildCaseIntelligence({
  confirmed: confirmed as never,
  answers: {},
  evidenceTypes: [],
  documentUnderstanding: {
    documentType: "NTK_POSTAL",
    senderName: "Euro Car Parks",
    parkingOperatorName: "Euro Car Parks",
    caseStage: "INITIAL_OPERATOR_APPEAL",
    serviceDecision: "OK",
  },
});

const beforeQuestions = {
  stage: "AFTER_EXTRACTION_AND_NOTICE_FIELDS — BEFORE_CUSTOMER_FACT_GAP_QUESTIONS — BEFORE_APPEAL_GENERATION",
  extractedNoticeFields: euroRaw,
  allegationClassifier_NOT_AI: {
    category: allegation.category,
    routes: allegation.routes,
    matched: allegation.matched,
    how: "regex on alleged_breach text — not vision/LLM issue spotting",
  },
  issueEngine_NOT_AI: {
    activeIssues: issues.activeIssues.map((i) => ({
      code: i.code,
      label: i.label,
    })),
    missingFactsItWouldAsk: issues.missingFacts.slice(0, 8).map((m) => ({
      factKey: m.factKey,
      issueCode: m.issueCode,
      reasonCode: m.reasonCode,
    })),
    how: "admin applicability_json + allegation tags — not AI document analysis",
  },
  caseIntelligence_deterministic: {
    documentUnderstanding: intelligence.documentUnderstanding,
    identifiedIssues: intelligence.identifiedIssues,
    technicalFindings: intelligence.technicalFindings,
    analysisPrimaryRoute: intelligence.analysis?.primaryRoute ?? null,
    analysisPofa: intelligence.analysis?.pofa
      ? {
          timingStatus: intelligence.analysis.pofa.timingStatus,
          daysLate: intelligence.analysis.pofa.daysLate,
          paragraph: intelligence.analysis.pofa.paragraph,
        }
      : null,
    missingFacts: intelligence.missingFacts,
    warnings: intelligence.warnings,
  },
  whatAIDidNotProduce: [
    "No issue codes (PAYMENT_KEYING etc.) from the vision model",
    "No defect list from reading the PDF as a lawyer",
    "No decision that this is payment/keying vs PoFA",
    "Customer questions are scheduled next by the issue engine, not by AI",
  ],
};

console.log(JSON.stringify(beforeQuestions, null, 2));

console.log("\n=== SOURCE ===");
console.log(source);
console.log(
  "\nIf the client uploaded a real file, the extraction.raw object is the AI field dump; issue codes above are NOT from that AI call.",
);
