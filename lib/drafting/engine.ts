import type { ConfirmedPcn } from "@/types";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { transformToKeeperSafe, validateKeeperSafe } from "@/lib/keeperSafe";
import { getDraftingProvider } from "@/services/ai/drafting";
import { TransportError } from "@/services/ai/transport";
import type { DraftResult, DraftingContext } from "@/services/ai/types";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { AnswerMap } from "@/lib/facts/types";
import {
  establishedPofaDefects,
  toLegacyAnswers,
} from "@/lib/facts/toLegacyAnswers";
import { withoutRedundantParagraphs } from "@/lib/appeals/paragraphSelection";
import { buildVariableMap } from "@/lib/variables";

export const DRAFTING_ENGINE_VERSION = "drafting-v1";

/**
 * Bespoke appeal drafting orchestration.
 *
 * analyse -> retrieve -> draft -> post-process
 *
 * Model output is treated as UNTRUSTED. Before a draft may be used it is:
 *   1. stripped of any leaked module / block / source / rule identifier,
 *   2. stripped of markdown, headings and list markers,
 *   3. stripped of a salutation or sign-off the template supplies,
 *   4. passed through the keeper-safe transformations (V2 Part 11),
 *   5. re-validated for residual driver-identifying wording,
 *   6. checked for unresolved template variables.
 *
 * A keeper-safety failure at step 5 BLOCKS the draft. That is the
 * non-negotiable rule and it is enforced here as well as in the
 * independent validator pass.
 */

export interface DraftAppealInput {
  /**
   * Attributes the provider call to a case for cost reporting.
   *
   * Without it the drafting spend — the largest single component of an
   * appeal — is written to `ai_usage` with a null case and never
   * appears in `getCaseAIUsage`, so per-appeal cost silently excludes
   * it.
   */
  caseId?: string | null;
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  evidenceTypes?: string[];
  evidenceRefs?: string[];
  /** Reuse a prior analysis instead of recomputing. */
  analysis?: IssueAnalysis;
  /**
   * Case Intelligence for this case — the technical grounds found from
   * the document before questioning. Passed through to the model so the
   * letter opens knowing what the notice already shows.
   */
  intelligence?: import("@/lib/cases/caseIntelligence").CaseIntelligence | null;
  /** Validator feedback from a rejected attempt, for regeneration. */
  feedback?: string;
  /**
   * Module ids the grounds judge selected, from
   * lib/generation/engine.ts. When set, retrieval retains exactly these
   * and skips the two filters the judge supersedes. Absent means the
   * deterministic path decided.
   */
  judgeSelection?: string[];
  /** Canonical catalog from loadKbCatalog() — required in production. */
  modules?: import("@/lib/kb/types").KbModule[];
  sources?: import("@/lib/kb/types").LegalSource[];
  blocks?: import("@/lib/kb/types").DraftingBlock[];
  /**
   * Issues the engine identified for this case, from the ground gate.
   *
   * The drafter previously received route families and a module list
   * and had to infer the grounds back out of them. The issue codes are
   * what the admin configuration actually decided, so passing them
   * removes a guess from the most important step.
   */
  activeIssues?: string[];
  /** Active issues that describe the parking event, not just procedure. */
  substantiveIssues?: string[];
  /** Required facts still unresolved — the model must not invent these. */
  outstandingFacts?: string[];
}

export interface DraftAppealResult {
  ok: boolean;
  /** Post-processed letter body, safe to render. Null when blocked. */
  body: string | null;
  /** Resolved variable values, reused by the validation pass. */
  variables: Record<string, string>;
  analysis: IssueAnalysis;
  draft: DraftResult | null;
  /** Identifiers that leaked and were removed. */
  strippedIdentifiers: string[];
  keeperSafe: boolean;
  keeperSafeViolations: Array<{ label: string; excerpt: string }>;
  appliedTransformations: string[];
  unresolvedVariables: string[];
  warnings: string[];
  blockedReason: string | null;
  engineVersion: string;
}

/** Identifier shapes that must never reach a customer document. */
const IDENTIFIER_PATTERNS: RegExp[] = [
  /\bKB-[A-Z]+-\d+\b/g,
  /\bPP-[A-Z]+-\d+[A-Z]?\b/g,
  /\bAI-[A-Z]+-\d+\b/g,
  /\bPP-R\d+\b/g,
  /\bSRC-[A-Z0-9-]+\b/g,
  /\bVAL-[A-Z]+\b/g,
  /\bCODE-[A-Z0-9-]+\b/g,
];

