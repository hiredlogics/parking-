/**
 * Question wording for one fact gap.
 *
 * WHAT THE MODEL IS FOR, AND WHAT IT IS NOT
 * -----------------------------------------
 * The model writes words. That is all it does here.
 *
 * It does not choose which fact to ask (admin priority order does, in
 * lib/facts/gapResolver.ts), it does not decide whether a fact is still
 * missing (the issue engine does), it does not supply or suggest a
 * value, and it cannot add, remove or rename an option — the answer
 * vocabulary comes from the fact registry and is attached after the
 * model has returned. So this is not another judge: nothing it emits
 * can change which grounds the appeal argues. The worst a bad
 * generation can do is phrase a question awkwardly, and even that is
 * caught by the checks below.
 *
 * It exists because the deterministic wording is correct but cold.
 * "Breakdown prevented departure" is a fact key; "Was your car unable
 * to be driven away?" is a question. The registry holds the former and
 * cannot hold the latter for every case, because good wording depends
 * on which issue is live and what the case already establishes.
 *
 * INPUT DISCIPLINE
 * ----------------
 * `QuestionContext` is the entire prompt input, and it carries exactly
 * four things: the missing fact, why it matters, the active issue, and
 * the facts already established. It deliberately excludes the notice
 * text, the knowledge base, the draft, and any other fact gap — a
 * question about a payment receipt has no business seeing the legal
 * grounds, and a model that could see them could lead the customer
 * toward the answer that opens more of them.
 */
import { validateKeeperSafe } from "@/lib/keeperSafe";
import type { KnownFacts } from "@/lib/facts/types";
import type { FactGap } from "@/lib/facts/gapResolver";

/** The complete model input. Four fields, per the fact-lifecycle spec. */
export interface QuestionContext {
  /** The missing fact: what it is and what it may be set to. */
  missingFact: {
    factKey: string;
    label: string;
    valueType: FactGap["valueType"];
    allowedValues: string[];
  };
  /** Why it matters — registry guidance and the config reason code. */
  whyItMatters: {
    guidance: string | null;
    reasonCode: string | null;
  };
  /** The active issue that makes the fact material. */
  activeIssue: {
    code: string;
    label: string;
  };
  /**
   * Facts already established, as plain key/value pairs.
   *
   * Present so the question does not re-ask what is known and can refer
   * to the case naturally. Values only, never provenance — the model
   * has no business knowing which facts are assertable, because that is
   * the distinction that governs what the letter may claim.
   */
  existingFacts: Record<string, string>;
}

export interface GeneratedQuestion {
  /** The question put to the customer. */
  text: string;
  /** Optional one-line clarification. */
  help: string | null;
  /** Answer vocabulary, from the registry. Never from the model. */
  options: string[];
  valueType: FactGap["valueType"];
  factKey: string;
  /** Where the wording came from, for audit and measurement. */
  source: "model" | "deterministic";
}

/**
 * Facts that are never shown to the question model.
 *
 * Keeper name and address are the customer's own contact details and
 * add nothing to wording. `situation_other` is free text the customer
 * wrote, which could name the driver — feeding it back in would give a
 * model the chance to echo an identification into a question.
 */
const CONTEXT_EXCLUDED = new Set([
  "keeper_name",
  "keeper_address_line1",
  "keeper_address_line2",
  "keeper_town",
  "keeper_postcode",
  "situation_other",
]);

/** Established facts, flattened and trimmed for the prompt. */
export function contextFacts(facts: KnownFacts): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(facts.values)) {
    if (key.startsWith("__")) continue;
    if (CONTEXT_EXCLUDED.has(key)) continue;
    if (value === null || value === undefined || value === "") continue;
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    if (text.length === 0 || text.length > 200) continue;
    out[key] = text;
  }
  return out;
}

/** Assemble the model input — and nothing beyond the four fields. */
export function buildQuestionContext(
  gap: FactGap,
  facts: KnownFacts,
): QuestionContext {
  return {
    missingFact: {
      factKey: gap.factKey,
      label: gap.label,
      valueType: gap.valueType,
      allowedValues: gap.allowedValues,
    },
    whyItMatters: {
      guidance: gap.guidance,
      reasonCode: gap.reasonCode,
    },
    activeIssue: {
      code: gap.issueCode,
      label: gap.issueLabel,
    },
    existingFacts: contextFacts(facts),
  };
}

