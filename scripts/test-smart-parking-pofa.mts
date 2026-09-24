/**
 * Smart Parking PoFA bank-holiday fix verification.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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
const { addWorkingDays } = await import("../lib/analysis/pofa");
const { englandWalesBankHolidays } = await import("../lib/analysis/englandWalesHolidays");

await ensureAdminConfigSeeded();

console.log("Summer BH 2026 in calendar?", englandWalesBankHolidays(2026).has("2026-08-31"));
console.log(
  "Deemed from 2026-08-27 +2 WD:",
  addWorkingDays(new Date(Date.UTC(2026, 7, 27)), 2).toISOString().slice(0, 10),
);

const confirmed = {
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
    senderName: "Smart Parking Ltd",
    parkingOperatorName: "Smart Parking Ltd",
    caseStage: "INITIAL_OPERATOR_APPEAL",
    serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
  },
  knownFactsOverride: facts,
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
  pofa: intelligence.pofa_analysis,
  appealAnalysis: {
    primary_ground: appealAnalysis.primary_ground,
    secondary_grounds: appealAnalysis.secondary_grounds,
    pofa: appealAnalysis.pofa,
  },
  validation: {
    status: last?.validation?.status ?? null,
    blocking: (last?.validation?.issues ?? [])
      .filter((i: { severity: string }) => i.severity === "BLOCKING")
      .map((i: { code: string; message: string }) => `${i.code}: ${i.message}`),
  },
  draft: result.body,
  status: result.status,
};

console.log("\n--- PoFA ---");
console.log(
  JSON.stringify(
    {
      deadline: report.pofa?.deadline,
      noticeGivenDate: report.pofa?.noticeGivenDate,
      daysLate: report.pofa?.daysLate,
      timingStatus: report.pofa?.timingStatus,
      reasons: report.pofa?.reasons,
    },
    null,
    2,
  ),
);
console.log("\n--- AppealAnalysis primary ---", report.appealAnalysis.primary_ground);
console.log("\n--- Validation ---", JSON.stringify(report.validation));
console.log("\n--- Draft ---");
console.log(result.body ?? "(empty)");

fs.writeFileSync(
  path.join(root, "scripts", "_smart-parking-pofa-report.json"),
  JSON.stringify(report, null, 2),
);
process.exit(0);
