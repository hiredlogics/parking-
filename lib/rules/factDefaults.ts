/**
 * Fact defaults — controlled, provenanced assumptions.
 *
 * "Registered keeper, driver not identified" is the product default: a
 * customer who uploads a Notice to Keeper is asking as the keeper, and
 * asking whether they can name the driver is itself the thing PoFA
 * keeper-safety exists to avoid inviting. Applying that as a silent
 * fact — indistinguishable from something the document or the customer
 * actually established — is exactly the failure mode client feedback
 * flagged, so this module keeps the two separate everywhere:
 *
 *   REAL fact   source DOCUMENT or ANSWER — established, no caveat.
 *   DEFAULT     source SYSTEM_SAFE_DEFAULT — provisional, and dropped
 *               the moment a real value contradicts it.
 *
 * Defaults are admin data (`fact_defaults`), evaluated by the same
 * generic condition tree as issue applicability — adding a new default
 * is a row, not a branch in facts.ts/bank.ts/issueEngine.ts (which is
 * where this exact default lived four separate times before).
 */
import type { KnownFacts } from "@/lib/questions/types";
import { evaluateCondition } from "@/lib/rules/conditions";

export const SYSTEM_SAFE_DEFAULT = "SYSTEM_SAFE_DEFAULT" as const;

export interface FactDefaultRule {
  id: string;
  factKey: string;
  /** null = always applies (subject to the fact not already being known). */
  condition: unknown;
  defaultValue: unknown;
  reasonCode: string;
  priority: number;
}

export interface AppliedDefault {
  defaultId: string;
  factKey: string;
  value: unknown;
  reasonCode: string;
}

export interface FactDefaultResult {
  /** Facts with defaults merged in. Never overwrites an already-known fact. */
  facts: KnownFacts;
  /** Which defaults fired, for Case Intelligence's fact provenance. */
  applied: AppliedDefault[];
}

function isKnown(facts: KnownFacts, key: string): boolean {
  const v = facts.values[key];
  if (v === undefined || v === null || v === "") return false;
  if (Array.isArray(v) && v.length === 0) return false;
  return true;
}

/**
 * Apply configured defaults to a case's facts.
 *
 * Never overwrites a real value — a default only fills a gap. Rules are
 * applied in priority order so a later default can rely on an earlier
 * one's result within the same pass (e.g. a jurisdiction default that
 * only fires once a location default has already been applied).
 */
export function applyFactDefaults(
  facts: KnownFacts,
  rules: FactDefaultRule[],
): FactDefaultResult {
  const values = { ...facts.values };
  const known = new Set(facts.known);
  const applied: AppliedDefault[] = [];

  const ordered = [...rules].sort((a, b) => a.priority - b.priority);
  const working: KnownFacts = { ...facts, values, known };

  for (const rule of ordered) {
    if (isKnown(working, rule.factKey)) continue;
    if (rule.condition != null) {
      const result = evaluateCondition(rule.condition, working);
      if (!result.matched) continue;
    }
    values[rule.factKey] = rule.defaultValue as KnownFacts["values"][string];
    known.add(rule.factKey);
    applied.push({
      defaultId: rule.id,
      factKey: rule.factKey,
      value: rule.defaultValue,
      reasonCode: rule.reasonCode,
    });
  }

  return { facts: working, applied };
}

/**
 * Statutory-product fallback used when the database has no configured
 * defaults yet (fresh install, or DB unavailable) — the same two
 * defaults that were previously hard-coded in rulesLetter.ts, now
 * expressed as data so the *first* place they exist is config, not
 * code. Seeded into `fact_defaults` on first admin config seed; this
 * export exists so a no-DB path (tests, offline dev) still behaves
 * identically rather than asking two unnecessary questions.
 */
export const BUILT_IN_FACT_DEFAULTS: FactDefaultRule[] = [
  {
    id: "builtin_registered_keeper",
    factKey: "registered_keeper",
    condition: null,
    defaultValue: "YES",
    reasonCode: SYSTEM_SAFE_DEFAULT,
    priority: 10,
  },
  {
    id: "builtin_driver_identified",
    factKey: "driver_identified",
    condition: null,
    defaultValue: "NO",
    reasonCode: SYSTEM_SAFE_DEFAULT,
    priority: 10,
  },
  {
    id: "builtin_jurisdiction_from_location",
    factKey: "jurisdiction",
    condition: { fact: "parking_location", op: "exists" },
    defaultValue: "ENGLAND_WALES",
    reasonCode: SYSTEM_SAFE_DEFAULT,
    priority: 20,
  },
];
