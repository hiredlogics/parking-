/**
 * Generic issue engine — ONE engine driven by Admin configuration.
 *
 * Replaces overlapping route candidacy / analysis route ranking /
 * requirements.ts as the authority for "what is active" and "what fact
 * is still missing" when USE_ADMIN_ISSUE_ENGINE is enabled (default on).
 *
 * Every decision that varies by issue — when it applies, when it does
 * not, which fact it needs and when that fact is actually needed — is
 * data (`issues.applicability_json` / `exclusion_json`,
 * `issue_required_facts.required_when` / `skip_when`), evaluated by the
 * generic condition tree in lib/rules/conditions.ts. This file contains
 * no per-issue TypeScript branch: adding a new issue, or changing when
 * an existing one applies, is a database row, not an edit here.
 *
 * Three things remain code, deliberately, and are documented at each
 * site below because they are platform mechanics, not legal decisions:
 *   - projecting the notice's free-text allegation into circumstance
 *     tags (an NLP-style classification input, like OCR — it proposes,
 *     it never decides);
 *   - a same-fact synonym fold for two historical spellings of one
 *     grace-period answer (data hygiene, not a rule);
 *   - a `trigger_tags` OR-match fallback for any issue an admin has not
 *     yet given a structured `applicability_json` (so an unmigrated
 *     issue degrades to its old behaviour instead of disappearing).
 */
import { loadServiceGraph, type ServiceGraph } from "@/lib/config/adminRepo";
import { ensureAdminConfigSeeded } from "@/lib/config/seedAdminConfig";
import type { KnownFacts } from "@/lib/questions/types";
import { FACT, factStr } from "@/lib/questions/facts";
import { hasDb } from "@/lib/db/pool";
import { classifyAllegation } from "@/lib/reasoning/allegation";
import { evaluateCondition, type ConditionTrace } from "@/lib/rules/conditions";
import {
  applyFactDefaults,
  BUILT_IN_FACT_DEFAULTS,
  type AppliedDefault,
  type FactDefaultRule,
} from "@/lib/rules/factDefaults";
import type { RouteFamily } from "@/types/caseState";

export interface ActiveIssue {
  code: string;
  label: string;
  moduleIds: string[];
  /** Condition leaves that decided applicability, for the admin debug view. */
  trace: ConditionTrace[];
}

export interface MissingFact {
  factKey: string;
  reasonCode: string | null;
  issueCode: string;
  priority: number;
  evidenceTypes: string[];
  /** Strengthens the appeal but never blocks sufficiency/payment. */
  optional?: boolean;
}

export interface IssueEngineResult {
  serviceCode: string;
  activeIssues: ActiveIssue[];
  missingFacts: MissingFact[];
  /** Next fact to ask (lowest priority among missing, required first). */
  nextFact: MissingFact | null;
  /** Module IDs applicable from active issues. */
  applicableModuleIds: string[];
  sufficient: boolean;
  origin: "admin_config";
  /** Defaults applied this evaluation, with provenance — never silent. */
  appliedDefaults: AppliedDefault[];
}

/**
 * Vocabulary alignment between the allegation classifier's route
 * families and issue codes. This is not a legal decision — it does not
 * decide whether a ground applies, only which admin-configured issue an
 * allegation-derived tag is visible to. The decision itself stays in
 * each issue's `applicability_json`.
 */
const ROUTE_TO_ISSUE_CODE: Partial<Record<RouteFamily, string[]>> = {
  PAYMENT: ["PAYMENT_KEYING"],
  KEYING: ["PAYMENT_KEYING"],
  CONSIDERATION: ["CONSIDERATION"],
  GRACE: ["GRACE"],
  ANPR: ["ANPR"],
  AUTHORIZATION: ["AUTHORISATION"],
  PERMIT: ["AUTHORISATION"],
  BREAKDOWN: ["BREAKDOWN"],
  RESIDENTIAL: ["RESIDENTIAL"],
  SIGNAGE: ["SIGNAGE"],
  EQUALITY: ["EQUALITY"],
  POFA: ["POFA"],
};

/** Two historical spellings of one grace-period answer. Data hygiene, not a rule. */
const FACT_KEY_SYNONYMS: Record<string, string[]> = {
  [FACT.EXIT_DELAY_REASON]: [FACT.DEPARTURE_DELAY],
  [FACT.DEPARTURE_DELAY]: [FACT.EXIT_DELAY_REASON],
};

function isEmptyCondition(c: unknown): boolean {
  if (c == null) return true;
  if (typeof c === "object" && !Array.isArray(c) && Object.keys(c).length === 0) {
    return true;
  }
  return false;
}

function factResolved(facts: KnownFacts, factKey: string): boolean {
  const check = (key: string): boolean => {
    const v = facts.values[key];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  };
  if (check(factKey)) return true;
  for (const alias of FACT_KEY_SYNONYMS[factKey] ?? []) {
    if (check(alias)) return true;
  }
  return false;
}

/**
 * Case-insensitive substring match — the generic fallback used only
 * when an issue has no `applicability_json` yet, so it behaves as it
 * always did (tag-triggered) rather than going dark mid-migration.
 */
function tagsMatchTrigger(tags: Set<string>, trigger: string): boolean {
  const tl = trigger.toLowerCase();
  if (tags.has(tl)) return true;
  if (tl.length < 4) return false;
  for (const tag of tags) {
    if (tag.includes(tl)) return true;
    if (tag.length >= 4 && tl.includes(tag)) return true;
  }
  return false;
}

