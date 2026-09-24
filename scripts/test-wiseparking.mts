/**
 * WiseParking notice walkthrough — CI path + V1 issue-engine contrast.
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
const { resolveFactGap } = await import("../lib/facts/gapResolver");
const { evaluateIssues } = await import("../lib/engine/issueEngine");
const { loadKbCatalog } = await import("../lib/kb/catalog");
const { retrieveKnowledge } = await import("../lib/retrieval/engine");
const { buildAppealAnalysis } = await import("../lib/drafting/appealAnalysis");
const { generateValidatedAppeal } = await import("../lib/generation/engine");
const { derivedLegalFactsFromPofa } = await import("../lib/analysis/derivedLegalFacts");
const { factClassFromSource } = await import("../lib/facts/factClasses");

await ensureAdminConfigSeeded();

const confirmed = {
  operator_name: "Wise Parking Ltd",
  pcn_number: "AP539112",
  vrm: "LX71UNS",
  vehicle_make: "SEAT",
  vehicle_model: "Ateca",
  vehicle_colour: "Grey",
  parking_location: "Queen Elizabeth Hospital - Car Park 1, London, SE18 4QH",
  parking_event_date: "2026-09-08",
  notice_issue_date: "2026-09-14",
  notice_route: "POSTAL",
  entry_time: "09:07",
  exit_time: "16:28",
  total_recorded_duration: 441,
  charge_amount: 80,
  alleged_breach: "No Permit",
  uk_jurisdiction: "ENGLAND_WALES",
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: new Date().toISOString(),
};

const answers = {
  jurisdiction: "ENGLAND_WALES",
  registered_keeper: "YES",
  driver_identified: "NO",
};

const { answers: withDefaults } = resolveAnswersWithDefaults(
  confirmed as never,
  answers as never,
  [],
);

let facts = deriveKnownFacts({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
});
facts = applyDocumentImplications(facts);

const intelligence = buildCaseIntelligence({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
  documentUnderstanding: {
    documentType: "NOTICE_TO_KEEPER",
    senderName: "Wise Parking Ltd",
    parkingOperatorName: "Wise Parking Ltd",
    caseStage: "INITIAL_OPERATOR_APPEAL",
    serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
  },
  knownFactsOverride: facts,
});

const ciGap = await resolveFactGap({
  facts,
  evidenceTypes: [],
  caseIntelligence: intelligence,
});

const v1Eval = await evaluateIssues({
  facts,
  evidenceTypes: [],
});
const v1Gap = await resolveFactGap({
  facts,
  evidenceTypes: [],
  evaluation: v1Eval,
  // deliberately omit caseIntelligence → V1 path
});

const catalog = await loadKbCatalog();
const retrieval = retrieveKnowledge({
  analysis: intelligence.analysis!,
  facts,
  parkingEventDate: confirmed.parking_event_date,
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

console.log("\n=== PoFA (CI) ===");
console.log(
  JSON.stringify(
    {
      paragraph: intelligence.pofa_analysis?.paragraph,
      timingStatus: intelligence.pofa_analysis?.timingStatus,
      deadline: intelligence.pofa_analysis?.deadline,
      noticeGivenDate: intelligence.pofa_analysis?.noticeGivenDate,
      daysLate: intelligence.pofa_analysis?.daysLate,
      reasons: intelligence.pofa_analysis?.reasons,
    },
    null,
    2,
  ),
);

console.log("\n=== CI path — chips / questions (current local architecture) ===");
console.log(
  JSON.stringify(
    {
      supported: intelligence.supported_grounds?.map((g) => g.code),
      unresolved: intelligence.unresolved_grounds?.map((g) => g.code),
      possible: intelligence.possible_grounds?.map((g) => ({
        code: g.code,
        status: g.status,
        signal: g.signal,
      })),
      activeIssues_tags: ciGap.activeIssues,
      missing_material_facts: intelligence.missing_material_facts,
      next_question: ciGap.gap
        ? {
            factKey: ciGap.gap.factKey,
            label: ciGap.gap.label,
            issueLabel: ciGap.gap.issueLabel,
          }
        : null,
      gap_complete: ciGap.complete,
    },
    null,
    2,
  ),
);

console.log("\n=== V1 issue-engine path — chips / questions (what screenshots match) ===");
console.log(
  JSON.stringify(
    {
      activeIssues: v1Gap.activeIssues,
      outstanding_facts: v1Gap.outstanding.map((m) => ({
        factKey: m.factKey,
        issueCode: m.issueCode,
        reasonCode: m.reasonCode,
      })),
      next_question: v1Gap.gap
        ? {
            factKey: v1Gap.gap.factKey,
            label: v1Gap.gap.label,
            issueLabel: v1Gap.gap.issueLabel,
          }
        : null,
    },
    null,
    2,
  ),
);

console.log("\n=== Generating appeal (CI path) ===");
const result = await generateValidatedAppeal({
  caseId: null,
  confirmed: confirmed as never,
  answers: withDefaults as never,
  evidenceTypes: [],
  analysis: intelligence.analysis,
  intelligence,
});

const last = result.attempts?.[result.attempts.length - 1];
const report = {
  case: "wise-parking",
  notice: {
    operator: "Wise Parking Ltd",
    pcn: "AP539112",
    vrm: "LX71UNS",
    event: "2026-09-08",
    notice_issue: "2026-09-14",
    entry: "09:07",
    exit: "16:28",
    duration_mins: 441,
    allegation: "No Permit",
    location: confirmed.parking_location,
  },
  appealAnalysis: {
    primary_ground: appealAnalysis.primary_ground,
    secondary_grounds: appealAnalysis.secondary_grounds,
    pofa: appealAnalysis.pofa,
    code_version: appealAnalysis.code_version,
    knowledge_modules: appealAnalysis.knowledge_modules.map((m) => m.moduleId),
  },
  ci_vs_v1: {
    ci_tags: ciGap.activeIssues,
    ci_next_question: ciGap.gap?.factKey ?? null,
    v1_tags: v1Gap.activeIssues,
    v1_next_question: v1Gap.gap
      ? { factKey: v1Gap.gap.factKey, issueLabel: v1Gap.gap.issueLabel }
      : null,
  },
  draft: { status: result.status, body: result.body },
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

console.log("\n--- AppealAnalysis ---");
console.log(JSON.stringify(report.appealAnalysis, null, 2));
console.log("\n--- Validation ---");
console.log(JSON.stringify(report.validation, null, 2));
console.log("\n--- Fact provenance (derived) ---");
console.log(JSON.stringify(provenanceTrace.derived_legal_facts, null, 2));
console.log("\n--- Draft ---");
console.log(result.body ?? "(empty)");

const out = path.join(root, "scripts", "_wiseparking-report.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2));
console.log("\nWrote", out);
process.exit(0);
