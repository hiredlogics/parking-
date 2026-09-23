/**
 * Declarative condition model — the one place applicability is decided.
 *
 * Business and legal applicability ("when does this issue apply?", "when
 * is this fact required?", "when may this knowledge be used?") is
 * Admin-managed data stored as JSONB, not TypeScript. This module is the
 * evaluator for that data: generic, total, and free of any issue-specific
 * branch. Adding PAYMENT, ANPR, GRACE, POFA or a brand-new ground needs
 * a row, not a deploy.
 *
 * Three hard properties, because admins edit this live:
 *
 *   TOTAL      evaluation never throws. A malformed node is `false` with
 *              a recorded reason, so one bad edit cannot take the engine
 *              down mid-journey.
 *   VALIDATED  `validateCondition` runs at save time so the malformed
 *              node is rejected at the editor instead of failing silently
 *              on a live case.
 *   TRACEABLE  every evaluation returns the leaves that decided it, which
 *              is what feeds claim traceability and the admin debug view.
 *
 * An absent fact is `false`, never an error: facts arrive progressively
 * as the customer answers, so "not yet known" is a normal state.
 */
import type { KnownFacts } from "@/lib/questions/types";

/** Comparison operators available to a leaf condition. */
export const FACT_OPERATORS = [
  "eq",
  "neq",
  "in",
  "nin",
  "exists",
  "absent",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "truthy",
  "falsy",
] as const;

export type FactOperator = (typeof FACT_OPERATORS)[number];

export const NUMERIC_OPERATORS = ["gt", "gte", "lt", "lte", "eq", "neq"] as const;
export type NumericOperator = (typeof NUMERIC_OPERATORS)[number];

export type Condition =
  /** All children must match. An empty list matches (neutral element). */
  | { all: Condition[] }
  /** Any child must match. An empty list does not match. */
  | { any: Condition[] }
  | { not: Condition }
  /** Compare a case fact. */
  | { fact: string; op: FactOperator; value?: unknown }
  /** A customer circumstance tag is present. */
  | { tag: string }
  /** An evidence type is on the case. */
  | { evidence: string }
  /**
   * Whole days between two date facts, `to` minus `from`.
   * Lets timing rules (PoFA windows, grace periods) be configured
   * rather than coded.
   */
  | {
      daysBetween: { from: string; to: string };
      op: NumericOperator;
      value: number;
    }
  /** Always matches. Useful for an unconditional issue. */
  | { always: true };

export interface ConditionTrace {
  /** Human-readable leaf, e.g. `notice_route eq POSTAL`. */
  leaf: string;
  matched: boolean;
}

export interface EvalResult {
  matched: boolean;
  /** Leaves evaluated, in order, for traceability. */
  trace: ConditionTrace[];
  /** Malformed nodes encountered. Empty on well-formed configuration. */
  errors: string[];
}

/* ------------------------------------------------------------------ */
/* Value helpers                                                       */
/* ------------------------------------------------------------------ */

function factValue(facts: KnownFacts, key: string): unknown {
  return facts.values?.[key];
}

function isAbsent(v: unknown): boolean {
  if (v === undefined || v === null || v === "") return true;
  if (Array.isArray(v) && v.length === 0) return true;
  return false;
}

