/**
 * Client dump: Issue Analysis BEFORE Adaptive Questions for CASE-2026-000031.
 * Also reports LLM Drafting input + Validation if an appeal exists.
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
const { classifyAllegation } = await import("../lib/reasoning/allegation");
const { evaluateIssues } = await import("../lib/engine/issueEngine");
const { deriveKnownFacts, FACT } = await import("../lib/facts/facts");
const { resolveFactGap, askedFactKey } = await import("../lib/facts/gapResolver");
const { deterministicQuestion } = await import("../lib/facts/factQuestion");
const { loadFactRegistry } = await import("../lib/config/factRegistry");
const { analyseCase } = await import("../lib/analysis/engine");
const { loadPofaConfig } = await import("../lib/config/pofaConfig");
const { loadKbCatalog } = await import("../lib/kb/catalog");
const { retrieveKnowledge } = await import("../lib/retrieval/engine");
const { resolveAnswersWithDefaults } = await import("../lib/rules/factDefaults");
const { buildCaseIntelligence } = await import("../lib/cases/caseIntelligence");
const { assessGroundSufficiency } = await import("../lib/generation/groundGuard");

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
            case_intelligence_json, adaptive_answers, questioning_complete,
            document_type, sender_name, parking_operator_name, case_stage,
            created_at, updated_at
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
const caseId = String(c.id);
const confirmed = c.confirmed_json as Record<string, unknown>;
const extraction = c.extraction_json as Record<string, unknown> | null;
const storedIntel = c.case_intelligence_json as Record<string, unknown> | null;
const adaptiveAnswers = (c.adaptive_answers as Record<string, unknown>) ?? {};

const beforeQuestionAnswers: Record<string, unknown> = {};
for (const [k, v] of Object.entries(adaptiveAnswers)) {
  if (k.startsWith("__askedfact:")) continue;
  if (
    k === "jurisdiction" ||
    k === FACT.REGISTERED_KEEPER ||
    k === FACT.DRIVER_IDENTIFIED ||
    k === FACT.VEHICLE_HIRE_STATUS
  ) {
    beforeQuestionAnswers[k] = v;
  }
}

const allegation = classifyAllegation(String(confirmed.alleged_breach ?? ""));
const { answers: withDefaults, applied: appliedDefaults } =
  resolveAnswersWithDefaults(
    confirmed as never,
    beforeQuestionAnswers as never,
    [],
  );

const factsBeforeQ = deriveKnownFacts({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
});

const issueEval = await evaluateIssues({
  facts: factsBeforeQ,
  evidenceTypes: [],
});

const analysis = analyseCase({
  confirmed: confirmed as never,
  answers: withDefaults,
  evidenceTypes: [],
  evidenceRefs: [],
  pofaConfig: await loadPofaConfig(),
});

const intelligence = buildCaseIntelligence({
  confirmed: confirmed as never,
  answers: beforeQuestionAnswers as never,
  evidenceTypes: [],
  documentUnderstanding: {
    documentType: (c.document_type as never) ?? null,
    senderName: (c.sender_name as string) ?? null,
    parkingOperatorName:
      (c.parking_operator_name as string) ??
      (confirmed.operator_name as string) ??
      null,
    caseStage: (c.case_stage as never) ?? null,
    serviceDecision:
      ((extraction?.triage as { serviceDecision?: string } | undefined)
        ?.serviceDecision as never) ?? null,
  },
});

const catalog = await loadKbCatalog();
const retrievalBeforeQ = retrieveKnowledge({
  analysis,
  facts: factsBeforeQ,
  parkingEventDate: confirmed.parking_event_date as string,
  evidenceTypes: [],
  modules: catalog.modules,
  sources: catalog.sources,
  blocks: catalog.blocks,
});

const groundGuard = await assessGroundSufficiency({
  facts: factsBeforeQ,
  analysis,
  evidenceTypes: [],
  retainedModules: retrievalBeforeQ.modules.map((m) => ({
    moduleId: m.moduleId,
    routeFamily: m.routeFamily,
  })),
});

const registry = await loadFactRegistry();
const gap0 = await resolveFactGap({
  facts: factsBeforeQ,
  evidenceTypes: [],
  evaluation: issueEval,
});

const proposedQuestions = [] as Record<string, unknown>[];
let answersSim = { ...withDefaults };
let factsSim = factsBeforeQ;
let gap = gap0;
let guard = 0;
while (gap.gap && guard++ < 8) {
  const g = gap.gap;
  const entry = registry.get(g.factKey);
  const q = deterministicQuestion(g);
  proposedQuestions.push({
    order: guard,
    factKey: g.factKey,
    issueCode: g.issueCode,
    issueLabel: g.issueLabel,
    reasonCode: g.reasonCode,
    optional: g.optional === true,
    question_text: q.text,
    registry_source: entry?.source ?? null,
    why_required: `Issue ${g.issueCode} (${g.issueLabel}) is active after Issue Analysis; fact '${g.factKey}' is unresolved (${g.reasonCode}). Adaptive Question Service asks ANSWER-source gaps in priority order (budget).`,
    notice_already_extracted:
      g.factKey === "anpr_images_on_notice"
        ? {
            entry_time: confirmed.entry_time,
            exit_time: confirmed.exit_time,
            total_recorded_duration: confirmed.total_recorded_duration,
            alleged_breach: confirmed.alleged_breach,
            problem:
              "Customer is asked about ANPR images despite entry/exit/duration already extracted from the notice.",
          }
        : null,
  });
  answersSim = {
    ...answersSim,
    [g.factKey]: "UNSURE",
    [askedFactKey(g.factKey)]: true,
  };
  factsSim = deriveKnownFacts({
    confirmed: confirmed as never,
    answers: answersSim as never,
    evidenceTypes: [],
  });
  gap = await resolveFactGap({ facts: factsSim, evidenceTypes: [] });
}

const acceptedRoutes = analysis.assessments.map((a) => ({
  status: "ACCEPTED_AS_CANDIDATE",
  route: a.route,
  rank: a.rank,
  basis: a.basis,
  evidenceBacked: a.evidenceBacked,
  moduleIds: a.moduleIds,
}));

const rejectedModules = retrievalBeforeQ.trace
  .filter((t) => !t.eligible)
  .map((t) => ({
    moduleId: t.moduleId,
    code: t.code,
    reason: t.reason,
  }));

const retainedModules = retrievalBeforeQ.modules.map((m) => ({
  status: "RETAINED",
  moduleId: m.moduleId,
  routeFamily: m.routeFamily,
  title: m.title,
}));

const payload = {
  case: {
    caseId,
    publicId: c.public_id,
    status: c.status,
    questioning_complete: c.questioning_complete,
  },
  architecture_reality_check: {
    question:
      "What does the AI independently do with event date 17/07/2026, notice 30/07/2026, ANPR entry/exit and alleged overstay BEFORE decision-tree logic?",
    answer:
      "There is no LLM Issue Analysis call at this stage. Document AI already extracted those fields. What runs next is deterministic/rule engines only: (1) keyword allegation classifier on alleged_breach → OVERSTAY → GRACE/ANPR/CONSIDERATION; (2) admin applicability opening those issues; (3) deterministic PoFA paragraph-9 date math on the two dates + postal deemed service; (4) Code version resolution from event date. Adaptive Questions then ask missing ANSWER facts from those opened issues.",
  },
  stage: "ISSUE_ANALYSIS_OUTPUT — immediately after Issue Analysis, before Adaptive Question Service and before LLM Drafting",
  inputs_consumed: {
    parking_event_date: confirmed.parking_event_date,
    notice_issue_date: confirmed.notice_issue_date,
    entry_time: confirmed.entry_time,
    exit_time: confirmed.exit_time,
    total_recorded_duration: confirmed.total_recorded_duration,
    alleged_breach: confirmed.alleged_breach,
    notice_route: confirmed.notice_route,
    answers_before_questions: beforeQuestionAnswers,
    system_defaults_applied: appliedDefaults.map((d) => ({
      factKey: d.factKey,
      value: d.value,
      reasonCode: d.reasonCode,
    })),
  },
  detected_issues: issueEval.activeIssues.map((i) => ({
    code: i.code,
    label: i.label,
    moduleIds: i.moduleIds,
    reason_evidence:
      i.code === "ANPR" || i.code === "GRACE" || i.code === "CONSIDERATION"
        ? `Allegation classifier: category=${allegation.category}, matched="${allegation.matched}", routes=[${allegation.routes.join(", ")}]. Issue opened via applicability tags (allegation_category:overstay / allegation:${i.code.toLowerCase()}). NOT because LLM inspected ANPR images or independently reasoned about the stay length.`
        : JSON.stringify(i.trace),
    applicability_trace: i.trace,
  })),
  pofa_analysis: {
    engine: "deterministic analysePofa / date math — NOT LLM",
    analyseCase_pofa: analysis.pofa,
    case_intelligence: {
      identifiedIssues: intelligence.identifiedIssues,
      technicalFindings: intelligence.technicalFindings,
      dateTiming: intelligence.dateTiming,
      knowledgeRefs: intelligence.knowledgeRefs,
    },
    date_path: {
      parking_event_date: "2026-07-17",
      notice_issue_date: "2026-07-30",
      notice_route: "POSTAL",
      paragraph: analysis.pofa.paragraph,
      deadline: analysis.pofa.deadline,
      notice_given_date: analysis.pofa.noticeGivenDate,
      days_late: analysis.pofa.daysLate,
      timingStatus: analysis.pofa.timingStatus,
      reasons: analysis.pofa.reasons,
    },
  },
  code_analysis: {
    engine: "resolveCodeVersion from parking_event_date + operator ATA — NOT LLM defect spotting",
    codeVersion: analysis.codeVersion,
    codeVersionId: analysis.codeVersionId,
    manualReview_if_unresolved:
      analysis.manualReview?.reason === "CODE_VERSION_UNRESOLVED"
        ? analysis.manualReview
        : null,
    note: "Code version is resolved for grounding/references. There is no separate AI 'Code analysis' that spots BPA/IPC breaches from the PDF at this stage.",
  },
  missing_facts: issueEval.missingFacts.map((m) => ({
    factKey: m.factKey,
    issueCode: m.issueCode,
    reasonCode: m.reasonCode,
    priority: m.priority,
    optional: m.optional === true,
  })),
  proposed_customer_questions: proposedQuestions,
  retrieved_knowledge_modules: {
    retained: retainedModules,
    rejected: rejectedModules,
    from_issue_config: issueEval.applicableModuleIds,
  },
  grounds_accepted_rejected_unresolved: {
    primaryRoute: analysis.primaryRoute,
    secondaryRoutes: analysis.secondaryRoutes,
    accepted_candidate_routes: acceptedRoutes,
    prohibitedClaims: analysis.prohibitedClaims,
    manualReview: analysis.manualReview,
    groundGuard_pre_draft: {
      ok: groundGuard.ok,
      reason: groundGuard.reason,
      detail: groundGuard.detail,
      activeIssues: groundGuard.activeIssues,
      substantiveIssues: groundGuard.substantiveIssues,
      establishedPofaDefect: groundGuard.establishedPofaDefect,
      supportingModules: groundGuard.supportingModules,
      missingFacts: groundGuard.missingFacts,
    },
    unresolved_from_analyseCase_missingFacts: analysis.missingFacts,
  },
  stored_case_intelligence_at_confirm_time: storedIntel
    ? {
        identifiedIssues: storedIntel.identifiedIssues,
        dateTiming: storedIntel.dateTiming,
        analysis_primaryRoute: (
          storedIntel.analysis as { primaryRoute?: string } | undefined
        )?.primaryRoute,
        analysis_manualReview: (
          storedIntel.analysis as { manualReview?: unknown } | undefined
        )?.manualReview,
      }
    : null,
};

const outPath = path.join(root, "scripts", "_issue-analysis-client.json");
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));
console.log("=== ISSUE ANALYSIS (before Adaptive Questions) ===");
console.log(JSON.stringify(payload, null, 2));

console.log("\n################################################################");
console.log("# LLM DRAFTING INPUT + VALIDATION SERVICE");
console.log("################################################################");

const appeals = rowsOf(
  await sql.query(
    `SELECT id, status, body, paragraphs, issues_json, facts_snapshot,
            knowledge_snapshot, module_ids, validation_json, checklist_json,
            warnings, created_at, superseded_at
       FROM case_appeals WHERE case_id = $1
       ORDER BY created_at DESC LIMIT 3`,
    [caseId],
  ),
);

if (appeals.length === 0) {
  const draftingNote = {
    appeal_rows: 0,
    case_status: c.status,
    questioning_complete: c.questioning_complete,
    note: "LLM Drafting and Validation have not run. Case is still in QUESTIONING — no case_appeals row. Those stages only run after questioningComplete + payment entitlement triggers generateAppealForCase.",
    object_that_would_feed_LLM_Drafting_when_ready: {
      verified_case_facts: "confirmed_json + adaptive_answers (post fact-gap)",
      analysis: {
        primaryRoute: analysis.primaryRoute,
        assessments: analysis.assessments,
        pofa: analysis.pofa,
        codeVersion: analysis.codeVersion,
      },
      approved_knowledge_modules: retainedModules,
      active_issues: issueEval.activeIssues.map((i) => i.code),
      groundGuard_gate: groundGuard,
    },
  };
  fs.writeFileSync(
    path.join(root, "scripts", "_drafting-validation-client.json"),
    JSON.stringify(draftingNote, null, 2),
  );
  console.log(JSON.stringify(draftingNote, null, 2));
} else {
  const draftVal = appeals.map((a) => {
    const validation = a.validation_json as {
      byValidator?: Record<string, unknown[]>;
      passed?: boolean;
    } | null;
    const by = validation?.byValidator ?? {};
    return {
      appealId: a.id,
      status: a.status,
      object_passed_into_LLM_Drafting_snapshot: {
        facts_snapshot: a.facts_snapshot,
        knowledge_snapshot: a.knowledge_snapshot,
        module_ids: a.module_ids,
        issues_json: a.issues_json,
      },
      body_preview: String(a.body ?? "").slice(0, 800),
      Validation_Service: {
        passed: validation?.passed ?? null,
        VAL_POFA: by["VAL-POFA"] ?? by["VAL_POFA"] ?? null,
        VAL_FACT: by["VAL-FACT"] ?? by["VAL_FACT"] ?? null,
        VAL_UNSUPPORTED:
          by["VAL-UNSUPPORTED"] ?? by["VAL_UNSUPPORTED"] ?? null,
        all_validator_keys: Object.keys(by),
        full_byValidator: by,
      },
      checklist_json: a.checklist_json,
      warnings: a.warnings,
    };
  });
  fs.writeFileSync(
    path.join(root, "scripts", "_drafting-validation-client.json"),
    JSON.stringify(draftVal, null, 2),
  );
  console.log(JSON.stringify(draftVal, null, 2));
}

process.exit(0);
