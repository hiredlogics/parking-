/**
 * Fact Gap Resolver — the missing half of the fact lifecycle.
 *
 * The issue engine already does the hard part. It decides which issues
 * a case raises and which facts those issues require, entirely from
 * admin configuration (`issues.applicability_json`,
 * `issue_required_facts`), and it computes `nextFact` on every single
 * evaluation — see lib/engine/issueEngine.ts.
 *
 * Until this file, nothing read `nextFact`. The gap was computed and
 * thrown away, so a real case arrived at drafting carrying only what
 * the notice happened to state, and retrieval's FACT_GATE then dropped
 * every module that needed a branch fact. That is the whole mechanism
 * behind one-module letters: not retrieval, not ranking, not the
 * judge — an unresolved fact gap.
 *
 * So this module resolves gaps rather than reporting them:
 *
 *   notice facts -> candidate issues -> required facts (admin config)
 *   -> compare known vs required -> ONE missing material fact
 *   -> question -> answer saved with provenance -> recalculate
 *
 * WHAT THIS IS NOT
 * ----------------
 * It is not the old adaptive questionnaire. That walked a hard-coded
 * question bank and asked whatever the bank held, which made a fixed
 * list the authority on case completeness. Here the authority is the
 * admin issue configuration, and nothing is asked that some active
 * issue does not require.
 *
 * It also never asks which appeal reason applies. The system decides
 * issues from the notice and the customer's own account of what
 * happened; `NEVER_ASK` below enforces that in code rather than
 * trusting configuration to stay correct.
 */
import type { AnswerMap, KnownFacts } from "@/lib/facts/types";
import { FACT } from "@/lib/facts/facts";
import { loadFactRegistry } from "@/lib/config/factRegistry";
import type { FactRegistryEntry } from "@/lib/facts/registry";
import {
  evaluateIssues,
  type IssueEngineResult,
  type MissingFact,
} from "@/lib/engine/issueEngine";

/**
 * Facts the customer must never be put to, whatever configuration says.
 *
 * `scenarios` is the multi-select list of appeal reasons. Asking it is
 * asking "which appeal reason applies?", which is the one question this
 * design exists to remove: the customer is not the lawyer, and a
 * customer guessing at legal grounds produced both wrong grounds and
 * the abandonment that came from a page full of legal jargon.
 *
 * It stays a real fact — module gates in lib/retrieval/gates.ts key on
 * its tags, and the allegation classifier and the customer's own
 * narrative both write it. It is simply never *asked*.
 *
 * This is a code-level guard, not a config value, for the same reason
 * `enforceJudgeVerdict` is code: a rule that must hold cannot be a row
 * that an admin can edit back into existence by accident.
 */
export const NEVER_ASK: ReadonlySet<string> = new Set<string>([
  FACT.SCENARIOS,
]);

/**
 * How many questions one case may ever be asked.
 *
 * An overstay notice legitimately opens ANPR, CONSIDERATION and GRACE
 * at once, which between them require thirteen facts. Asking thirteen
 * questions is how the original journey lost people. The issue engine
 * orders missing facts by priority (required before optional, lowest
 * priority first), so truncating takes the least valuable questions
 * away, never the load-bearing ones.
 *
 * A case that runs out of budget is not incomplete — it drafts on the
 * facts it has, exactly as a zero-question case does.
 */
export const QUESTION_BUDGET = 4;

/** Marker recorded once a fact has been put to the customer. */
export const ASKED_PREFIX = "__askedfact:";
export const askedFactKey = (factKey: string) => `${ASKED_PREFIX}${factKey}`;

/** Facts already put to this customer, answered or not. */
export function askedFacts(values: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const key of Object.keys(values)) {
    if (key.startsWith(ASKED_PREFIX)) out.add(key.slice(ASKED_PREFIX.length));
  }
  return out;
}

/** Everything a question needs, and deliberately nothing more. */
export interface FactGap {
  factKey: string;
  /** The issue that makes this fact material. */
  issueCode: string;
  issueLabel: string;
  /** Machine reason the fact is outstanding, from admin config. */
  reasonCode: string | null;
  /** Why it matters, from the fact registry. Never wording. */
  guidance: string | null;
  label: string;
  valueType: FactRegistryEntry["valueType"];
  /** Empty when the fact is free-form. */
  allowedValues: string[];
  /** Evidence that would settle this fact instead of an answer. */
  evidenceTypes: string[];
  /** Strengthens the appeal but never blocks payment. */
  optional: boolean;
}

export interface GapResolution {
  /** The one fact to ask next, or null when there is nothing to ask. */
  gap: FactGap | null;
  /** Issues currently active. The system decided these, not the customer. */
  activeIssues: { code: string; label: string }[];
  /** Every outstanding material fact, for measurement and admin view. */
  outstanding: MissingFact[];
  /** Questions already put to this case. */
  askedCount: number;
  /** Questions still permitted under the budget. */
  remainingBudget: number;
  /** Nothing material left worth asking. */
  complete: boolean;
  /** Module ids the active issues make available to retrieval. */
  applicableModuleIds: string[];
}

/**
 * Is this gap worth putting to a customer at all?
 *
 * A fact the notice or a document could supply, but a customer cannot,
 * is not a question — it is a missing document. Only registry source
 * ANSWER facts are askable; NOTICE, DOCUMENT and COMPUTED facts are
 * resolved by extraction, upload and arithmetic respectively, and
 * asking the customer to supply one invites them to guess at something
 * the case will then assert as fact.
 */
function isAskable(entry: FactRegistryEntry | undefined): boolean {
  if (!entry) return false;
  return entry.source === "ANSWER";
}