/**
 * Project the notice's free-text allegation onto synthetic tags
 * (`allegation:<issue_code>`), merged alongside the customer's own
 * circumstance tags. This is an input to applicability, never a
 * decision: an issue whose applicability condition only looks at real
 * circumstance tags (e.g. RESIDENTIAL, AUTHORISATION) is unaffected —
 * it simply never references the allegation tags, which is how
 * "unauthorised parking" on a hospital notice stops short of a
 * residential-lease interview until the customer names circumstances.
 */
function allegationTags(facts: KnownFacts): Set<string> {
  const breach = factStr(facts, FACT.ALLEGED_BREACH);
  if (!breach) return new Set();
  const { routes } = classifyAllegation(breach);
  const tags = new Set<string>();
  for (const route of routes) {
    for (const code of ROUTE_TO_ISSUE_CODE[route] ?? []) {
      tags.add(`allegation:${code.toLowerCase()}`);
    }
  }
  return tags;
}

function toFactDefaultRule(row: ServiceGraph["factDefaults"][number]): FactDefaultRule {
  return {
    id: row.id,
    factKey: row.factKey,
    condition: row.condition,
    defaultValue: row.defaultValue,
    reasonCode: row.reasonCode,
    priority: row.priority,
  };
}

/**
 * Evaluate active issues and missing material facts from Admin config.
 */
export async function evaluateIssues(input: {
  serviceCode?: string;
  facts: KnownFacts;
  evidenceTypes?: string[];
}): Promise<IssueEngineResult> {
  await ensureAdminConfigSeeded();
  const serviceCode = input.serviceCode ?? "PRIVATE_PARKING_INITIAL_APPEAL";
  const graph = await loadServiceGraph(serviceCode);
  if (!graph) {
    return {
      serviceCode,
      activeIssues: [],
      missingFacts: [],
      nextFact: null,
      applicableModuleIds: [],
      sufficient: false,
      origin: "admin_config",
      appliedDefaults: [],
    };
  }

  const evidence = new Set(input.evidenceTypes ?? []);
  const baseFacts: KnownFacts = {
    ...input.facts,
    tags: new Set([...input.facts.tags, ...allegationTags(input.facts)]),
    evidence,
  };

  const defaultRules =
    (graph.factDefaults?.length ?? 0) > 0
      ? graph.factDefaults.map(toFactDefaultRule)
      : BUILT_IN_FACT_DEFAULTS;
  const { facts, applied } = applyFactDefaults(baseFacts, defaultRules);

  const activeIssues: ActiveIssue[] = [];
  const missingFacts: MissingFact[] = [];

  for (const issue of graph.issues) {
    const isTriage = issue.code === "TRIAGE_SCOPE";

    let matched = true;
    let trace: ConditionTrace[] = [];
    if (!isTriage) {
      if (!isEmptyCondition(issue.applicabilityCondition)) {
        const r = evaluateCondition(issue.applicabilityCondition, facts);
        matched = r.matched;
        trace = r.trace;
      } else {
        /*
         * Not yet migrated to a structured condition — old tag
         * behaviour, and deliberately against the customer's own
         * circumstance tags only, never the allegation-derived ones.
         * An issue that should also open from the notice's stated
         * allegation says so explicitly in `applicability_json`
         * (`{any: [{tag: "residential"}, {tag: "allegation:..."}]}`) —
         * an unmigrated issue defaults to the safer, narrower match
         * rather than silently inheriting allegation-permissiveness.
         */
        matched = issue.triggerTags.some((t) =>
          tagsMatchTrigger(input.facts.tags, t),
        );
      }
      if (matched && !isEmptyCondition(issue.exclusionCondition)) {
        const ex = evaluateCondition(issue.exclusionCondition, facts);
        if (ex.matched) {
          matched = false;
          trace = [...trace, ...ex.trace];
        }
      }
    }

    if (!matched) continue;

    activeIssues.push({
      code: issue.code,
      label: issue.label,
      moduleIds: issue.knowledge.map((k) => k.moduleId),
      trace,
    });

    for (const f of issue.facts) {
      if (factResolved(facts, f.factKey)) continue;

      if (!isEmptyCondition(f.requiredWhen)) {
        const required = evaluateCondition(f.requiredWhen, facts).matched;
        if (!required) continue;
      }
      if (!isEmptyCondition(f.skipWhen)) {
        const skip = evaluateCondition(f.skipWhen, facts).matched;
        if (skip) continue;
      }
      if (f.evidenceTypes.length > 0 && f.evidenceTypes.some((e) => evidence.has(e))) {
        continue;
      }

      missingFacts.push({
        factKey: f.factKey,
        reasonCode: f.reasonCode,
        issueCode: issue.code,
        priority: f.priority + issue.sortOrder,
        evidenceTypes: f.evidenceTypes,
        optional: f.optional,
      });
    }
  }

  missingFacts.sort((a, b) => {
    const ao = a.optional === true;
    const bo = b.optional === true;
    if (ao !== bo) return ao ? 1 : -1;
    return a.priority - b.priority;
  });
  const nextFact = missingFacts[0] ?? null;
  const applicableModuleIds = [...new Set(activeIssues.flatMap((i) => i.moduleIds))];
  const requiredMissing = missingFacts.filter((m) => m.optional !== true);

  return {
    serviceCode,
    activeIssues: activeIssues.filter((i) => i.code !== "TRIAGE_SCOPE"),
    missingFacts,
    nextFact,
    applicableModuleIds,
    sufficient:
      requiredMissing.length === 0 &&
      activeIssues.some((i) => i.code !== "TRIAGE_SCOPE"),
    origin: "admin_config",
    appliedDefaults: applied,
  };
}

/** Feature flag — default ON when a database is configured. */
export function isAdminIssueEngineEnabled(): boolean {
  if (!hasDb()) return false;
  const v = process.env.USE_ADMIN_ISSUE_ENGINE;
  if (v === "0" || v === "false") return false;
  return true;
}