/** Case-insensitive scalar comparison; arrays compare by membership. */
function looseEquals(a: unknown, b: unknown): boolean {
  if (Array.isArray(a)) return a.some((x) => looseEquals(x, b));
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  if (typeof a === "boolean" || typeof b === "boolean") {
    return toBool(a) === toBool(b);
  }
  if (typeof a === "number" || typeof b === "number") {
    const na = toNum(a);
    const nb = toNum(b);
    if (na !== null && nb !== null) return na === nb;
  }
  return a === b;
}

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["yes", "true", "1", "y"].includes(s)) return true;
    if (["no", "false", "0", "n"].includes(s)) return false;
  }
  if (typeof v === "number") return v !== 0;
  return null;
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Parse an ISO `YYYY-MM-DD` (or ISO datetime) as a UTC date. */
function toDate(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

const MS_PER_DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Evaluation                                                          */
/* ------------------------------------------------------------------ */

function fmt(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(fmt).join(",")}]`;
  if (v === null) return "null";
  if (v === undefined) return "—";
  return String(v);
}

function compare(
  op: FactOperator,
  actual: unknown,
  expected: unknown,
): boolean {
  switch (op) {
    case "exists":
      return !isAbsent(actual);
    case "absent":
      return isAbsent(actual);
    case "truthy":
      return toBool(actual) === true;
    case "falsy":
      return toBool(actual) === false;
    case "eq":
      return looseEquals(actual, expected);
    case "neq":
      // An unknown fact is not evidence of inequality — it is unknown.
      return !isAbsent(actual) && !looseEquals(actual, expected);
    case "in":
      return (
        Array.isArray(expected) && expected.some((e) => looseEquals(actual, e))
      );
    case "nin":
      return (
        !isAbsent(actual) &&
        Array.isArray(expected) &&
        !expected.some((e) => looseEquals(actual, e))
      );
    case "contains": {
      if (Array.isArray(actual)) {
        return actual.some((x) => looseEquals(x, expected));
      }
      if (typeof actual === "string" && typeof expected === "string") {
        return actual.toLowerCase().includes(expected.toLowerCase());
      }
      return false;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNum(actual);
      const b = toNum(expected);
      if (a !== null && b !== null) return numeric(op, a, b);
      // Fall back to date ordering so date facts are comparable too.
      const da = toDate(actual);
      const db = toDate(expected);
      if (da && db) return numeric(op, da.getTime(), db.getTime());
      return false;
    }
    default:
      return false;
  }
}

function numeric(op: string, a: number, b: number): boolean {
  switch (op) {
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    case "eq":
      return a === b;
    case "neq":
      return a !== b;
    default:
      return false;
  }
}

/**
 * Evaluate a condition tree against the case facts.
 *
 * Never throws. Unrecognised shapes do not match and are reported in
 * `errors` so the admin screen can surface a broken rule rather than
 * letting it quietly govern live cases.
 */
export function evaluateCondition(
  condition: unknown,
  facts: KnownFacts,
): EvalResult {
  const trace: ConditionTrace[] = [];
  const errors: string[] = [];
  const matched = walk(condition, facts, trace, errors, 0);
  return { matched, trace, errors };
}

/** Depth cap: configuration is data, and data can be cyclic by mistake. */
const MAX_DEPTH = 12;

function walk(
  node: unknown,
  facts: KnownFacts,
  trace: ConditionTrace[],
  errors: string[],
  depth: number,
): boolean {
  if (depth > MAX_DEPTH) {
    errors.push(`condition nested deeper than ${MAX_DEPTH} levels`);
    return false;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`not a condition object: ${fmt(node)}`);
    return false;
  }
  const c = node as Record<string, unknown>;

  if ("always" in c) return c.always === true;

  if ("all" in c) {
    if (!Array.isArray(c.all)) {
      errors.push("`all` must be an array");
      return false;
    }
    // Every child is evaluated, not short-circuited: the trace is the
    // explanation shown to an admin, and a partial one is misleading.
    let ok = true;
    for (const child of c.all) {
      if (!walk(child, facts, trace, errors, depth + 1)) ok = false;
    }
    return ok;
  }

  if ("any" in c) {
    if (!Array.isArray(c.any)) {
      errors.push("`any` must be an array");
      return false;
    }
    let ok = false;
    for (const child of c.any) {
      if (walk(child, facts, trace, errors, depth + 1)) ok = true;
    }
    return ok;
  }

  if ("not" in c) {
    return !walk(c.not, facts, trace, errors, depth + 1);
  }

  if ("tag" in c) {
    const tag = String(c.tag ?? "").toLowerCase();
    const m = facts.tags?.has(tag) ?? false;
    trace.push({ leaf: `tag ${tag}`, matched: m });
    return m;
  }

  if ("evidence" in c) {
    const ev = String(c.evidence ?? "").toLowerCase();
    const m = facts.evidence?.has(ev) ?? false;
    trace.push({ leaf: `evidence ${ev}`, matched: m });
    return m;
  }

  if ("daysBetween" in c) {
    const spec = c.daysBetween as { from?: unknown; to?: unknown } | null;
    const fromKey = String(spec?.from ?? "");
    const toKey = String(spec?.to ?? "");
    const op = String(c.op ?? "") as NumericOperator;
    const want = toNum(c.value);
    if (!fromKey || !toKey || want === null) {
      errors.push("daysBetween needs from, to, op and a numeric value");
      return false;
    }
    if (!(NUMERIC_OPERATORS as readonly string[]).includes(op)) {
      errors.push(`daysBetween operator not supported: ${op}`);
      return false;
    }
    const a = toDate(factValue(facts, fromKey));
    const b = toDate(factValue(facts, toKey));
    if (!a || !b) {
      trace.push({
        leaf: `days(${fromKey}→${toKey}) unknown`,
        matched: false,
      });
      return false;
    }
    const days = Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
    const m = numeric(op, days, want);
    trace.push({
      leaf: `days(${fromKey}→${toKey})=${days} ${op} ${want}`,
      matched: m,
    });
    return m;
  }

  if ("fact" in c) {
    const key = String(c.fact ?? "");
    const op = String(c.op ?? "eq") as FactOperator;
    if (!key) {
      errors.push("fact condition needs a fact key");
      return false;
    }
    if (!(FACT_OPERATORS as readonly string[]).includes(op)) {
      errors.push(`operator not supported: ${op}`);
      return false;
    }
    const actual = factValue(facts, key);
    const m = compare(op, actual, c.value);
    const shown =
      op === "exists" || op === "absent" || op === "truthy" || op === "falsy"
        ? `${key} ${op} (is ${fmt(actual)})`
        : `${key} ${op} ${fmt(c.value)} (is ${fmt(actual)})`;
    trace.push({ leaf: shown, matched: m });
    return m;
  }

  errors.push(`unrecognised condition: ${Object.keys(c).join(",")}`);
  return false;
}

/* ------------------------------------------------------------------ */
/* Validation (save time)                                              */
/* ------------------------------------------------------------------ */

export interface ConditionValidation {
  ok: boolean;
  errors: string[];
}

/**
 * Structural check for a condition tree, run before an admin edit is
 * stored. Keeps a malformed rule out of the database rather than
 * discovering it on a live case.
 *
 * `knownFactKeys`, when supplied, turns an unrecognised fact key into an
 * error — a typo in a fact key is the most likely way to configure a
 * rule that silently never fires.
 */
export function validateCondition(
  node: unknown,
  knownFactKeys?: Iterable<string>,
): ConditionValidation {
  const errors: string[] = [];
  const known = knownFactKeys ? new Set(knownFactKeys) : null;
  check(node, errors, known, 0, "$");
  return { ok: errors.length === 0, errors };
}

function check(
  node: unknown,
  errors: string[],
  known: Set<string> | null,
  depth: number,
  path: string,
): void {
  if (depth > MAX_DEPTH) {
    errors.push(`${path}: nested deeper than ${MAX_DEPTH} levels`);
    return;
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    errors.push(`${path}: expected a condition object`);
    return;
  }
  const c = node as Record<string, unknown>;
  const keys = Object.keys(c);

  if (keys.includes("always")) {
    if (c.always !== true) errors.push(`${path}.always: must be true`);
    return;
  }

  for (const group of ["all", "any"] as const) {
    if (keys.includes(group)) {
      const arr = c[group];
      if (!Array.isArray(arr)) {
        errors.push(`${path}.${group}: must be an array`);
        return;
      }
      if (arr.length === 0) {
        errors.push(`${path}.${group}: must not be empty`);
      }
      arr.forEach((child, i) =>
        check(child, errors, known, depth + 1, `${path}.${group}[${i}]`),
      );
      return;
    }
  }

  if (keys.includes("not")) {
    check(c.not, errors, known, depth + 1, `${path}.not`);
    return;
  }

  if (keys.includes("tag")) {
    if (typeof c.tag !== "string" || !c.tag.trim()) {
      errors.push(`${path}.tag: must be a non-empty string`);
    }
    return;
  }

  if (keys.includes("evidence")) {
    if (typeof c.evidence !== "string" || !c.evidence.trim()) {
      errors.push(`${path}.evidence: must be a non-empty string`);
    }
    return;
  }

  if (keys.includes("daysBetween")) {
    const spec = c.daysBetween as { from?: unknown; to?: unknown } | null;
    for (const side of ["from", "to"] as const) {
      const v = spec?.[side];
      if (typeof v !== "string" || !v.trim()) {
        errors.push(`${path}.daysBetween.${side}: must be a fact key`);
      } else if (known && !known.has(v)) {
        errors.push(`${path}.daysBetween.${side}: unknown fact "${v}"`);
      }
    }
    if (!(NUMERIC_OPERATORS as readonly string[]).includes(String(c.op))) {
      errors.push(
        `${path}.op: must be one of ${NUMERIC_OPERATORS.join(", ")}`,
      );
    }
    if (typeof c.value !== "number" || !Number.isFinite(c.value)) {
      errors.push(`${path}.value: must be a number of days`);
    }
    return;
  }

  if (keys.includes("fact")) {
    const key = c.fact;
    if (typeof key !== "string" || !key.trim()) {
      errors.push(`${path}.fact: must be a non-empty fact key`);
    } else if (known && !known.has(key)) {
      errors.push(`${path}.fact: unknown fact "${key}"`);
    }
    const op = String(c.op ?? "eq");
    if (!(FACT_OPERATORS as readonly string[]).includes(op)) {
      errors.push(`${path}.op: must be one of ${FACT_OPERATORS.join(", ")}`);
      return;
    }
    const needsValue = !["exists", "absent", "truthy", "falsy"].includes(op);
    if (needsValue && c.value === undefined) {
      errors.push(`${path}.value: required for operator "${op}"`);
    }
    if ((op === "in" || op === "nin") && !Array.isArray(c.value)) {
      errors.push(`${path}.value: must be an array for operator "${op}"`);
    }
    return;
  }

  errors.push(
    `${path}: unrecognised condition keys (${keys.join(", ") || "none"})`,
  );
}

/* ------------------------------------------------------------------ */
/* Description (admin UI + audit)                                      */
/* ------------------------------------------------------------------ */

/**
 * Render a condition as one readable line, so an admin sees the rule in
 * words and the audit record stores it in words.
 */
export function describeCondition(node: unknown): string {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    return "(invalid condition)";
  }
  const c = node as Record<string, unknown>;
  if ("always" in c) return "always";
  if ("all" in c && Array.isArray(c.all)) {
    return c.all.length
      ? c.all.map(describeCondition).join(" AND ")
      : "always";
  }
  if ("any" in c && Array.isArray(c.any)) {
    return `(${c.any.map(describeCondition).join(" OR ")})`;
  }
  if ("not" in c) return `NOT ${describeCondition(c.not)}`;
  if ("tag" in c) return `circumstance "${String(c.tag)}"`;
  if ("evidence" in c) return `evidence "${String(c.evidence)}"`;
  if ("daysBetween" in c) {
    const s = c.daysBetween as { from?: unknown; to?: unknown };
    return `days from ${String(s?.from)} to ${String(s?.to)} ${String(c.op)} ${String(c.value)}`;
  }
  if ("fact" in c) {
    const op = String(c.op ?? "eq");
    if (["exists", "absent", "truthy", "falsy"].includes(op)) {
      return `${String(c.fact)} ${op}`;
    }
    return `${String(c.fact)} ${op} ${fmt(c.value)}`;
  }
  return "(invalid condition)";
}
