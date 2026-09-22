/**
 * Generic issue engine — ONE engine driven by Admin configuration.
 *
 * Replaces overlapping route candidacy / analysis route ranking /
 * requirements.ts as the authority for "what is active" and "what fact
 * is still missing" when USE_ADMIN_ISSUE_ENGINE is enabled (default on).
 *
 * Legacy engines remain in the repo but are no longer called from the
 * live questioning path once this module is wired.
 */
import { loadServiceGraph } from "@/lib/config/adminRepo";
import { ensureAdminConfigSeeded } from "@/lib/config/seedAdminConfig";
import type { KnownFacts } from "@/lib/questions/types";
import { FACT, factStr } from "@/lib/questions/facts";
import { hasDb } from "@/lib/db/pool";
import { classifyAllegation } from "@/lib/reasoning/allegation";
import type { RouteFamily } from "@/types/caseState";

export interface ActiveIssue {
  code: string;
  label: string;
  moduleIds: string[];
}

export interface MissingFact {
  factKey: string;
  reasonCode: string | null;
  issueCode: string;
  priority: number;
  evidenceTypes: string[];
}

export interface IssueEngineResult {
  serviceCode: string;
  activeIssues: ActiveIssue[];
  missingFacts: MissingFact[];
  /** Next fact to ask (lowest priority among missing). */
  nextFact: MissingFact | null;
  /** Module IDs applicable from active issues. */
  applicableModuleIds: string[];
  sufficient: boolean;
  origin: "admin_config";
}

function scenarioTags(facts: KnownFacts): Set<string> {
  const tags = new Set<string>();
  const scenarios = facts.values[FACT.SCENARIOS];
  if (Array.isArray(scenarios)) {
    for (const s of scenarios) {
      if (typeof s === "string") tags.add(s.toLowerCase());
    }
  }
  // Also include KnownFacts.tags if present
  if (facts.tags) {
    for (const t of facts.tags) tags.add(String(t).toLowerCase());
  }
  return tags;
}

/**
 * Prefer exact scenario-tag matches; allow short admin tokens like
 * "anpr" to match "anpr_disputed".
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

function factResolved(facts: KnownFacts, factKey: string): boolean {
  const v = facts.values[factKey];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  // "not sure" style answers still count as answered for journey progress
  return true;
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
  const serviceCode =
    input.serviceCode ?? "PRIVATE_PARKING_INITIAL_APPEAL";
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
    };
  }

  const tags = scenarioTags(input.facts);
  const evidence = new Set(input.evidenceTypes ?? []);
  const allegationRoutes = new Set<RouteFamily>(
    classifyAllegation(factStr(input.facts, FACT.ALLEGED_BREACH)).routes,
  );

  /** Map issue codes / labels onto allegation-opened route families. */
  const issueMatchesAllegation = (code: string, label: string): boolean => {
    const hay = `${code} ${label}`.toUpperCase();
    for (const route of allegationRoutes) {
      if (hay.includes(route)) return true;
      // Common admin codes: GRACE_PERIOD, PAYMENT_KEYING, etc.
      if (route === "PAYMENT" && /PAY|KEYING/.test(hay)) return true;
      if (route === "AUTHORIZATION" && /AUTHOR|PERMIT/.test(hay)) return true;
      if (route === "CONSIDERATION" && /CONSIDER/.test(hay)) return true;
    }
    return false;
  };

  const activeIssues: ActiveIssue[] = [];
  const missingFacts: MissingFact[] = [];

  for (const issue of graph.issues) {
    // TRIAGE_SCOPE always active until its facts are complete
    const isTriage = issue.code === "TRIAGE_SCOPE";
    const tagHit = issue.triggerTags.some((t) => tagsMatchTrigger(tags, t));
    const allegationHit =
      !isTriage && issueMatchesAllegation(issue.code, issue.label);

    // Activate from customer circumstances OR notice allegation.
    // Do not require a scenario tag when the notice itself opens the route.
    if (!isTriage && !tagHit && !allegationHit) continue;

    if (isTriage || tagHit || allegationHit) {
      activeIssues.push({
        code: issue.code,
        label: issue.label,
        moduleIds: issue.knowledge.map((k) => k.moduleId),
      });

      for (const f of issue.facts) {
        if (factResolved(input.facts, f.factKey)) continue;
        if (
          f.evidenceTypes.length > 0 &&
          f.evidenceTypes.some((e) => evidence.has(e))
        ) {
          continue;
        }
        missingFacts.push({
          factKey: f.factKey,
          reasonCode: f.reasonCode,
          issueCode: issue.code,
          priority: f.priority + issue.sortOrder,
          evidenceTypes: f.evidenceTypes,
        });
      }
    }
  }

  // If scenarios answered but no issue matched, still surface scenarios as done
  // and mark insufficient so admin/manual path can review.
  missingFacts.sort((a, b) => a.priority - b.priority);
  const nextFact = missingFacts[0] ?? null;
  const applicableModuleIds = [
    ...new Set(activeIssues.flatMap((i) => i.moduleIds)),
  ];

  return {
    serviceCode,
    activeIssues: activeIssues.filter((i) => i.code !== "TRIAGE_SCOPE"),
    missingFacts,
    nextFact,
    applicableModuleIds,
    sufficient: missingFacts.length === 0 && activeIssues.some((i) => i.code !== "TRIAGE_SCOPE"),
    origin: "admin_config",
  };
}

/** Feature flag — default ON when a database is configured. */
export function isAdminIssueEngineEnabled(): boolean {
  if (!hasDb()) return false;
  const v = process.env.USE_ADMIN_ISSUE_ENGINE;
  if (v === "0" || v === "false") return false;
  return true;
}
