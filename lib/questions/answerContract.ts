import { QUESTION_BANK } from "./bank";
import type { QuestionType } from "./types";

/**
 * The answer contract for a fact.
 *
 * WHY THIS EXISTS
 * ---------------
 * A live case put this question to a customer:
 *
 *   "Are you the registered keeper of the vehicle?"  [Yes] [No]
 *
 * The model had generated it as `type: "boolean"`, so the browser sent
 * `true`. Recording it failed with "Invalid option(s): true", and the
 * journey dead-ended — the customer could not answer at all.
 *
 * The validator was not the real problem. `registered_keeper` has a
 * canonical value space of "YES" / "NO" / "UNSURE", because that is what
 * every consumer compares against:
 *
 *   scope.ts        keeper === "NO"
 *   requirements.ts is(f, FACT.REGISTERED_KEEPER, "YES")
 *
 * Storing `true` there would have silently broken scope gating and route
 * candidacy even if it had been accepted. The requirement map declared
 * which facts each route needs, but never what an answer to them is
 * allowed to look like — so nothing stopped a generated question from
 * using a different value space to the rest of the system.
 *
 * The question bank already encodes the canonical vocabulary for every
 * enumerated fact, and it is controlled data that ships with the
 * application. It is therefore the source of truth here, rather than a
 * second hand-maintained list that could drift away from it.
 */

/** Choice types, where option values are the answer value space. */
const CHOICE_TYPES: QuestionType[] = [
  "single_choice",
  "multi_choice",
  "evidence_upload",
];

export function isChoiceType(type: QuestionType): boolean {
  return CHOICE_TYPES.includes(type);
}

function buildValueSpaces(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();

  for (const def of QUESTION_BANK) {
    /*
     * Only single-fact questions. When one question establishes several
     * facts, its options cannot be attributed to any one of them.
     */
    if (def.establishesFacts.length !== 1) continue;
    if (!def.options || def.options.length === 0) continue;
    if (!isChoiceType(def.type)) continue;

    const fact = def.establishesFacts[0];
    const values = map.get(fact) ?? new Set<string>();
    for (const opt of def.options) values.add(opt.value);
    map.set(fact, values);
  }

  return map;
}

let cached: Map<string, Set<string>> | null = null;

function valueSpaces(): Map<string, Set<string>> {
  if (!cached) cached = buildValueSpaces();
  return cached;
}

/**
 * The canonical values a fact accepts, or null when it is free-form
 * (a registration mark, a date, a count).
 *
 * Returns a copy: the caller must not be able to widen the vocabulary
 * of the shared contract.
 */
export function canonicalValuesFor(fact: string): string[] | null {
  const values = valueSpaces().get(fact);
  return values ? [...values].sort() : null;
}

/** Does this fact have a fixed vocabulary that answers must come from? */
export function hasFixedVocabulary(fact: string): boolean {
  return valueSpaces().has(fact);
}

/**
 * Check a generated question against its fact's answer contract.
 *
 * Returns null when acceptable, otherwise an explanation suitable for
 * regeneration feedback.
 */
export function checkAnswerContract(
  fact: string,
  type: QuestionType,
  options: Array<{ value: string }> | undefined,
): string | null {
  const canonical = canonicalValuesFor(fact);
  if (!canonical) return null;

  if (!isChoiceType(type)) {
    return `"${fact}" is answered with one of ${canonical
      .map((v) => `"${v}"`)
      .join(", ")}, so the question must be single_choice or multi_choice — not ${type}. A boolean answer would be stored as true/false and every downstream check compares against the string values.`;
  }

  const allowed = new Set(canonical);
  const offered = (options ?? []).map((o) => o.value);
  const invalid = offered.filter((v) => !allowed.has(v));
  if (invalid.length > 0) {
    return `Option value(s) ${invalid
      .map((v) => `"${v}"`)
      .join(", ")} are not part of the value space for "${fact}". Use only: ${canonical
      .map((v) => `"${v}"`)
      .join(", ")}.`;
  }

  if (offered.length === 0) {
    return `"${fact}" needs options drawn from: ${canonical
      .map((v) => `"${v}"`)
      .join(", ")}.`;
  }

  return null;
}

/**
 * Coerce an answer into its fact's canonical vocabulary.
 *
 * The validator now stops the model inventing a value space, but two
 * cases still reach here with the wrong shape:
 *
 *   - a case whose pending question was persisted before that rule
 *     existed, which must not be left permanently unanswerable;
 *   - any client that sends `true` for a question rendered as Yes/No.
 *
 * Storing `true` under `registered_keeper` would not fail loudly — it
 * would read as unset to `is(f, FACT.REGISTERED_KEEPER, "YES")` and
 * quietly change which routes the case can take. Normalising here means
 * what lands in the answer map is always what the reasoning layer
 * expects, whatever shape the question was asked in.
 *
 * Anything that cannot be mapped is returned untouched, so an
 * unrecognised value still fails validation rather than being guessed
 * into something plausible.
 */
export function normaliseAnswerValue<T>(fact: string, value: T): T | string {
  const canonical = canonicalValuesFor(fact);
  if (!canonical) return value;
  const allowed = new Set(canonical);

  if (typeof value === "boolean") {
    const mapped = value ? "YES" : "NO";
    return allowed.has(mapped) ? mapped : value;
  }

  if (typeof value === "string") {
    if (allowed.has(value)) return value;
    // "yes" -> "YES", " No " -> "NO"
    const upper = value.trim().toUpperCase();
    if (allowed.has(upper)) return upper;
    if (upper === "TRUE" && allowed.has("YES")) return "YES";
    if (upper === "FALSE" && allowed.has("NO")) return "NO";
  }

  return value;
}

/** Reset the derived contract — tests only. */
export function resetAnswerContracts(): void {
  cached = null;
}
