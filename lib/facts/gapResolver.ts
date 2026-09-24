/**
 * Fact Gap Resolver — missing material facts from Case Intelligence.
 *
 * Authority is Case Intelligence (`missing_material_facts`), not the
 * allegation keyword → issue engine path. Document-established facts
 * are never asked.
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
import {
  applyDocumentImplications,
  isDocumentEstablished,
} from "@/lib/facts/documentImplications";
import type { CaseIntelligence } from "@/lib/cases/caseIntelligence";

/**
 * Facts the customer must never be put to, whatever configuration says.
 */
export const NEVER_ASK: ReadonlySet<string> = new Set<string>([
  FACT.SCENARIOS,
]);

export const QUESTION_BUDGET = 4;

export const ASKED_PREFIX = "__askedfact:";
export const askedFactKey = (factKey: string) => `${ASKED_PREFIX}${factKey}`;

export function askedFacts(values: Record<string, unknown>): Set<string> {
  const out = new Set<string>();
  for (const key of Object.keys(values)) {
    if (key.startsWith(ASKED_PREFIX)) out.add(key.slice(ASKED_PREFIX.length));
  }
  return out;
}

export interface FactGap {
  factKey: string;
  issueCode: string;
  issueLabel: string;
  reasonCode: string | null;
  guidance: string | null;
  label: string;
  valueType: FactRegistryEntry["valueType"];
  allowedValues: string[];
  evidenceTypes: string[];
  optional: boolean;
}

export interface GapResolution {
  gap: FactGap | null;
  activeIssues: { code: string; label: string }[];
  outstanding: MissingFact[];
  askedCount: number;
  remainingBudget: number;
  complete: boolean;
  applicableModuleIds: string[];
}

function isAskable(entry: FactRegistryEntry | undefined): boolean {
  if (!entry) return false;
  return entry.source === "ANSWER";
}

/**
 * Resolve the next fact gap from Case Intelligence when provided;
 * otherwise fall back to circumstance-tag issue engine (no allegation tags).
 */
export async function resolveFactGap(input: {
  facts: KnownFacts;
  serviceCode?: string;
  evidenceTypes?: string[];
  evaluation?: IssueEngineResult;
  caseIntelligence?: CaseIntelligence | null;
}): Promise<GapResolution> {
  const facts = applyDocumentImplications(input.facts);
  const alreadyAsked = askedFacts(facts.values);
  const registry = await loadFactRegistry();

  if (input.caseIntelligence) {
    const ci = input.caseIntelligence;
    const activeIssues = [
      ...ci.supported_grounds.map((g) => ({
        code: g.code,
        label: g.code,
      })),
      ...ci.unresolved_grounds.map((g) => ({
        code: g.code,
        label: g.code,
      })),
    ];

    const outstanding: MissingFact[] = [];
    for (const m of ci.missing_material_facts ?? []) {
      if (NEVER_ASK.has(m.factKey)) continue;
      if (alreadyAsked.has(m.factKey)) continue;
      if (isDocumentEstablished(facts, m.factKey)) continue;
      if (facts.known.has(m.factKey)) continue;
      if (!isAskable(registry.get(m.factKey))) continue;
      if (m.optional && (ci.supported_grounds?.length ?? 0) > 0) continue;

      outstanding.push({
        factKey: m.factKey,
        issueCode: m.groundCode,
        reasonCode: m.reasonCode,
        priority: m.priority,
        optional: m.optional,
        evidenceTypes: [],
      });
    }
    outstanding.sort((a, b) => a.priority - b.priority);

    const askedCount = alreadyAsked.size;
    const remainingBudget = Math.max(0, QUESTION_BUDGET - askedCount);
    const next = remainingBudget > 0 ? outstanding[0] : undefined;
    const entry = next ? registry.get(next.factKey) : undefined;

    const gap: FactGap | null =
      next && entry
        ? {
            factKey: next.factKey,
            issueCode: next.issueCode,
            issueLabel: next.issueCode,
            reasonCode: next.reasonCode,
            guidance: entry.guidance,
            label: entry.label,
            valueType: entry.valueType,
            allowedValues: [...entry.allowedValues],
            evidenceTypes: next.evidenceTypes,
            optional: next.optional === true,
          }
        : null;

    const moduleIds = [
      ...new Set([
        ...(ci.supported_grounds ?? []).flatMap((g) => g.knowledgeRefs),
        ...(ci.knowledgeRefs ?? []),
      ]),
    ];

    return {
      gap,
      activeIssues,
      outstanding,
      askedCount,
      remainingBudget,
      complete: gap === null,
      applicableModuleIds: moduleIds,
    };
  }

  const evaluation =
    input.evaluation ??
    (await evaluateIssues({
      serviceCode: input.serviceCode,
      facts,
      evidenceTypes: input.evidenceTypes,
    }));

  const activeIssues = evaluation.activeIssues.map((i) => ({
    code: i.code,
    label: i.label,
  }));
  const labelFor = new Map(activeIssues.map((i) => [i.code, i.label]));

  const askable = evaluation.missingFacts.filter((m) => {
    if (NEVER_ASK.has(m.factKey)) return false;
    if (alreadyAsked.has(m.factKey)) return false;
    if (isDocumentEstablished(facts, m.factKey)) return false;
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
  value?: AnswerMap[string];
  message?: string;
}

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