export async function draftAppeal(
  input: DraftAppealInput,
): Promise<DraftAppealResult> {
  // Copied, not aliased: in `llm` mode the judge rewrites primaryRoute
  // and secondaryRoutes, and a caller that passed its own analysis in
  // must not find it mutated underneath.
  const analysis: IssueAnalysis = {
    ...(input.analysis ??
      analyseCase({
        confirmed: input.confirmed,
        answers: input.answers,
        evidenceTypes: input.evidenceTypes ?? [],
        evidenceRefs: input.evidenceRefs ?? [],
        pofaConfig: await loadPofaConfig(),
      })),
  };

  const warnings: string[] = [];

  // Variable values come from the confirmed notice via the existing
  // variable builder, so the adaptive flow and the legacy pipeline
  // resolve placeholders identically. Computed up front so every return
  // path can hand them to the validation pass.
  // The established PoFA findings travel with the legacy map here too,
  // so the rules basis handed to the model reflects the same grounds the
  // rules letter would assemble.
  const legacy = toLegacyAnswers(
    input.answers,
    input.confirmed,
    establishedPofaDefects({
      timingStatus: input.analysis?.pofa.timingStatus,
      noticeRoute: input.confirmed.notice_route,
    }),
  );
  const variables = buildVariableMap(input.confirmed, legacy) as Record<
    string,
    string
  >;

  // Never draft a case that must go to a human.
  if (analysis.manualReview) {
    return {
      ok: false,
      body: null,
      variables,
      analysis,
      draft: null,
      strippedIdentifiers: [],
      keeperSafe: true,
      keeperSafeViolations: [],
      appliedTransformations: [],
      unresolvedVariables: [],
      warnings,
      blockedReason: `MANUAL_REVIEW:${analysis.manualReview.reason}`,
      engineVersion: DRAFTING_ENGINE_VERSION,
    };
  }

  const facts = factsForCase({
    confirmed: input.confirmed,
    answers: input.answers,
    evidenceTypes: input.evidenceTypes ?? [],
  });

  /*
   * `judgeSelection` is decided upstream in lib/generation/engine.ts,
   * which is where the grounds judge runs. It is threaded through rather
   * than re-judged here so the modules this function drafts from are
   * exactly the ones the validation pass and the release checklist see —
   * this engine and the orchestrator both retrieve, and a judge running
   * in only one of them would let the two diverge silently.
   */
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: input.confirmed.parking_event_date ?? null,
    evidenceTypes: input.evidenceTypes ?? [],
    modules: input.modules,
    sources: input.sources,
    blocks: input.blocks,
    judgeSelection: input.judgeSelection,
  });

  if (retrieval.modules.length === 0) {
    // AI can still draft from Master Pack rules basis alone.
    warnings.push(
      "No KB modules matched; drafting will rely on Master Pack rules basis.",
    );
  }

  const { buildRulesPromptBasis } = await import("@/lib/appeals/rulesPromptBasis");
  const rulesBasis = await buildRulesPromptBasis({
    confirmed: input.confirmed,
    answers: input.answers,
    evidenceTypes: input.evidenceTypes ?? [],
  });

  /*
   * Semantic ranking over the KB modules retrieveKnowledge() already
   * approved for this case — never a second, independent authority.
   * Replaces the old in-memory vector store, which indexed
   * `rules/rules.ts` alongside the KB catalog and so could hand the
   * drafting prompt a rule the new declarative engine had never
   * approved. `eligibleModuleIds` is exactly retrieval.modules, so a
   * pgvector hit can only ever re-rank what already passed the rule
   * filter — it can never reintroduce a rejected module.
   */
  let ragRules: { texts: string[]; ids: string[] } | undefined;
  try {
    const { buildCaseRagQuery } = await import("@/lib/rag/retrieveRules");
    const { rankKbModulesBySimilarity } = await import(
      "@/lib/retrieval/semanticRank"
    );
    const circumstanceTags = Array.isArray(
      (input.answers as Record<string, unknown>)?.scenarios,
    )
      ? ((input.answers as Record<string, unknown>).scenarios as string[])
      : [];
    const query = buildCaseRagQuery({
      allegedBreach: input.confirmed.alleged_breach,
      operatorName: input.confirmed.operator_name,
      routes: [
        analysis.primaryRoute,
        ...analysis.secondaryRoutes,
      ].filter(Boolean) as string[],
      circumstanceTags,
      findings: (input.intelligence?.technicalFindings ?? [])
        .filter((f) => f.status === "IDENTIFIED")
        .map((f) => f.ground),
    });
    const hits = await rankKbModulesBySimilarity({
      query,
      eligibleModuleIds: retrieval.modules.map((m) => m.moduleId),
      topK: 8,
    });
    ragRules = { texts: hits.map((h) => h.content), ids: hits.map((h) => h.moduleId) };
    if (ragRules.texts.length > 0) {
      warnings.push(
        `Semantic ranking surfaced ${ragRules.texts.length} approved KB chunk(s) via pgvector.`,
      );
    }
  } catch (err) {
    warnings.push(
      `Semantic ranking skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (
    retrieval.modules.length === 0 &&
    rulesBasis.approvedParagraphTexts.length === 0
  ) {
    return {
      ok: false,
      body: null,
      variables,
      analysis,
      draft: null,
      strippedIdentifiers: [],
      keeperSafe: true,
      keeperSafeViolations: [],
      appliedTransformations: [],
      unresolvedVariables: [],
      warnings,
      blockedReason: "NO_APPROVED_MODULES",
      engineVersion: DRAFTING_ENGINE_VERSION,
    };
  }

  const ci = input.intelligence ?? null;
  /*
   * Same redundant-conclusion suppression the rules path applies, on the
   * same shared table. Both paths draw on one paragraph library, so a
   * duplicate pair left in here would fail validation on this path while
   * passing on the other — which is how the two paths diverged before.
   */
  const draftingBlocks = withoutRedundantParagraphs(
    retrieval.blocks,
    (b) => b.blockId,
  );

  const context: DraftingContext = {
    caseId: input.caseId ?? null,
    analysis,
    modules: retrieval.modules,
    blocks: draftingBlocks,
    sources: retrieval.sources,
    variables,
    availableEvidence: input.evidenceTypes ?? [],
    activeIssues: input.activeIssues ?? [],
    substantiveIssues: input.substantiveIssues ?? [],
    feedback: input.feedback,
    rulesBasis,
    ragRules,
    intelligence: ci
      ? {
          documentType: ci.documentUnderstanding?.documentType ?? null,
          sender: ci.documentUnderstanding?.sender ?? null,
          operator: ci.documentUnderstanding?.operator ?? null,
          stage: ci.documentUnderstanding?.stage ?? null,
          noticeRoute: ci.documentUnderstanding?.noticeRoute ?? null,
          technicalFindings: ci.technicalFindings
            .filter((f) => f.status === "IDENTIFIED")
            .map((f) => ({
              ground: f.ground,
              confidence: f.confidence,
              evidence: f.evidence,
              reasons: f.reasons,
            })),
          knowledgeRefs: ci.knowledgeRefs,
          outstandingFacts: ci.missingFacts,
        }
      : undefined,
  };

  /*
   * The payload audit.
   *
   * Logged immediately before the provider call, so what the model was
   * given is recoverable from the logs without reproducing the case.
   * The generic-letter investigation cost a day precisely because this
   * did not exist: the letter was visible and its input was not.
   *
   * Counts and identifiers only — no fact VALUES and no prose. This
   * line goes to ordinary server logs, which are not a lawful home for
   * a keeper's name, address or the free text they typed.
   */
  console.info(
    [
      "[drafting] payload",
      `case=${input.caseId ?? "-"}`,
      `CASE FACTS SENT=${context.analysis.verifiedFacts.filter((f) => !f.field.startsWith("__")).length}`,
      `ISSUES SENT=[${(input.activeIssues ?? []).join(",") || "none"}]`,
      `SUBSTANTIVE=[${(input.substantiveIssues ?? []).join(",") || "none"}]`,
      `KNOWLEDGE MODULES SENT=[${context.modules.map((m) => m.moduleId).join(",") || "none"}]`,
      `BLOCKS SENT=${context.blocks.length}`,
      `EVIDENCE SENT=[${context.availableEvidence.join(",") || "none"}]`,
      `MISSING FACTS=[${(input.outstandingFacts ?? []).join(",") || "none"}]`,
      `allegation=${context.variables.alleged_breach ? "present" : "ABSENT"}`,
      `pofa=${context.analysis.pofa.timingStatus}`,
      `primary=${context.analysis.primaryRoute ?? "none"}`,
    ].join(" "),
  );

  const provider = getDraftingProvider();
  let draft: DraftResult;
  try {
    draft = await provider.draft(context);
  } catch (err) {
    return {
      ok: false,
      body: null,
      variables,
      analysis,
      draft: null,
      strippedIdentifiers: [],
      keeperSafe: true,
      keeperSafeViolations: [],
      appliedTransformations: [],
      unresolvedVariables: [],
      warnings: [
        ...warnings,
        err instanceof Error ? err.message : "Drafting provider failed.",
      ],
      /*
       * Transport and content failures are labelled differently.
       * A UAT batch reported a dead socket as a zero-module
       * MANUAL_REVIEW, which was indistinguishable from a knowledge
       * failure and sent the investigation to the wrong layer.
       */
      blockedReason:
        err instanceof TransportError
          ? "DRAFTING_TRANSPORT_FAILED"
          : "DRAFTING_FAILED",
      engineVersion: DRAFTING_ENGINE_VERSION,
    };
  }

  warnings.push(...draft.warnings);
  if (!draft.bespoke) {
    warnings.push(
      "Output is not bespoke prose; the V2 bespoke-drafting criterion is not met by this provider.",
    );
  }

  // ---- Post-processing ----
  const { text: cleaned, stripped } = stripIdentifiers(draft.body);
  if (stripped.length > 0) {
    warnings.push(
      `Removed ${stripped.length} internal identifier(s) that leaked into the draft.`,
    );
  }

  const normalised = normaliseProse(cleaned);
  const { text: safeText, appliedMappings } = transformToKeeperSafe(normalised);
  const safety = validateKeeperSafe(safeText);
  const unresolved = findUnresolvedVariables(safeText);

  if (!safety.ok) {
    return {
      ok: false,
      body: null,
      variables,
      analysis,
      draft,
      strippedIdentifiers: stripped,
      keeperSafe: false,
      keeperSafeViolations: safety.violations,
      appliedTransformations: appliedMappings,
      unresolvedVariables: unresolved,
      warnings,
      blockedReason: "KEEPER_SAFETY_FAILED",
      engineVersion: DRAFTING_ENGINE_VERSION,
    };
  }

  if (unresolved.length > 0) {
    return {
      ok: false,
      body: null,
      variables,
      analysis,
      draft,
      strippedIdentifiers: stripped,
      keeperSafe: true,
      keeperSafeViolations: [],
      appliedTransformations: appliedMappings,
      unresolvedVariables: unresolved,
      warnings,
      blockedReason: "UNRESOLVED_VARIABLES",
      engineVersion: DRAFTING_ENGINE_VERSION,
    };
  }

  return {
    ok: true,
    body: safeText,
    variables,
    analysis,
    draft,
    strippedIdentifiers: stripped,
    keeperSafe: true,
    keeperSafeViolations: [],
    appliedTransformations: appliedMappings,
    unresolvedVariables: [],
    warnings,
    blockedReason: null,
    engineVersion: DRAFTING_ENGINE_VERSION,
  };
}

export function stripIdentifiers(text: string): {
  text: string;
  stripped: string[];
} {
  const stripped: string[] = [];
  let out = text;
  for (const re of IDENTIFIER_PATTERNS) {
    const rx = new RegExp(re.source, re.flags);
    const found = out.match(rx);
    if (found) stripped.push(...found);
    out = out.replace(rx, "");
  }
  // Tidy the punctuation and spacing an excision can leave behind.
  out = out
    .replace(/\(\s*[,;]?\s*\)/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([,.;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
  return { text: out, stripped: [...new Set(stripped)] };
}

/**
 * Remove formatting the letter template owns: markdown, headings, list
 * markers, salutations and sign-offs.
 */
export function normaliseProse(text: string): string {
  const lines = text.split(/\r?\n/);
  const kept: string[] = [];

  for (const raw of lines) {
    let line = raw.trim();
    if (line.length === 0) {
      kept.push("");
      continue;
    }
    // Markdown emphasis and headings.
    line = line.replace(/^#{1,6}\s*/, "");
    line = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
    // Bullet and numbered list markers.
    line = line.replace(/^[-*•]\s+/, "");
    line = line.replace(/^\d+[.)]\s+/, "");
    // Salutation / sign-off supplied by the document template.
    if (/^dear\b/i.test(line)) continue;
    if (/^(yours\s+(faithfully|sincerely)|kind\s+regards|regards|sincerely)\b/i.test(line)) {
      continue;
    }
    if (/^the\s+registered\s+keeper\.?$/i.test(line)) continue;
    if (/^(subject|re)\s*:/i.test(line)) continue;
    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function findUnresolvedVariables(text: string): string[] {
  const found = text.match(/\{\{[a-z_]+\}\}/gi) ?? [];
  return [...new Set(found.map((v) => v.replace(/[{}]/g, "")))];
}