/**
 * Compare known facts against what the active issues require, and pick
 * the single highest-value gap left.
 *
 * Selection is entirely deterministic: admin priority order, filtered
 * by what is askable and permitted. No model chooses which fact to ask,
 * and no model decides whether a fact is still missing — a model that
 * could do either would be able to steer the case's grounds by
 * inventing or suppressing a gap.
 */
export async function resolveFactGap(input: {
  facts: KnownFacts;
  serviceCode?: string;
  evidenceTypes?: string[];
  /** Pre-computed evaluation, when the caller already has one. */
  evaluation?: IssueEngineResult;
}): Promise<GapResolution> {
  const evaluation =
    input.evaluation ??
    (await evaluateIssues({
      serviceCode: input.serviceCode,
      facts: input.facts,
      evidenceTypes: input.evidenceTypes,
    }));

  const alreadyAsked = askedFacts(input.facts.values);
  const registry = await loadFactRegistry();

  const activeIssues = evaluation.activeIssues.map((i) => ({
    code: i.code,
    label: i.label,
  }));
  const labelFor = new Map(activeIssues.map((i) => [i.code, i.label]));

  /*
   * Outstanding, after removing what must not or cannot be asked.
   *
   * `alreadyAsked` is filtered here rather than in the issue engine
   * because a customer may legitimately answer "I'm not sure", which
   * resolves nothing but must never cause the same question twice.
   */
  const askable = evaluation.missingFacts.filter((m) => {
    if (NEVER_ASK.has(m.factKey)) return false;
    if (alreadyAsked.has(m.factKey)) return false;
    return isAskable(registry.get(m.factKey));
  });

  const askedCount = alreadyAsked.size;
  const remainingBudget = Math.max(0, QUESTION_BUDGET - askedCount);

  const next = remainingBudget > 0 ? askable[0] : undefined;
  const entry = next ? registry.get(next.factKey) : undefined;

  const gap: FactGap | null =
    next && entry
      ? {
          factKey: next.factKey,
          issueCode: next.issueCode,
          issueLabel: labelFor.get(next.issueCode) ?? next.issueCode,
          reasonCode: next.reasonCode,
          guidance: entry.guidance,
          label: entry.label,
          valueType: entry.valueType,
          allowedValues: [...entry.allowedValues],
          evidenceTypes: next.evidenceTypes,
          optional: next.optional === true,
        }
      : null;

  return {
    gap,
    activeIssues,
    outstanding: askable,
    askedCount,
    remainingBudget,
    complete: gap === null,
    applicableModuleIds: evaluation.applicableModuleIds,
  };
}

/**
 * Record an answer, and mark the fact as asked.
 *
 * The asked marker is written whether or not a value came back, so a
 * declined question is never re-put. The value itself is validated
 * against the fact registry by `validateFactAnswer` before it reaches
 * here — this function does not decide whether a value is acceptable.
 */
export function applyFactAnswer(
  answers: AnswerMap,
  factKey: string,
  value: AnswerMap[string],
): AnswerMap {
  const next: AnswerMap = { ...answers, [askedFactKey(factKey)]: true };
  if (value !== null && value !== undefined && value !== "") {
    next[factKey] = value;
  }
  return next;
}

export interface FactAnswerValidation {
  ok: boolean;
  /** Normalised value to store. Undefined when the answer was declined. */
  value?: AnswerMap[string];
  message?: string;
}

/**
 * Validate a customer's answer against the fact vocabulary.
 *
 * An ENUM fact accepts only registry values. This matters more than
 * ordinary input hygiene: a stored value outside the vocabulary
 * silently stops matching its own module gates, so the fact would be
 * "known" and yet argue nothing.
 *
 * A blank answer is valid and means declined — the customer is allowed
 * not to know.
 */
export async function validateFactAnswer(
  factKey: string,
  raw: unknown,
): Promise<FactAnswerValidation> {
  if (NEVER_ASK.has(factKey)) {
    return { ok: false, message: "That fact is not collected from customers." };
  }
  const registry = await loadFactRegistry();
  const entry = registry.get(factKey);
  if (!isAskable(entry)) {
    return { ok: false, message: "That fact is not collected from customers." };
  }

  if (raw === null || raw === undefined || raw === "") return { ok: true };

  switch (entry!.valueType) {
    case "ENUM": {
      const v = String(raw).trim().toUpperCase();
      const allowed = entry!.allowedValues.map((a) => a.toUpperCase());
      if (!allowed.includes(v)) {
        return { ok: false, message: "Please choose one of the options." };
      }
      // Store the registry's own spelling, not the customer's casing.
      const canonical = entry!.allowedValues.find(
        (a) => a.toUpperCase() === v,
      )!;
      return { ok: true, value: canonical };
    }
    case "MULTI_ENUM": {
      const list = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const allowed = new Map(
        entry!.allowedValues.map((a) => [a.toUpperCase(), a]),
      );
      const out: string[] = [];
      for (const item of list) {
        const hit = allowed.get(item.trim().toUpperCase());
        if (!hit) return { ok: false, message: "Please choose from the options." };
        out.push(hit);
      }
      return { ok: true, value: out.length > 0 ? out : undefined };
    }
    case "BOOLEAN": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const v = String(raw).trim().toLowerCase();
      if (["yes", "true", "1"].includes(v)) return { ok: true, value: true };
      if (["no", "false", "0"].includes(v)) return { ok: true, value: false };
      return { ok: false, message: "Please answer yes or no." };
    }
    case "NUMBER": {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, message: "Please enter a number." };
      }
      return { ok: true, value: n };
    }
    default: {
      const v = String(raw).trim();
      if (v.length > 2_000) {
        return { ok: false, message: "That answer is too long." };
      }
      return { ok: true, value: v };
    }
  }
}
