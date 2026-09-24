import type { ConfirmedPcn, EvidenceItem } from "@/types";
import type { AnswerMap } from "@/lib/facts/types";
import {
  toLegacyAnswers,
  type EstablishedPofaDefects,
} from "@/lib/facts/toLegacyAnswers";
import { FACT } from "@/lib/facts/facts";
import { evaluate } from "@/rules/engine";
import { assembleAppeal } from "@/lib/assembly";
import { getEffectiveParagraphs, getEffectiveRules } from "@/lib/appealLogic";
import { RULES } from "@/rules";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import { isGraceGroundSupportable } from "@/lib/appeals/graceSupport";
import { withoutRedundantParagraphs } from "@/lib/appeals/paragraphSelection";

/**
 * Enrich adaptive answers from uploaded evidence so the Master Pack
 * rules fire even when the questionnaire stopped early (e.g. hire/lease
 * soft-path) but the customer still uploaded a payment receipt.
 */
function enrichAnswersFromEvidence(
  answers: AnswerMap,
  evidenceTypes: string[],
  identifiedTags: readonly string[] = [],
): AnswerMap {
  const next: AnswerMap = { ...answers };
  const types = new Set(evidenceTypes.map((t) => t.toLowerCase()));

  // Product default: keeper appeals. Missing answer must not blank the intro.
  if (next[FACT.REGISTERED_KEEPER] == null) {
    next[FACT.REGISTERED_KEEPER] = "YES";
  }
  if (next[FACT.DRIVER_IDENTIFIED] == null) {
    next[FACT.DRIVER_IDENTIFIED] = "NO";
  }

  /*
   * Situation tags Case Intelligence identified.
   *
   * These are derived inside deriveKnownFacts — from evidence types and
   * from the customer's own free-text account — and written to
   * facts.values[FACT.SCENARIOS], NOT back into the answer map. This
   * function only ever saw the raw answer map, so core.scenarios arrived
   * empty and every scenario-gated rule silently failed to match. That
   * is the second half of the fallback blindness: the first was the
   * established PoFA findings.
   *
   * Unioned, never overriding, for the same reason deriveKnownFacts
   * unions them: a tag is a line of enquiry being open, and a
   * customer's own selection must not be narrowed by a derivation.
   */
  const scenarios = new Set<string>([
    ...(Array.isArray(next[FACT.SCENARIOS])
      ? (next[FACT.SCENARIOS] as string[])
      : []),
    ...identifiedTags,
  ]);

  const hasPaymentEvidence =
    types.has("payment_receipt") ||
    types.has("payment") ||
    types.has("receipt") ||
    next[FACT.PAYMENT_EVIDENCE] === "YES";

  if (hasPaymentEvidence) {
    scenarios.add("payment_made");
    next[FACT.PAYMENT_EVIDENCE] = "YES";
    if (next[FACT.PAYMENT_MADE] == null) next[FACT.PAYMENT_MADE] = "YES";
  }

  if (types.has("permit") || types.has("authorisation")) {
    scenarios.add("authorised_or_permit");
  }
  if (types.has("signage_photo") || types.has("signage")) {
    scenarios.add("signage_issue");
  }

  next[FACT.SCENARIOS] = Array.from(scenarios);
  return next;
}

/**
 * Build the appeal letter from the Master Pack rules engine + approved
 * paragraph library — not free AI prose.
 *
 * Used as the primary letter body for case generation so PDFs always
 * contain PP-INTRO / grounds / closing paragraphs driven by answers.
 */
export async function buildRulesBasedLetter(input: {
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  evidenceTypes?: string[];
  /**
   * PoFA defects the analysis established. Omitting these does not
   * merely lose a paragraph — it loses the ground, because the timing
   * rules key on them. See EstablishedPofaDefects.
   */
  establishedPofa?: EstablishedPofaDefects;
  /**
   * Situation tags the fact layer identified (`KnownFacts.tags`). Passed
   * in rather than re-derived so both drafting paths select grounds from
   * one set of identified facts.
   */
  identifiedTags?: readonly string[];
}): Promise<{
  body: string;
  paragraphs: Array<{ id: string; text: string }>;
  matchedParagraphIds: string[];
  activeRoutes: string[];
  keeperSafe: boolean;
  warnings: string[];
}> {
  const evidenceTypes = input.evidenceTypes ?? [];
  const enriched = enrichAnswersFromEvidence(
    input.answers,
    evidenceTypes,
    input.identifiedTags ?? [],
  );
  const legacy = toLegacyAnswers(
    enriched,
    input.confirmed,
    input.establishedPofa,
  );
  const evidence: EvidenceItem[] = evidenceTypes.map((type, i) => ({
    id: `ev_${i}`,
    type: type as EvidenceItem["type"],
    fileName: type,
    mimeType: "application/octet-stream",
    sizeBytes: 0,
    storageKey: "",
    uploadedAt: new Date().toISOString(),
  }));

  let rules = RULES;
  let paragraphs = PARAGRAPH_LIBRARY;
  try {
    rules = await getEffectiveRules();
    paragraphs = await getEffectiveParagraphs();
  } catch {
    // Fall back to compiled pack if DB overrides are unavailable.
  }

  const evaluation = evaluate(
    {
      pcn: input.confirmed,
      answers: legacy,
      evidence,
    },
    rules,
  );

  // Hard suppress grace paragraphs when the recorded stay contradicts
  // end-of-parking grace (e.g. multi-hour ANPR window).
  const graceOk = isGraceGroundSupportable({
    totalRecordedDurationMinutes: input.confirmed.total_recorded_duration ?? null,
    entryTime: input.confirmed.entry_time ?? null,
    exitTime: input.confirmed.exit_time ?? null,
    exitDelayReason:
      typeof enriched[FACT.EXIT_DELAY_REASON] === "string"
        ? (enriched[FACT.EXIT_DELAY_REASON] as string)
        : null,
    allegedOverstayMinutes: legacy.branch.grace?.alleged_overstay_minutes ?? null,
    gracePeriodApplicable: legacy.branch.grace?.grace_period_applicable ?? null,
  });
  if (!graceOk.ok) {
    evaluation.matchedParagraphIds = evaluation.matchedParagraphIds.filter(
      (id) => !id.startsWith("PP-GRACE-"),
    );
    evaluation.activeRoutes = evaluation.activeRoutes.filter(
      (r) => r !== "GRACE_ROUTE",
    );
  }

  // One conclusion per letter, using the same suppression the AI path
  // applies to its block list. See lib/appeals/paragraphSelection.ts.
  evaluation.matchedParagraphIds = withoutRedundantParagraphs(
    evaluation.matchedParagraphIds,
    (id) => id,
  );

  const assembled = assembleAppeal(
    input.confirmed,
    legacy,
    evidence,
    evaluation,
    paragraphs,
  );

  return {
    body: assembled.body,
    paragraphs: assembled.paragraphs.map((p) => ({ id: p.id, text: p.text })),
    matchedParagraphIds: evaluation.matchedParagraphIds,
    activeRoutes: evaluation.activeRoutes,
    keeperSafe: assembled.keeperSafe,
    warnings: assembled.warnings,
  };
}

/** Too short to be a real appeal letter (blocks admin approve of "sdk"). */
export function isAppealBodyTooThin(body: string | null | undefined): boolean {
  const text = (body ?? "").trim();
  if (text.length < 120) return true;
  const paras = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paras.length < 2;
}
