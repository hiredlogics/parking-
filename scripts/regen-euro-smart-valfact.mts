/**
 * Regenerate Euro + Smart Parking after VAL-FACT derived-legal fix.
 * Reports AppealAnalysis, Draft, Validation, Fact provenance trace.
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

const { ensureAdminConfigSeeded } = await import("../lib/config/seedAdminConfig");
const { buildCaseIntelligence } = await import("../lib/cases/caseIntelligence");
const { applyDocumentImplications } = await import("../lib/facts/documentImplications");
const { deriveKnownFacts } = await import("../lib/facts/facts");
const { resolveAnswersWithDefaults } = await import("../lib/rules/factDefaults");
const { loadKbCatalog } = await import("../lib/kb/catalog");
const { retrieveKnowledge } = await import("../lib/retrieval/engine");
const { buildAppealAnalysis } = await import("../lib/drafting/appealAnalysis");
const { generateValidatedAppeal } = await import("../lib/generation/engine");
const { derivedLegalFactsFromPofa } = await import("../lib/analysis/derivedLegalFacts");
const { factClassFromSource } = await import("../lib/facts/factClasses");

await ensureAdminConfigSeeded();

type CaseSpec = {
  id: string;
  confirmed: Record<string, unknown>;
  answers: Record<string, unknown>;
};

const CASES: CaseSpec[] = [
  {
    id: "euro-car-parks",
    confirmed: {
      operator_name: "Euro Car Parks",
      pcn_number: "88812303053",
      vrm: "KS58OPW",
      vehicle_make: "FIAT",
      parking_location: "Sainsburys - Harringay",
      parking_event_date: "2026-07-17",
      notice_issue_date: "2026-07-30",
      notice_route: "POSTAL",
      entry_time: "13:39",
      exit_time: "17:06",
      total_recorded_duration: 207,
      charge_amount: 100,
      alleged_breach:
        "Your vehicle has overstayed the maximum time period allowed",
      uk_jurisdiction: "ENGLAND_WALES",
      case_stage: "INITIAL_OPERATOR_APPEAL",
      confirmedAt: new Date().toISOString(),
    },
    answers: {
      jurisdiction: "ENGLAND_WALES",
      registered_keeper: "YES",
      driver_identified: "NO",
    },
  },
  {
    id: "smart-parking",
    confirmed: {
      operator_name: "Smart Parking Ltd",
      pcn_number: "SP62712518",
      vrm: "FD18BOF",
      parking_location: "B&M Chatham - ME4 4HA",
      parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27",
      notice_route: "POSTAL",
      entry_time: "19:06",
      exit_time: "20:41",
      total_recorded_duration: 95,
      charge_amount: 90,
      alleged_breach: null,
      uk_jurisdiction: "ENGLAND_WALES",
      case_stage: "INITIAL_OPERATOR_APPEAL",
      confirmedAt: new Date().toISOString(),
    },
    answers: {
      jurisdiction: "ENGLAND_WALES",
      registered_keeper: "YES",
      driver_identified: "NO",
    },
  },
];

const reports = [];

for (const c of CASES) {
  console.log("\n" + "#".repeat(72));
  console.log(`# ${c.id.toUpperCase()}`);
  console.log("#".repeat(72));

  const { answers: withDefaults } = resolveAnswersWithDefaults(
    c.confirmed as never,
    c.answers as never,
    [],
  );
  let facts = deriveKnownFacts({
    confirmed: c.confirmed as never,
    answers: withDefaults,
    evidenceTypes: [],
  });
  facts = applyDocumentImplications(facts);

  const intelligence = buildCaseIntelligence({
    confirmed: c.confirmed as never,
    answers: withDefaults,
    evidenceTypes: [],
    documentUnderstanding: {
      documentType: "NOTICE_TO_KEEPER",
      senderName: String(c.confirmed.operator_name),
      parkingOperatorName: String(c.confirmed.operator_name),
      caseStage: "INITIAL_OPERATOR_APPEAL",
      serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
    },
    knownFactsOverride: facts,
  });

  const catalog = await loadKbCatalog();
  const retrieval = retrieveKnowledge({
    analysis: intelligence.analysis!,
    facts,
    parkingEventDate: c.confirmed.parking_event_date as string,
    evidenceTypes: [],
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });

  const appealAnalysis = buildAppealAnalysis({
    intelligence,
    modules: retrieval.modules,
    sources: retrieval.sources,
  });

  const derived = derivedLegalFactsFromPofa(intelligence.pofa_analysis!, {
    codeVersion: intelligence.code_version,
  });

  const provenanceTrace = {
    document_facts: intelligence.analysis!.verifiedFacts
      .filter((f) => factClassFromSource(f.source) === "DOCUMENT_FACT")
      .map((f) => ({ field: f.field, value: f.value, class: "DOCUMENT_FACT" })),
    customer_facts: intelligence.analysis!.verifiedFacts
      .filter((f) => factClassFromSource(f.source) === "CUSTOMER_FACT")
      .map((f) => ({ field: f.field, value: f.value, class: "CUSTOMER_FACT" })),
    derived_legal_facts: derived.records.map((r) => ({
      field: r.field,
      value: r.value,
      class: "DERIVED_LEGAL_FACT",
      rule: r.rule,
      calculation: r.calculation,
      inputs: r.inputs,
    })),
  };

  const result = await generateValidatedAppeal({
    caseId: null,
    confirmed: c.confirmed as never,
    answers: withDefaults as never,
    evidenceTypes: [],
    analysis: intelligence.analysis,
    intelligence,
  });

  const last = result.attempts?.[result.attempts.length - 1];
  const report = {
    case: c.id,
    appealAnalysis: {
      primary_ground: appealAnalysis.primary_ground,
      secondary_grounds: appealAnalysis.secondary_grounds,
      pofa: appealAnalysis.pofa,
      code_version: appealAnalysis.code_version,
      knowledge_modules: appealAnalysis.knowledge_modules.map((m) => m.moduleId),
    },
    draft: {
      status: result.status,
      body: result.body,
    },
    validation: {
      status: last?.validation?.status ?? null,
      blocking: (last?.validation?.issues ?? [])
        .filter((i: { severity: string }) => i.severity === "BLOCKING")
        .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`),
      all: (last?.validation?.issues ?? []).map(
        (i: { severity: string; code: string; message: string }) =>
          `${i.severity} ${i.code}: ${i.message}`,
      ),
    },
    fact_provenance_trace: provenanceTrace,
  };
  reports.push(report);

  console.log("\n--- AppealAnalysis ---");
  console.log(JSON.stringify(report.appealAnalysis, null, 2));
  console.log("\n--- Validation ---");
  console.log(JSON.stringify(report.validation, null, 2));
  console.log("\n--- Fact provenance (derived legal) ---");
  console.log(JSON.stringify(provenanceTrace.derived_legal_facts, null, 2));
  console.log("\n--- Draft ---");
  console.log(result.body ?? "(empty)");
}

const out = path.join(root, "scripts", "_val-fact-regen-report.json");
fs.writeFileSync(out, JSON.stringify(reports, null, 2));
console.log("\nWrote", out);
process.exit(0);
