/**
 * Post-architecture dump: Extraction → Case Intelligence → grounds →
 * questions → modules → AppealAnalysis for CASE-2026-000031.
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
process.env.FACT_QUESTIONS = "deterministic";

const { getSql } = await import("../lib/db/pool");
const { ensureAdminConfigSeeded } = await import("../lib/config/seedAdminConfig");
const { buildCaseIntelligence } = await import("../lib/cases/caseIntelligence");
const { resolveFactGap } = await import("../lib/facts/gapResolver");
const { deriveKnownFacts, FACT } = await import("../lib/facts/facts");
const { applyDocumentImplications } = await import("../lib/facts/documentImplications");
const { resolveAnswersWithDefaults } = await import("../lib/rules/factDefaults");
const { loadKbCatalog } = await import("../lib/kb/catalog");
const { retrieveKnowledge } = await import("../lib/retrieval/engine");
const { buildAppealAnalysis } = await import("../lib/drafting/appealAnalysis");
const { deterministicQuestion } = await import("../lib/facts/factQuestion");
const { loadFactRegistry } = await import("../lib/config/factRegistry");

await ensureAdminConfigSeeded();
const sql = getSql();

function rowsOf(r: unknown): Record<string, unknown>[] {
  if (Array.isArray(r)) return r as Record<string, unknown>[];
  return ((r as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<
    string,
    unknown
  >[];
}

const found = rowsOf(
  await sql.query(
    `SELECT id, public_id, status, confirmed_json, extraction_json,
            adaptive_answers, questioning_complete,
            document_type, sender_name, parking_operator_name, case_stage
       FROM appeal_cases
      WHERE id = 'case_mufuggam61125e' OR public_id = 'CASE-2026-000031'
      LIMIT 1`,
  ),
);
if (!found[0]) {
  console.log("CASE NOT FOUND");
  process.exit(1);
}
const c = found[0];
const confirmed = c.confirmed_json as Record<string, unknown>;
const extraction = c.extraction_json as Record<string, unknown> | null;
const answers = (c.adaptive_answers as Record<string, unknown>) ?? {};

const beforeQ: Record<string, unknown> = {};
for (const [k, v] of Object.entries(answers)) {
  if (k.startsWith("__askedfact:")) continue;
  if (
    k === "jurisdiction" ||
    k === FACT.REGISTERED_KEEPER ||
    k === FACT.DRIVER_IDENTIFIED ||
    k === FACT.VEHICLE_HIRE_STATUS
  ) {
    beforeQ[k] = v;
  }
}

const { answers: withDefaults } = resolveAnswersWithDefaults(
  confirmed as never,
  beforeQ as never,
  [],
);

const facts = applyDocumentImplications(
  deriveKnownFacts({
    confirmed: confirmed as never,
    answers: withDefaults,
    evidenceTypes: [],
  }),
);

const ci = buildCaseIntelligence({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
  documentUnderstanding: {
    documentType: (c.document_type as never) ?? null,
    senderName: (c.sender_name as string) ?? null,
    parkingOperatorName: (c.parking_operator_name as string) ?? null,
    caseStage: (c.case_stage as never) ?? null,
    serviceDecision:
      ((extraction?.triage as { serviceDecision?: string } | undefined)
        ?.serviceDecision as never) ?? null,
  },
  knownFactsOverride: facts,
});

const gap = await resolveFactGap({
  facts,
  evidenceTypes: [],
  caseIntelligence: ci,
});

const registry = await loadFactRegistry();
const questions = [];
if (gap.gap) {
  const q = deterministicQuestion(gap.gap);
  questions.push({
    factKey: gap.gap.factKey,
    why: gap.gap.reasonCode,
    text: q.text,
    optional: gap.gap.optional,
  });
}
for (const m of gap.outstanding.slice(0, 4)) {
  if (questions.some((x) => x.factKey === m.factKey)) continue;
  const entry = registry.get(m.factKey);
  questions.push({
    factKey: m.factKey,
    why: m.reasonCode,
    text: entry?.label ?? m.factKey,
    optional: m.optional,
  });
}

const catalog = await loadKbCatalog();
const analysis = ci.analysis!;
const retrieval = retrieveKnowledge({
  analysis,
  facts,
  parkingEventDate: confirmed.parking_event_date as string,
  evidenceTypes: [],
  modules: catalog.modules,
  sources: catalog.sources,
  blocks: catalog.blocks,
});

const appealAnalysis = buildAppealAnalysis({
  intelligence: ci,
  modules: retrieval.modules,
  sources: retrieval.sources,
});

const appeals = rowsOf(
  await sql.query(
    `SELECT id, status, validation_json, left(coalesce(body,''), 400) AS body
       FROM case_appeals WHERE case_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [c.id],
  ),
);

const out = {
  case: { id: c.id, publicId: c.public_id, status: c.status },
  "1_extraction": {
    raw: (extraction as { raw?: unknown } | null)?.raw ?? null,
    confirmed,
  },
  "2_case_intelligence": {
    supported_grounds: ci.supported_grounds,
    rejected_grounds: ci.rejected_grounds,
    unresolved_grounds: ci.unresolved_grounds,
    possible_grounds: ci.possible_grounds.map((g) => ({
      code: g.code,
      status: g.status,
      signal: g.signal,
    })),
    pofa_analysis: ci.pofa_analysis,
    code_version: ci.code_version,
    missing_material_facts: ci.missing_material_facts,
    prohibited_claims_count: ci.prohibited_claims?.length ?? 0,
  },
  "3_supported_rejected": {
    supported: ci.supported_grounds.map((g) => g.code),
    rejected: ci.rejected_grounds.map((g) => g.code),
    unresolved: ci.unresolved_grounds.map((g) => g.code),
  },
  "4_missing_facts": ci.missing_material_facts,
  "5_questions": {
    will_ask: questions,
    gap_complete: gap.complete,
    note: "anpr_images_on_notice must not appear when entry/exit exist",
  },
  "6_retrieved_modules": retrieval.modules.map((m) => ({
    moduleId: m.moduleId,
    routeFamily: m.routeFamily,
  })),
  "7_drafting_input_AppealAnalysis": appealAnalysis,
  "8_validation":
    appeals.length === 0
      ? { note: "No appeal yet — Validation has not run", case_status: c.status }
      : {
          appealId: appeals[0].id,
          status: appeals[0].status,
          body_preview: appeals[0].body,
          validation_json: appeals[0].validation_json,
        },
};

const outPath = path.join(root, "scripts", "_ci-authority-euro.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
console.log("\nWROTE", outPath);
process.exit(0);