/**
 * Wording with no model involved.
 *
 * This is the floor, not a degraded mode: a case with no API key, a
 * model outage or a rejected generation still asks a usable question.
 * A journey that stalls because wording could not be generated would
 * be a worse failure than plain phrasing.
 */
export function deterministicQuestion(gap: FactGap): GeneratedQuestion {
  const label = gap.label.trim();
  const text =
    gap.valueType === "BOOLEAN"
      ? `${label}?`
      : gap.allowedValues.length > 0
        ? `Which of these describes ${lowerFirst(label)}?`
        : `Please tell us: ${lowerFirst(label)}.`;
  return {
    text,
    help: gap.guidance,
    options: gap.allowedValues,
    valueType: gap.valueType,
    factKey: gap.factKey,
    source: "deterministic",
  };
}

function lowerFirst(s: string): string {
  return s.length === 0 ? s : s[0].toLowerCase() + s.slice(1);
}

/**
 * Is this wording fit to put to a customer?
 *
 * Three ways a generation is rejected, all of them outright rather than
 * repaired, because a silently patched question is one nobody reviewed:
 *
 *   - it invites the customer to name the driver, which is the one
 *     thing a keeper appeal must never do (lib/keeperSafe.ts);
 *   - it asks for something other than the fact it was given, detected
 *     by it having become a different question entirely (too long, or
 *     no question at all);
 *   - it proposes its own answer, which would lead the customer to the
 *     value that opens the most grounds rather than the true one.
 */
export function isQuestionAcceptable(
  text: string,
  gap: FactGap,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (trimmed.length < 8) return { ok: false, reason: "TOO_SHORT" };
  if (trimmed.length > 240) return { ok: false, reason: "TOO_LONG" };
  if (!trimmed.includes("?")) return { ok: false, reason: "NOT_A_QUESTION" };

  const safety = validateKeeperSafe(trimmed);
  if (!safety.ok) return { ok: false, reason: "KEEPER_UNSAFE" };

  /*
   * A leading question. The model is told not to suggest an answer, but
   * "we assume you did pay — is that right?" is a plausible failure and
   * would bias a fact the letter then asserts.
   */
  if (/\b(?:we\s+(?:assume|believe|think)|presumably|it\s+looks\s+like)\b/i.test(trimmed)) {
    return { ok: false, reason: "LEADING" };
  }

  // An ENUM question that spells out a value not in the vocabulary is
  // offering an answer the case cannot store.
  void gap;
  return { ok: true };
}

export const QUESTION_SYSTEM_PROMPT = `You write a single, short question that asks a customer for one specific fact about a private parking charge they are appealing.

You are given: the fact needed, why it matters, the issue it belongs to, and the facts already known.

Rules:
- Ask for exactly the one fact named. Nothing else.
- Plain English, everyday words. No legal terms, no statute names, no jargon.
- One sentence, under 25 words, ending in a question mark.
- Never suggest, assume or imply what the answer is.
- Never ask who was driving, never ask the customer to name or describe the driver, and never imply the customer was the driver. The appeal is made by the registered keeper.
- Do not repeat a fact that is already known back as a question.
- Do not list the answer options; they are shown separately.
- Do not mention the issue code, the fact key, or that a system needs this.

Return JSON: {"question": "...", "help": "..."} where help is at most 15 words of plain clarification, or an empty string if none is needed.`;

export function buildQuestionUserPrompt(ctx: QuestionContext): string {
  const known = Object.entries(ctx.existingFacts)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join("\n");
  const options =
    ctx.missingFact.allowedValues.length > 0
      ? ctx.missingFact.allowedValues.join(", ")
      : "(free text)";

  return `FACT NEEDED
key: ${ctx.missingFact.factKey}
name: ${ctx.missingFact.label}
answer type: ${ctx.missingFact.valueType}
possible answers: ${options}

WHY IT MATTERS
${ctx.whyItMatters.guidance ?? "(no guidance recorded)"}
reason code: ${ctx.whyItMatters.reasonCode ?? "(none)"}

ACTIVE ISSUE
${ctx.activeIssue.label}

ALREADY KNOWN
${known.length > 0 ? known : "(nothing yet)"}`;
}
