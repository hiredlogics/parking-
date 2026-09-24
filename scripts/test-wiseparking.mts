/**
 * WiseParking — PERMIT + ANPR_EVIDENCE (not OVERSTAY) question flow + draft.
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
const { generateFactQuestion } = await import("../lib/facts/factQuestionProvider");
const { loadKbCatalog } = await import("../lib/kb/catalog");
const { retrieveKnowledge } = await import("../lib/retrieval/engine");
const { buildAppealAnalysis } = await import("../lib/drafting/appealAnalysis");
const { generateValidatedAppeal } = await import("../lib/generation/engine");

await ensureAdminConfigSeeded();

const confirmed = {
  operator_name: "Wise Parking Ltd",
  pcn_number: "AP539112",
  vrm: "LX71UNS",
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

const baseAnswers = {
  jurisdiction: "ENGLAND_WALES",
  registered_keeper: "YES",
  driver_identified: "NO",
};

async function run(answers: Record<string, unknown>) {
  const { answers: withDefaults } = resolveAnswersWithDefaults(
    confirmed as never,
    answers as never,
    [],
  );
  let facts = applyDocumentImplications(
    deriveKnownFacts({
      confirmed: confirmed as never,
      answers: withDefaults,
      evidenceTypes: [],
    }),
  );
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
  const gap = await resolveFactGap({
    facts,
    evidenceTypes: [],
    caseIntelligence: intelligence,
  });
  let question: string | null = null;
  if (gap.gap) {
    question = (await generateFactQuestion({ gap: gap.gap, facts })).text;
  }
  return { withDefaults, facts, intelligence, gap, question };
}

console.log("\n=== PHASE 1: notice only ===");
const p1 = await run(baseAnswers);
console.log(
  JSON.stringify(
    {
      supported: p1.intelligence.supported_grounds?.map((g) => g.code),
      unresolved: p1.intelligence.unresolved_grounds?.map((g) => ({
        code: g.code,
        reasons: g.reasons,
        missingFacts: g.missingFacts,
      })),
      missing_material_facts: p1.intelligence.missing_material_facts,
      next: { factKey: p1.gap.gap?.factKey, question: p1.question },
      no_anpr_overstay: ![
        ...(p1.intelligence.supported_grounds ?? []),
        ...(p1.intelligence.unresolved_grounds ?? []),
        ...(p1.intelligence.possible_grounds ?? []),
      ].some((g) => g.code === "ANPR_OVERSTAY" && g.status !== "possible"),
    },
    null,
    2,
  ),
);

console.log("\n=== PHASE 2: permit YES + source ===");
const p2 = await run({
  ...baseAnswers,
  permission_held: "YES",
  permission_source: "other",
  "__askedfact:permission_held": true,
  "__askedfact:permission_source": true,
});
console.log(
  JSON.stringify(
    {
      supported: p2.intelligence.supported_grounds?.map((g) => g.code),
      unresolved: p2.intelligence.unresolved_grounds?.map((g) => g.code),
      missing_material_facts: p2.intelligence.missing_material_facts,
      next: { factKey: p2.gap.gap?.factKey, question: p2.question },
    },
    null,
    2,
  ),
);

console.log("\n=== PHASE 3: continuous_presence NO + visit_count 2 → draft ===");
const p3Answers = {
  ...baseAnswers,
  permission_held: "YES",
  permission_source: "other",
  continuous_presence: "NO",
  visit_count: 2,
  "__askedfact:permission_held": true,
  "__askedfact:permission_source": true,
  "__askedfact:continuous_presence": true,
  "__askedfact:visit_count": true,
};
const p3 = await run(p3Answers);
console.log(
  JSON.stringify(
    {
      supported: p3.intelligence.supported_grounds?.map((g) => ({
        code: g.code,
        reasons: g.reasons,
      })),
      unresolved: p3.intelligence.unresolved_grounds?.map((g) => g.code),
      gap_complete: p3.gap.complete,
    },
    null,
    2,
  ),
);

const catalog = await loadKbCatalog();
const retrieval = retrieveKnowledge({
  analysis: p3.intelligence.analysis!,
  facts: p3.facts,
  parkingEventDate: confirmed.parking_event_date,
  evidenceTypes: [],
  modules: catalog.modules,
  sources: catalog.sources,
  blocks: catalog.blocks,
});
const appealAnalysis = buildAppealAnalysis({
  intelligence: p3.intelligence,
  modules: retrieval.modules,
  sources: retrieval.sources,
});
const result = await generateValidatedAppeal({
  caseId: null,
  confirmed: confirmed as never,
  answers: p3.withDefaults as never,
  evidenceTypes: [],
  analysis: p3.intelligence.analysis,
  intelligence: p3.intelligence,
});
const last = result.attempts?.[result.attempts.length - 1];

const report = {
  phase1: {
    unresolved: p1.intelligence.unresolved_grounds?.map((g) => g.code),
    missing: p1.intelligence.missing_material_facts,
    question: p1.question,
  },
  phase2: {
    supported: p2.intelligence.supported_grounds?.map((g) => g.code),
    unresolved: p2.intelligence.unresolved_grounds?.map((g) => g.code),
    question: p2.question,
  },
  phase3: {
    supported: p3.intelligence.supported_grounds?.map((g) => g.code),
    appealAnalysis,
    validation: {
      status: last?.validation?.status ?? null,
      blocking: (last?.validation?.issues ?? [])
        .filter((i: { severity: string }) => i.severity === "BLOCKING")
        .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`),
    },
    draft: result.body,
    status: result.status,
  },
};

console.log("\n--- AppealAnalysis ---");
console.log(JSON.stringify(appealAnalysis, null, 2));
console.log("\n--- Validation ---");
console.log(JSON.stringify(report.phase3.validation, null, 2));
console.log("\n--- Draft ---");
console.log(result.body ?? "(empty)");

fs.writeFileSync(
  path.join(root, "scripts", "_wiseparking-report.json"),
  JSON.stringify(report, null, 2),
);
process.exit(0);
