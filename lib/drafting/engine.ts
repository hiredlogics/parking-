import type { ConfirmedPcn } from "@/types";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { transformToKeeperSafe, validateKeeperSafe } from "@/lib/keeperSafe";
import { getDraftingProvider } from "@/services/ai/drafting";
import type { DraftResult, DraftingContext } from "@/services/ai/types";
import type { IssueAnalysis } from "@/lib/analysis/types";
import type { AnswerMap } from "@/lib/questions/types";
import { toLegacyAnswers } from "@/lib/questions/toLegacyAnswers";
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
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  evidenceTypes?: string[];
  evidenceRefs?: string[];
  /** Reuse a prior analysis instead of recomputing. */
  analysis?: IssueAnalysis;
  /** Validator feedback from a rejected attempt, for regeneration. */
  feedback?: string;
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
  const analysis =
    input.analysis ??
    analyseCase({
      confirmed: input.confirmed,
      answers: input.answers,
      evidenceTypes: input.evidenceTypes ?? [],
      evidenceRefs: input.evidenceRefs ?? [],
    });

  const warnings: string[] = [];

  // Variable values come from the confirmed notice via the existing
  // variable builder, so the adaptive flow and the legacy pipeline
  // resolve placeholders identically. Computed up front so every return
  // path can hand them to the validation pass.
  const legacy = toLegacyAnswers(input.answers);
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

  const retrieval = retrieveKnowledge({
    analysis,
    facts: factsForCase({
      confirmed: input.confirmed,
      answers: input.answers,
      evidenceTypes: input.evidenceTypes ?? [],
    }),
    parkingEventDate: input.confirmed.parking_event_date ?? null,
    evidenceTypes: input.evidenceTypes ?? [],
  });

  if (retrieval.modules.length === 0) {
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

  const context: DraftingContext = {
    analysis,
    modules: retrieval.modules,
    blocks: retrieval.blocks,
    sources: retrieval.sources,
    variables,
    availableEvidence: input.evidenceTypes ?? [],
    feedback: input.feedback,
  };

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
      blockedReason: "DRAFTING_FAILED",
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
