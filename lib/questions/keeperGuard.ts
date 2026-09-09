import type { Question, QuestionDef } from "./types";

/**
 * Hard keeper-safety guard for questions.
 *
 * MASTER Developer Pack V2: "The system must never ask 'Who was
 * driving?' or invite a driver admission." This is non-negotiable, so it
 * is enforced in code rather than left to prompt guidance — both when
 * the bank is loaded and again on every question served.
 *
 * Note the deliberate distinction: asking whether the driver's details
 * have ALREADY been formally provided to the operator is permitted and
 * necessary for the PoFA analysis (KB-POFA-01/05). Asking who was
 * driving, or whether the reader was driving, is not.
 */

/** Patterns that identify the driver or invite an admission. */
const FORBIDDEN_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\bwho\s+(?:was|were)\s+driv/i, why: "asks who was driving" },
  { re: /\bwho\s+drove\b/i, why: "asks who drove" },
  { re: /\bwere\s+you\s+driv/i, why: "asks whether the reader was driving" },
  { re: /\bwere\s+you\s+the\s+driver\b/i, why: "asks whether the reader was the driver" },
  { re: /\bwas\s+it\s+you\s+driv/i, why: "asks whether the reader was driving" },
  { re: /\bare\s+you\s+the\s+driver\b/i, why: "asks whether the reader is the driver" },
  { re: /\bdid\s+you\s+drive\b/i, why: "asks whether the reader drove" },
  { re: /\bdid\s+you\s+park\b/i, why: "invites a driver admission" },
  { re: /\bwhen\s+did\s+you\s+park\b/i, why: "invites a driver admission" },
  { re: /\bwhere\s+did\s+you\s+park\b/i, why: "invites a driver admission" },
  { re: /\byour\s+name\s+as\s+(?:the\s+)?driver\b/i, why: "requests driver identity" },
  { re: /\bdriver'?s?\s+name\s*\?/i, why: "requests the driver's name directly" },
  { re: /\bname\s+of\s+the\s+driver\b/i, why: "requests the driver's name" },
  { re: /\bidentify\s+the\s+driver\b/i, why: "asks to identify the driver" },
  { re: /\bwho\s+had\s+the\s+(?:car|vehicle)\b/i, why: "asks who had the vehicle" },
];

/**
 * Wording that is explicitly permitted even though it mentions the
 * driver — it concerns a past formal identification event, not identity.
 */
const ALLOWED_EXCEPTIONS: RegExp[] = [
  /already\s+been\s+given\s+the\s+driver'?s?\s+(?:full\s+)?name/i,
  /already\s+been\s+(?:told|notified|informed)\s+who\s+was\s+driving/i,
  /never\s+ask\s+you\s+who\s+was\s+driving/i,
];

/**
 * Additional patterns applied to GENERATED text only.
 *
 * The bank is 27 hand-reviewed questions, so a narrow deny-list is
 * adequate there. Generated wording is open-ended, so it gets a wider
 * net — including second-person phrasing that positions the reader as
 * the driver, and requests for personal data no requirement asks for.
 */
const GENERATED_ONLY_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\bwhen\s+you\s+(?:arrived|left|entered|exited)\b/i, why: "positions the reader as the driver" },
  { re: /\bhow\s+long\s+(?:were|did)\s+you\s+(?:stay|park|remain)\b/i, why: "positions the reader as the driver" },
  { re: /\byour\s+(?:date\s+of\s+birth|dob)\b/i, why: "requests unnecessary personal data" },
  { re: /\bnational\s+insurance\b/i, why: "requests unnecessary personal data" },
  { re: /\b(?:card|account)\s+number\b/i, why: "requests financial data" },
  { re: /\bsort\s+code\b/i, why: "requests financial data" },
  { re: /\b(?:diagnosis|medical\s+condition|disability)\s+(?:is|details|name)\b/i, why: "requests medical detail beyond what is material" },
  { re: /\bwho\s+(?:else\s+)?lives\s+(?:with|at)\b/i, why: "requests household detail" },
  { re: /\bpassengers?\s+names?\b/i, why: "requests third-party identity" },
];

/** Scan generated wording with the wider net. */
export function checkGeneratedTextSafe(
  questionId: string,
  texts: Array<{ field: KeeperSafetyViolation["field"]; text?: string }>,
): KeeperSafetyViolation[] {
  const out: KeeperSafetyViolation[] = [];
  for (const { field, text } of texts) {
    if (!text) continue;
    if (ALLOWED_EXCEPTIONS.some((ex) => ex.test(text))) continue;
    for (const { re, why } of GENERATED_ONLY_PATTERNS) {
      const m = re.exec(text);
      if (m) out.push({ questionId, field, why, excerpt: m[0] });
    }
  }
  return out;
}

export interface KeeperSafetyViolation {
  questionId: string;
  field: "label" | "helpText" | "option" | "placeholder";
  why: string;
  excerpt: string;
}

function scanText(
  questionId: string,
  field: KeeperSafetyViolation["field"],
  text: string | undefined,
): KeeperSafetyViolation[] {
  if (!text) return [];
  const out: KeeperSafetyViolation[] = [];
  for (const { re, why } of FORBIDDEN_PATTERNS) {
    const m = re.exec(text);
    if (!m) continue;
    // Skip when the match sits inside an explicitly allowed phrase.
    if (ALLOWED_EXCEPTIONS.some((ex) => ex.test(text))) continue;
    out.push({ questionId, field, why, excerpt: m[0] });
  }
  return out;
}

/** Validate one question (definition or wire shape). */
export function checkQuestionKeeperSafe(
  q: QuestionDef | Question,
): KeeperSafetyViolation[] {
  const id = q.questionId;
  const issues: KeeperSafetyViolation[] = [
    ...scanText(id, "label", q.label),
    ...scanText(id, "helpText", q.helpText),
    ...scanText(id, "placeholder", q.placeholder),
  ];
  for (const opt of q.options ?? []) {
    issues.push(...scanText(id, "option", opt.label));
    issues.push(...scanText(id, "option", opt.hint));
  }
  return issues;
}

/** Validate the whole bank. Used at load time and in tests. */
export function checkBankKeeperSafe(
  bank: (QuestionDef | Question)[],
): KeeperSafetyViolation[] {
  return bank.flatMap(checkQuestionKeeperSafe);
}

/**
 * Throwing variant used on the serving path — a keeper-unsafe question
 * must never reach a customer.
 */
export function assertQuestionKeeperSafe(q: QuestionDef | Question): void {
  const issues = checkQuestionKeeperSafe(q);
  if (issues.length > 0) {
    throw new Error(
      `Keeper-safety violation in ${q.questionId}: ${issues
        .map((i) => `${i.field} ${i.why} ("${i.excerpt}")`)
        .join("; ")}`,
    );
  }
}
