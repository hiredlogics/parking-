import type { KnownFacts, Question } from "./types";
import { checkAnswerContract } from "./answerContract";
import type { GeneratedQuestion } from "./generated";
import { GENERATABLE_TYPES } from "./generated";
import {
  ALL_REASON_CODES,
  isPermittedFact,
  requirementsForFact,
  type FactRequirement,
} from "./requirements";
import { isRequirementActive } from "./missing";
import {
  checkGeneratedTextSafe,
  checkQuestionKeeperSafe,
} from "./keeperGuard";

/**
 * Validation of an AI-generated question.
 *
 * Nothing the model returns is trusted. Every structural field is
 * re-derived from the controlled requirement map, and the wording is
 * scanned before a customer can see it.
 *
 * A rejected question is never shown. The reasons are fed back for one
 * regeneration attempt and stored against the case for audit.
 */

export interface ValidationFailure {
  rule: string;
  detail: string;
}

export type GeneratedValidation =
  | { ok: true; question: Question; requirement: FactRequirement }
  | { ok: false; failures: ValidationFailure[] };

const fail = (rule: string, detail: string): ValidationFailure => ({
  rule,
  detail,
});

/** Normalise for semantic-repeat comparison. */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Crude but effective overlap score for near-duplicate detection. */
export function similarity(a: string, b: string): number {
  const wa = new Set(normalise(a).split(" ").filter((w) => w.length > 3));
  const wb = new Set(normalise(b).split(" ").filter((w) => w.length > 3));
  if (wa.size === 0 || wb.size === 0) return 0;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.min(wa.size, wb.size);
}

export interface ValidateInput {
  candidate: GeneratedQuestion;
  facts: KnownFacts;
  /** Requirements currently outstanding, in priority order. */
  missing: FactRequirement[];
  /** Labels already put to the customer. */
  askedLabels: string[];
  /** Facts already put to the customer, answered or not. */
  askedFacts: string[];
}

