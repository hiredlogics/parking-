/**
 * End-to-end Euro Car Parks walkthrough with step logs.
 * Produces appeal TEXT (not PDF).
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

function step(n: number, title: string, detail?: unknown) {
  console.log("\n" + "=".repeat(72));
  console.log(`STEP ${n}: ${title}`);
  console.log("=".repeat(72));
  if (detail !== undefined) {
    console.log(
      typeof detail === "string" ? detail : JSON.stringify(detail, null, 2),
    );
  }
}

const { ensureAdminConfigSeeded } = await import("../lib/config/seedAdminConfig");
const { buildCaseIntelligence } = await import("../lib/cases/caseIntelligence");
const { resolveFactGap } = await import("../lib/facts/gapResolver");
const { deriveKnownFacts, FACT } = await import("../lib/facts/facts");
const { applyDocumentImplications } = await import("../lib/facts/documentImplications");
const { resolveAnswersWithDefaults } = await import("../lib/rules/factDefaults");
const { loadKbCatalog } = await import("../lib/kb/catalog");
const { retrieveKnowledge } = await import("../lib/retrieval/engine");
const { buildAppealAnalysis } = await import("../lib/drafting/appealAnalysis");
const { generateValidatedAppeal } = await import("../lib/generation/engine");
const { validateDraft } = await import("../lib/validation/engine");
const { loadValidatorConfig } = await import("../lib/validation/ruleConfig");
const { buildVariableMap } = await import("../lib/variables");

await ensureAdminConfigSeeded();

// --- Notice facts from the Euro Car Parks Notice to Owner image ---
const confirmed = {
  operator_name: "Euro Car Parks",
  pcn_number: "88812303053",
  vrm: "KS58OPW",
  vehicle_make: "FIAT",
  parking_location: "Sainsburys - Harringay",
  parking_event_date: "2026-07-17",
  notice_issue_date: "2026-07-30",
  notice_route: "POSTAL" as const,
  entry_time: "13:39",
  exit_time: "17:06",
  total_recorded_duration: 207,
  charge_amount: 100,
  alleged_breach:
    "Your vehicle has overstayed the maximum time period allowed",
  uk_jurisdiction: "ENGLAND_WALES" as const,
  case_stage: "INITIAL_OPERATOR_APPEAL" as const,
  confirmedAt: new Date().toISOString(),
};

step(1, "DOCUMENT INPUT (Notice to Owner)", {
  what: "Customer uploaded Euro Car Parks Notice to Owner",
  where: "Document AI / OCR + confirm",
  doing: "Read operator, dates, entry/exit, duration, allegation, charge",
  fields: confirmed,
});

step(2, "STRUCTURED CASE FACTS + DOCUMENT IMPLICATIONS", {
  what: "Build KnownFacts with provenance; imply notice-visible facts",
  where: "lib/facts/facts.ts + lib/facts/documentImplications.ts",
});

const answersIn = {
  jurisdiction: "ENGLAND_WALES",
  registered_keeper: "YES",
  driver_identified: "NO",
};
const { answers: withDefaults, applied } = resolveAnswersWithDefaults(
  confirmed as never,
  answersIn as never,
  [],
);
let facts = deriveKnownFacts({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
});
facts = applyDocumentImplications(facts);

console.log("Defaults applied:", applied);
console.log("anpr_images_on_notice from document:", facts.values[FACT.ANPR_IMAGES_ON_NOTICE]);
console.log("provenance anpr_images:", facts.provenance[FACT.ANPR_IMAGES_ON_NOTICE]);

step(3, "CASE INTELLIGENCE (sole authority for grounds)", {
  what: "Classify possible / supported / rejected / unresolved grounds",
  where: "lib/cases/groundsAuthority.ts via buildCaseIntelligence",
  doing: "PoFA date math + knowledge use_when; allegation is soft signal only",
});

const intelligence = buildCaseIntelligence({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
  documentUnderstanding: {
    documentType: "NOTICE_TO_KEEPER",
    senderName: "Euro Car Parks",
    parkingOperatorName: "Euro Car Parks",
    caseStage: "INITIAL_OPERATOR_APPEAL",
    serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
  },
  knownFactsOverride: facts,
});

console.log("Supported:", intelligence.supported_grounds.map((g) => g.code));
console.log("Possible (not activated):", intelligence.possible_grounds.filter((g) => g.status === "possible").map((g) => g.code));
console.log("Rejected:", intelligence.rejected_grounds.map((g) => g.code));
console.log("Unresolved:", intelligence.unresolved_grounds.map((g) => g.code));
console.log("PoFA:", {
  paragraph: intelligence.pofa_analysis?.paragraph,
  timingStatus: intelligence.pofa_analysis?.timingStatus,
  deadline: intelligence.pofa_analysis?.deadline,
  noticeGivenDate: intelligence.pofa_analysis?.noticeGivenDate,
  daysLate: intelligence.pofa_analysis?.daysLate,
  reasons: intelligence.pofa_analysis?.reasons,
});
console.log("Code version:", intelligence.code_version);
console.log("Primary route (analysis):", intelligence.analysis?.primaryRoute);
console.log("Secondary routes:", intelligence.analysis?.secondaryRoutes);

step(4, "MISSING MATERIAL FACTS", {
  what: "What still needs asking before drafting",
  where: "CaseIntelligence.missing_material_facts",
  facts: intelligence.missing_material_facts,
});

step(5, "ADAPTIVE QUESTIONS", {
  what: "Ask only unresolved ANSWER-source facts not on the notice",
  where: "lib/facts/gapResolver.ts",
});

const gap = await resolveFactGap({
  facts,
  evidenceTypes: [],
  caseIntelligence: intelligence,
});
console.log("Questions to ask:", gap.gap ? [gap.gap.factKey] : []);
console.log("Outstanding:", gap.outstanding.map((m) => m.factKey));
console.log("Complete (nothing to ask):", gap.complete);
console.log(
  "Note: anpr_images_on_notice is NOT asked because entry/exit already on notice.",
);

step(6, "KNOWLEDGE RETRIEVAL", {
  what: "Fetch approved modules for CI routes only (retrieval does not invent grounds)",
  where: "lib/retrieval/engine.ts",
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
console.log(
  "Retained modules:",
  retrieval.modules.map((m) => `${m.moduleId} (${m.routeFamily})`),
);
console.log(
  "Rejected sample:",
  retrieval.trace
    .filter((t) => !t.eligible)
    .slice(0, 8)
    .map((t) => `${t.moduleId}: ${t.code}`),
);

step(7, "APPEAL ANALYSIS (LLM drafting input)", {
  what: "Single object the model may use — grounds already decided",
  where: "lib/drafting/appealAnalysis.ts",
});

const appealAnalysis = buildAppealAnalysis({
  intelligence,
  modules: retrieval.modules,
  sources: retrieval.sources,
});
console.log({
  primary_ground: appealAnalysis.primary_ground,
  secondary_grounds: appealAnalysis.secondary_grounds,
  code_version: appealAnalysis.code_version,
  pofa_days_late: appealAnalysis.pofa?.daysLate,
  knowledge_modules: appealAnalysis.knowledge_modules.map((m) => m.moduleId),
});

step(8, "GROUNDED DRAFTING + VALIDATION", {
  what: "Generate appeal letter, then run Validation Service",
  where: "lib/generation/engine.ts → draftAppeal → validators",
  doing: "LLM (if configured) or rules content pack filtered to CI routes",
});

const result = await generateValidatedAppeal({
  caseId: "walkthrough_euro_kst58opw",
  confirmed: confirmed as never,
  answers: withDefaults as never,
  evidenceTypes: [],
  analysis: intelligence.analysis,
  intelligence,
});

console.log("Generation status:", result.status);
console.log("Primary route used:", result.analysis.primaryRoute);
console.log("Modules used:", result.moduleIds);
console.log("Provider:", result.provider);
console.log("Warnings:", result.warnings?.slice(0, 10));
if (result.attempts?.length) {
  const last = result.attempts[result.attempts.length - 1];
  console.log("Validation passed:", last?.validation?.status);
  console.log(
    "Validation findings:",
    (last?.validation?.issues ?? []).map(
      (i: { code: string; severity: string; message: string }) =>
        `${i.severity}: ${i.code} — ${i.message}`,
    ),
  );
}

const body = result.body ?? "";

step(9, "FINAL APPEAL TEXT (not PDF)", {
  what: "Letter body for operator appeal",
  chars: body.length,
});

console.log("\n" + "#".repeat(72));
console.log("# APPEAL LETTER");
console.log("#".repeat(72) + "\n");
console.log(body || "(no body produced — see status/warnings above)");
console.log("\n" + "#".repeat(72));

const outPath = path.join(root, "scripts", "_euro-walkthrough-appeal.txt");
fs.writeFileSync(
  outPath,
  [
    `STATUS: ${result.status}`,
    `PRIMARY: ${result.analysis.primaryRoute}`,
    `MODULES: ${(result.moduleIds ?? []).join(", ")}`,
    "",
    body || "(empty)",
  ].join("\n"),
);
console.log("\nSaved:", outPath);

process.exit(result.body ? 0 : 1);
