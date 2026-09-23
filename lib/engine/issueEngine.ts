/**
 * Generic issue engine — ONE engine driven by Admin configuration.
 *
 * Replaces overlapping route candidacy / analysis route ranking /
 * requirements.ts as the authority for "what is active" and "what fact
 * is still missing" when USE_ADMIN_ISSUE_ENGINE is enabled (default on).
 *
 * Customer situation tags describe circumstances for questioning.
 * Notice allegations may open investigation routes, but must not force
 * residential / permit questionnaires when the customer has already
 * named different circumstances (e.g. grace only).
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

/**
 * Issues that need customer-reported circumstances (or prior answers)
 * before the notice allegation alone may force a questionnaire.
 *
 * "Unauthorised" / "no permit" on a hospital PCN must not drag someone
 * who only reported a grace/exit timing issue through a residential
 * lease interview.
 */
const CIRCUMSTANCE_LED_ISSUES = new Set([
  "RESIDENTIAL",
  "AUTHORISATION",
  "AUTHORIZATION",
  "PERMIT",
  "EQUALITY",
  "BREAKDOWN",
]);

function scenarioTags(facts: KnownFacts): Set<string> {
  const tags = new Set<string>();
  const scenarios = facts.values[FACT.SCENARIOS];
  if (Array.isArray(scenarios)) {
    for (const s of scenarios) {
      if (typeof s === "string") tags.add(s.toLowerCase());
    }
  }
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
  return true;
}

/** Grace exit-delay answers satisfy either seeded fact key. */
function graceDelayResolved(facts: KnownFacts): boolean {
  return (
    factResolved(facts, FACT.EXIT_DELAY_REASON) ||
    factResolved(facts, FACT.DEPARTURE_DELAY)
  );
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
  const scenariosAnswered = factResolved(input.facts, FACT.SCENARIOS);

  /** Map issue codes / labels onto allegation-opened route families. */
  const issueMatchesAllegation = (code: string, label: string): boolean => {
    const hay = `${code} ${label}`.toUpperCase();
    for (const route of allegationRoutes) {
      if (hay.includes(route)) return true;
      if (route === "PAYMENT" && /PAY|KEYING/.test(hay)) return true;
      if (route === "AUTHORIZATION" && /AUTHOR|PERMIT/.test(hay)) return true;
      if (route === "CONSIDERATION" && /CONSIDER/.test(hay)) return true;
      if (route === "GRACE" && /GRACE/.test(hay)) return true;
    }
    return false;
  };

  const activeIssues: ActiveIssue[] = [];
  const missingFacts: MissingFact[] = [];

  for (const issue of graph.issues) {
    const isTriage = issue.code === "TRIAGE_SCOPE";
    const tagHit = issue.triggerTags.some((t) => tagsMatchTrigger(tags, t));
    const matchesAllegation = issueMatchesAllegation(issue.code, issue.label);

    // Circumstance-led issues (AUTHORISATION / RESIDENTIAL / PERMIT / …)
    // activate only from customer circumstance tags — never from the
    // notice allegation alone before circumstances are known.
    const allegationHit =
      !isTriage &&
      matchesAllegation &&
      !CIRCUMSTANCE_LED_ISSUES.has(issue.code.toUpperCase());

    if (!isTriage && !tagHit && !allegationHit) continue;

    activeIssues.push({
      code: issue.code,
      label: issue.label,
      moduleIds: issue.knowledge.map((k) => k.moduleId),
    });

    for (const f of issue.facts) {
      if (f.factKey === FACT.SCENARIOS && scenariosAnswered) continue;

    // Jurisdiction: never ask when already resolved, or when the notice
    // already has a confirmed parking location (derived facts default it).
    if (f.factKey === FACT.JURISDICTION) {
      if (
        factResolved(input.facts, FACT.JURISDICTION) ||
        factStr(input.facts, FACT.JURISDICTION) ||
        factResolved(input.facts, FACT.PARKING_LOCATION)
      ) {
        continue;
      }
    }

      if (
        (f.factKey === FACT.DEPARTURE_DELAY ||
          f.factKey === FACT.EXIT_DELAY_REASON) &&
        graceDelayResolved(input.facts)
      ) {
        continue;
      }

      if (factResolved(input.facts, f.factKey)) continue;

      // No point asking where permission came from if none was held.
      if (
        f.factKey === FACT.PERMISSION_SOURCE &&
        factStr(input.facts, FACT.PERMISSION_HELD) === "NO"
      ) {
        continue;
      }

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
    sufficient:
      missingFacts.length === 0 &&
      activeIssues.some((i) => i.code !== "TRIAGE_SCOPE"),
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