export function validateGeneratedQuestion(
  input: ValidateInput,
): GeneratedValidation {
  const { candidate, facts, missing, askedLabels, askedFacts } = input;
  const failures: ValidationFailure[] = [];
  const q = candidate.question;

  /* 1. Shape. */
  if (!q || typeof q !== "object") {
    return { ok: false, failures: [fail("SHAPE", "No question object returned.")] };
  }
  if (typeof q.label !== "string" || q.label.trim().length === 0) {
    failures.push(fail("SHAPE", "The question has no label."));
  }
  if (!GENERATABLE_TYPES.includes(q.type)) {
    failures.push(
      fail("SHAPE", `Type "${q.type}" is not one the generator may produce.`),
    );
  }

  /* 2. Only ONE question. */
  const label = typeof q.label === "string" ? q.label : "";
  const questionMarks = (label.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    failures.push(
      fail("ONE_QUESTION", "The label contains more than one question."),
    );
  }
  if (/\band also\b|\badditionally\b/i.test(label)) {
    failures.push(
      fail("ONE_QUESTION", "The label bundles a second question."),
    );
  }

  /* 3. The target fact must exist in the permitted map. */
  if (!isPermittedFact(candidate.target_fact)) {
    failures.push(
      fail(
        "UNKNOWN_FACT",
        `"${candidate.target_fact}" is not a fact any route may require. The model invented it.`,
      ),
    );
  }

  /* 4. The target fact must actually be outstanding. */
  const requirement =
    missing.find((m) => m.fact === candidate.target_fact) ?? null;
  if (!requirement) {
    failures.push(
      fail(
        "NOT_OUTSTANDING",
        `"${candidate.target_fact}" is not in the outstanding list for this case.`,
      ),
    );
  }

  /* 5. Never re-ask something already known or confirmed. */
  if (facts.known.has(candidate.target_fact)) {
    failures.push(
      fail(
        "ALREADY_KNOWN",
        `"${candidate.target_fact}" is already established for this case.`,
      ),
    );
  }
  if (askedFacts.includes(candidate.target_fact)) {
    failures.push(
      fail(
        "ALREADY_ASKED",
        `"${candidate.target_fact}" has already been put to this customer.`,
      ),
    );
  }

  /* 6. The route must currently be relevant. */
  const declared = requirementsForFact(candidate.target_fact);
  if (
    declared.length > 0 &&
    !declared.some((r) => r.route === candidate.route)
  ) {
    failures.push(
      fail(
        "ROUTE_MISMATCH",
        `Route "${candidate.route}" does not declare "${candidate.target_fact}".`,
      ),
    );
  }

  /* 7. The reason code must be a real one, and match the requirement. */
  if (!ALL_REASON_CODES.includes(candidate.reason_code)) {
    failures.push(
      fail("UNKNOWN_REASON", `Reason code "${candidate.reason_code}" does not exist.`),
    );
  } else if (requirement && requirement.reasonCode !== candidate.reason_code) {
    failures.push(
      fail(
        "REASON_MISMATCH",
        `Reason code should be "${requirement.reasonCode}" for this fact.`,
      ),
    );
  }

  /* 8. Must not contradict what is already established. */
  if (requirement && !isRequirementActive(requirement, facts)) {
    failures.push(
      fail(
        "CONTRADICTS_FACTS",
        `"${candidate.target_fact}" is not required given what is already known.`,
      ),
    );
  }

  /* 9. Keeper safety — the non-negotiable one. */
  const asQuestion: Question = {
    questionId: `gen:${candidate.target_fact}`,
    type: q.type,
    label,
    required: true,
    helpText: q.helpText,
    options: q.options,
    placeholder: q.placeholder,
  };
  for (const v of checkQuestionKeeperSafe(asQuestion)) {
    failures.push(fail("KEEPER_SAFETY", `${v.field} ${v.why} ("${v.excerpt}")`));
  }
  const generatedIssues = checkGeneratedTextSafe(asQuestion.questionId, [
    { field: "label", text: label },
    { field: "helpText", text: q.helpText },
    { field: "placeholder", text: q.placeholder },
    ...(q.options ?? []).flatMap((o) => [
      { field: "option" as const, text: o.label },
      { field: "option" as const, text: o.hint },
    ]),
  ]);
  for (const v of generatedIssues) {
    failures.push(fail("KEEPER_SAFETY", `${v.field} ${v.why} ("${v.excerpt}")`));
  }

  /* 10. No unsupported legal assertion. */
  const legalAssertion =
    /\b(?:you are entitled|the law requires|is unlawful|you must legally|statute requires|by law you)\b/i;
  if (legalAssertion.test(label) || legalAssertion.test(q.helpText ?? "")) {
    failures.push(
      fail(
        "LEGAL_ASSERTION",
        "The question states a legal rule or entitlement. Questions ask about facts only.",
      ),
    );
  }

  /* 11. No semantic repeat of an earlier question. */
  for (const prior of askedLabels) {
    if (similarity(label, prior) >= 0.8) {
      failures.push(
        fail("SEMANTIC_REPEAT", `Too similar to an earlier question: "${prior}".`),
      );
      break;
    }
  }

  /*
   * 12. The answer must match the fact's value space.
   *
   * A generated boolean for `registered_keeper` dead-ended a live case:
   * the browser sent `true`, and every consumer of that fact compares
   * against "YES" / "NO" / "UNSURE". Even had it been recorded, scope
   * gating and route candidacy would have read it as unset.
   */
  const contractError = checkAnswerContract(
    candidate.target_fact,
    q.type,
    q.options,
  );
  if (contractError) {
    failures.push(fail("ANSWER_CONTRACT", contractError));
  }

  /* Choice questions need usable options. */
  if (
    (q.type === "single_choice" || q.type === "multi_choice") &&
    (!Array.isArray(q.options) || q.options.length < 2)
  ) {
    failures.push(
      fail("SHAPE", "A choice question needs at least two options."),
    );
  }
  for (const opt of q.options ?? []) {
    if (!opt?.value || !opt?.label) {
      failures.push(fail("SHAPE", "Every option needs a value and a label."));
      break;
    }
  }

  if (failures.length > 0) return { ok: false, failures };

  return {
    ok: true,
    question: asQuestion,
    requirement: requirement as FactRequirement,
  };
}

/** Human-readable feedback for the single regeneration attempt. */
export function summariseFailures(failures: ValidationFailure[]): string {
  return failures.map((f) => `- [${f.rule}] ${f.detail}`).join("\n");
}
