/**
 * Diagnostic dump for Euro Car Parks CASE — Issue Analysis stage
 * BEFORE Adaptive Questions and BEFORE LLM Drafting, plus Validation
 * output if an appeal was generated.
 *
 * No fixes. Read-only diagnosis.
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

await ensureAdminConfigSeeded();
const sql = getSql();

console.log("=== LOCATE EURO CAR PARKS CASE ===");
const found = await sql.query(
  `SELECT id, public_id, status, confirmed_json, extraction_json,
          case_intelligence_json, adaptive_answers, questioning_complete,
          missing_facts, candidate_routes, primary_route, secondary_routes,
          document_type, sender_name, parking_operator_name, case_stage,
          created_at, updated_at
     FROM appeal_cases
    WHERE id = 'case_mufuggam61125e'
       OR public_id = 'CASE-2026-000031'
       OR LOWER(COALESCE(confirmed_json->>'operator_name','')) LIKE '%euro%'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 1`,
);
const rows = Array.isArray(found) ? found : ((found as { rows?: unknown[] }).rows ?? []);
if (!rows[0]) {
  console.log("CASE NOT FOUND");
  process.exit(1);
}
const c = rows[0] as Record<string, unknown>;
const caseId = String(c.id);
console.log({ caseId, publicId: c.public_id, status: c.status });

const confirmed = c.confirmed_json as Record<string, unknown>;
const extraction = c.extraction_json as Record<string, unknown>;
const storedIntel = c.case_intelligence_json as Record<string, unknown> | null;
const adaptiveAnswers = (c.adaptive_answers as Record<string, unknown>) ?? {};

// Answers that existed BEFORE fact-gap questions (strip asked markers + answered fact-gap keys)
const beforeQuestionAnswers: Record<string, unknown> = {};
for (const [k, v] of Object.entries(adaptiveAnswers)) {
  if (k.startsWith("__askedfact:")) continue;
  // Keep jurisdiction / keeper if set at confirm; exclude anpr_images etc that came from questions
  if (
    k === "jurisdiction" ||
    k === FACT.REGISTERED_KEEPER ||
    k === FACT.DRIVER_IDENTIFIED ||
    k === FACT.VEHICLE_HIRE_STATUS
  ) {
    beforeQuestionAnswers[k] = v;
  }
}

console.log("\n################################################################");
console.log("# STAGE A — AI DOCUMENT OUTPUT (extraction + triage)");
console.log("# BEFORE Issue Analysis / Adaptive Questions / Drafting");
console.log("################################################################");
console.log(
  JSON.stringify(
    {
      extraction_raw: extraction?.raw ?? null,
      extraction_provider: extraction?.providerId ?? null,
      extraction_at: extraction?.extractedAt ?? null,
      triage: extraction?.triage ?? null,
      confirmed_notice_fields: confirmed,
      document_understanding: {
        documentType: c.document_type,
        senderName: c.sender_name,
        parkingOperatorName: c.parking_operator_name,
        caseStage: c.case_stage,
      },
    },
    null,
    2,
  ),
);

console.log("\n################################################################");
console.log("# STAGE B — ISSUE ANALYSIS (raw), BEFORE Adaptive Questions");
console.log("# Rebuilt from confirmed notice + pre-question answers only");
console.log("################################################################");

const allegation = classifyAllegation(String(confirmed.alleged_breach ?? ""));
const { answers: withDefaults, applied: appliedDefaults } =
  resolveAnswersWithDefaults(confirmed as never, beforeQuestionAnswers as never, []);

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

const issueAnalysisRaw = {
  stage: "ISSUE_ANALYSIS",
  timing: "BEFORE_ADAPTIVE_QUESTIONS_AND_BEFORE_LLM_DRAFTING",
  inputs: {
    alleged_breach: confirmed.alleged_breach,
    notice_dates: {
      parking_event_date: confirmed.parking_event_date,
      notice_issue_date: confirmed.notice_issue_date,
      entry_time: confirmed.entry_time,
      exit_time: confirmed.exit_time,
      total_recorded_duration: confirmed.total_recorded_duration,
    },
    answers_present_before_questions: beforeQuestionAnswers,
    defaults_applied_by_system: appliedDefaults.map((d) => ({
      factKey: d.factKey,
      value: d.value,
      reasonCode: d.reasonCode,
    })),
  },
  allegation_classifier: {
    engine: "regex/keyword — NOT LLM",
    category: allegation.category,
    matched: allegation.matched,
    routes_attached: allegation.routes,
  },
  issue_engine: {
    engine: "admin applicability_json + allegation tags — NOT LLM vision",
    activeIssues: issueEval.activeIssues.map((i) => ({
      code: i.code,
      label: i.label,
      moduleIds_configured: i.moduleIds,
      trace: i.trace,
    })),
    why_each_issue: issueEval.activeIssues.map((i) => ({
      code: i.code,
      label: i.label,
      why:
        i.code === "ANPR" || i.code === "GRACE" || i.code === "CONSIDERATION"
          ? `Allegation category ${allegation.category} (matched "${allegation.matched}") maps to routes [${allegation.routes.join(", ")}] which open this issue via applicability tags (allegation_category:${allegation.category.toLowerCase()} / allegation:${i.code.toLowerCase()}). NOT because AI inspected ANPR images on the PDF.`
          : i.code === "PAYMENT_KEYING"
            ? `Allegation category ${allegation.category} opens PAYMENT_KEYING via applicability.`
            : `Opened by condition/tag match. Trace: ${JSON.stringify(i.trace)}`,
    })),
    missingFacts: issueEval.missingFacts.map((m) => ({
      factKey: m.factKey,
      issueCode: m.issueCode,
      reasonCode: m.reasonCode,
      priority: m.priority,
      optional: m.optional === true,
      evidenceTypes: m.evidenceTypes,
    })),
    nextFact: issueEval.nextFact,
    applicableModuleIds_from_issues: issueEval.applicableModuleIds,
  },
  case_intelligence_identified: {
    identifiedIssues: intelligence.identifiedIssues,
    technicalFindings: intelligence.technicalFindings,
    dateTiming: intelligence.dateTiming,
    knowledgeRefs: intelligence.knowledgeRefs,
    missingFacts: intelligence.missingFacts,
  },
  deterministic_analyseCase: {
    primaryRoute: analysis.primaryRoute,
    secondaryRoutes: analysis.secondaryRoutes,
    assessments: analysis.assessments,
    pofa: analysis.pofa,
    manualReview: analysis.manualReview,
    missingFacts: analysis.missingFacts,
  },
  retrieval_at_issue_analysis_before_questions: {
    note: "Modules retrieval would see with notice+defaults only (no customer fact-gap answers yet)",
    modules: retrievalBeforeQ.modules.map((m) => ({
      moduleId: m.moduleId,
      routeFamily: m.routeFamily,
      title: m.title,
    })),
    rejected_sample: retrievalBeforeQ.decisionTrace
      ?.filter((t) => t.decision === "REJECT")
      .slice(0, 15)
      .map((t) => ({ moduleId: t.moduleId, reason: t.reason })),
  },
  stored_case_intelligence_snapshot: storedIntel
    ? {
        identifiedIssues: storedIntel.identifiedIssues,
        technicalFindings: storedIntel.technicalFindings,
        dateTiming: storedIntel.dateTiming,
        analysis_primaryRoute: (storedIntel.analysis as { primaryRoute?: string } | undefined)
          ?.primaryRoute,
        analysis_manualReview: (storedIntel.analysis as { manualReview?: unknown } | undefined)
          ?.manualReview,
      }
    : null,
};

console.log(JSON.stringify(issueAnalysisRaw, null, 2));

console.log("\n################################################################");
console.log("# STAGE C — WHY EACH CUSTOMER QUESTION WAS GENERATED");
console.log("# Fact-gap from Issue Analysis missing facts (budget 4)");
console.log("################################################################");

const registry = await loadFactRegistry();
const gap0 = await resolveFactGap({
  facts: factsBeforeQ,
  evidenceTypes: [],
  evaluation: issueEval,
});

const questionPlan = [];
let answersSim = { ...withDefaults };
let factsSim = factsBeforeQ;
let gap = gap0;
let guard = 0;
while (gap.gap && guard++ < 8) {
  const g = gap.gap;
  const entry = registry.get(g.factKey);
  const q = deterministicQuestion(g);
  const alreadyOnNotice =
    g.factKey === "anpr_images_on_notice"
      ? {
          extractable_from_notice: true,
          evidence_already_in_extraction: {
            alleged_breach: confirmed.alleged_breach,
            entry_time: confirmed.entry_time,
            exit_time: confirmed.exit_time,
            total_recorded_duration: confirmed.total_recorded_duration,
          },
          problem:
            "This asks the customer to interpret the notice for ANPR imaging even though times/duration/allegation are already extracted. Fact is marked source=ANSWER and is not auto-admitted from the notice.",
        }
      : {
          extractable_from_notice: entry?.source === "NOTICE",
          registry_source: entry?.source ?? null,
        };

  questionPlan.push({
    order: guard,
    factKey: g.factKey,
    issueCode: g.issueCode,
    issueLabel: g.issueLabel,
    reasonCode: g.reasonCode,
    optional: g.optional,
    question_text: q.text,
    registry_source: entry?.source ?? null,
    guidance: entry?.guidance ?? g.guidance,
    why_generated: `Issue ${g.issueCode} is active and requires fact '${g.factKey}' (${g.reasonCode}). Fact-gap asks ANSWER-source facts that are unresolved. Priority=${g.priority}.`,
    notice_visibility_check: alreadyOnNotice,
    actual_answer_in_db: adaptiveAnswers[g.factKey] ?? null,
    was_asked_in_db: Boolean(adaptiveAnswers[askedFactKey(g.factKey)]),
  });

  // Advance simulation as "unsure/decline" to show next questions without inventing answers
  answersSim = {
    ...answersSim,
    [askedFactKey(g.factKey)]: true,
  };
  factsSim = deriveKnownFacts({
    confirmed: confirmed as never,
    answers: answersSim as never,
    evidenceTypes: [],
  });
  for (const key of Object.keys(answersSim)) {
    if (key.startsWith("__askedfact:")) factsSim.values[key] = true;
  }
  gap = await resolveFactGap({ facts: factsSim, evidenceTypes: [] });
}

console.log(
  JSON.stringify(
    {
      questions_the_system_would_ask: questionPlan,
      live_adaptive_answers_now: adaptiveAnswers,
      questioning_complete_flag: c.questioning_complete,
    },
    null,
    2,
  ),
);

console.log("\n################################################################");
console.log("# STAGE D — VALIDATION SERVICE OUTPUT (if appeal exists)");
console.log("################################################################");

const appeals = await sql.query(
  `SELECT id, case_id, status, body, paragraphs, issues_json,
          facts_snapshot, knowledge_snapshot, module_ids, validation_json,
          checklist_json, warnings, created_at, superseded_at
     FROM case_appeals
    WHERE case_id = $1
    ORDER BY created_at DESC
    LIMIT 3`,
  [caseId],
);
const appealRows = Array.isArray(appeals)
  ? appeals
  : ((appeals as { rows?: unknown[] }).rows ?? []);

if (appealRows.length === 0) {
  // try alternate table names
  const drafts = await sql.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name LIKE '%appeal%' OR table_name LIKE '%draft%'`,
  );
  const draftTables = Array.isArray(drafts)
    ? drafts
    : ((drafts as { rows?: unknown[] }).rows ?? []);
  console.log(
    JSON.stringify(
      {
        appeal_rows: 0,
        note: "No case_appeals row yet — case may still be in QUESTIONING / unpaid, so Validation Service has not run.",
        case_status: c.status,
        related_tables: draftTables,
      },
      null,
      2,
    ),
  );
} else {
  for (const a of appealRows as Record<string, unknown>[]) {
    const validation = a.validation_json as {
      byValidator?: Record<string, unknown[]>;
      findings?: unknown[];
      passed?: boolean;
    } | null;
    const by = validation?.byValidator ?? {};
    console.log(
      JSON.stringify(
        {
          appealId: a.id,
          status: a.status,
          superseded_at: a.superseded_at,
          module_ids: a.module_ids,
          issues_json: a.issues_json,
          knowledge_snapshot: a.knowledge_snapshot,
          warnings: a.warnings,
          body_preview: String(a.body ?? "").slice(0, 800),
          validation_summary: {
            passed: validation?.passed ?? null,
            VAL_POFA: by["VAL-POFA"] ?? by["VAL_POFA"] ?? null,
            VAL_FACT: by["VAL-FACT"] ?? by["VAL_FACT"] ?? null,
            VAL_UNSUPPORTED:
              by["VAL-UNSUPPORTED"] ?? by["VAL_UNSUPPORTED"] ?? null,
            all_validator_keys: Object.keys(by),
            full_byValidator: by,
          },
          checklist_json: a.checklist_json,
          full_validation_json: validation,
        },
        null,
        2,
      ),
    );
  }
}

// Also check appeal_drafts if present
try {
  const drafts2 = await sql.query(
    `SELECT id, case_id, status, module_ids,
            validation_json, checklist_json, warnings, body, created_at
       FROM appeal_drafts
      WHERE case_id = $1
      ORDER BY created_at DESC
      LIMIT 2`,
    [caseId],
  );
  const drows = Array.isArray(drafts2)
    ? drafts2
    : ((drafts2 as { rows?: unknown[] }).rows ?? []);
  if (drows.length) {
    console.log("\n=== appeal_drafts rows ===");
    for (const d of drows as Record<string, unknown>[]) {
      const validation = d.validation_json as {
        byValidator?: Record<string, unknown[]>;
        passed?: boolean;
      } | null;
      const by = validation?.byValidator ?? {};
      console.log(
        JSON.stringify(
          {
            draftId: d.id,
            status: d.status,
            module_ids: d.module_ids,
            warnings: d.warnings,
            body_preview: String(d.body ?? "").slice(0, 800),
            VAL_POFA: by["VAL-POFA"] ?? null,
            VAL_FACT: by["VAL-FACT"] ?? null,
            VAL_UNSUPPORTED: by["VAL-UNSUPPORTED"] ?? null,
            all_validator_keys: Object.keys(by),
            full_validation_json: validation,
            checklist_json: d.checklist_json,
          },
          null,
          2,
        ),
      );
    }
  } else {
    console.log("(no appeal_drafts rows for this case)");
  }
} catch (e) {
  console.log(
    "(no appeal_drafts table or query failed:",
    e instanceof Error ? e.message : String(e),
    ")",
  );
}

console.log("\n################################################################");
console.log("# DIAGNOSIS SUMMARY (where pipeline diverges from diagram)");
console.log("################################################################");
console.log(
  JSON.stringify(
    {
      diagram_says: "Document AI → Case Facts → Issue Analysis → Adaptive Questions → Retrieval → LLM Draft → Validation",
      what_actually_happened_on_this_case: [
        "Document AI/OCR extraction DID run and produced notice fields (good).",
        "Issue Analysis did NOT use AI defect spotting on the PDF; it used allegation keyword classification (OVERSTAY) + admin issue applicability to open ANPR/GRACE/CONSIDERATION as a bundle.",
        "Adaptive Question Service then asked anpr_images_on_notice because that fact is configured as ANSWER-source on the ANPR issue — even though entry/exit/duration/allegation already exist on the notice.",
        "PoFA date timing WAS computed in Case Intelligence (possible late notice from dates), but analyseCase primaryRoute was null / NO_SUPPORTED_ROUTE until keeper facts; any generic PoFA wording without dates is a drafting/context failure, not missing date math.",
        "Validation Service output is only available if an appeal/draft was generated — check STAGE D above.",
      ],
      failing_stage: "Issue Analysis (rule/keyword activation) + Fact-gap question selection (asking notice-visible ANSWER facts)",
      not_failing: "Document AI extraction itself for this Euro notice",
    },
    null,
    2,
  ),
);
