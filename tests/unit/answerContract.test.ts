/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { FACT } from "@/lib/questions/facts";
import {
  canonicalValuesFor,
  checkAnswerContract,
  hasFixedVocabulary,
  isChoiceType,
  normaliseAnswerValue,
} from "@/lib/questions/answerContract";
import { applyAnswerToFact, validateAgainstQuestion } from "@/lib/questions/applyAnswer";
import { validateGeneratedQuestion } from "@/lib/questions/validateGenerated";
import { allRequirements } from "@/lib/questions/requirements";
import type { Question } from "@/lib/questions/types";
import type { KnownFacts } from "@/lib/questions/types";
import { QUESTION_BANK } from "@/lib/questions/bank";

/**
 * The answer contract.
 *
 * A live case asked "Are you the registered keeper of the vehicle?" as
 * a generated boolean. The browser sent `true`, recording it failed
 * with "Invalid option(s): true", and the customer could not answer at
 * all. Two separate defects met: the model was allowed to choose a value
 * space the rest of the system does not use, and the option allowlist
 * was applied to a boolean whose value space is not its options.
 */

describe("Canonical value spaces come from the controlled bank", () => {
  it("knows the keeper fact is YES / NO / UNSURE", () => {
    expect(canonicalValuesFor(FACT.REGISTERED_KEEPER)).toEqual([
      "NO",
      "UNSURE",
      "YES",
    ]);
  });

  it("treats free-form facts as having no fixed vocabulary", () => {
    // A registration mark cannot be enumerated.
    expect(canonicalValuesFor(FACT.VRM_ENTERED)).toBeNull();
    expect(hasFixedVocabulary(FACT.VRM_ENTERED)).toBe(false);
  });

  it("does not let a caller widen the shared vocabulary", () => {
    const first = canonicalValuesFor(FACT.REGISTERED_KEEPER)!;
    first.push("MAYBE");
    expect(canonicalValuesFor(FACT.REGISTERED_KEEPER)).not.toContain("MAYBE");
  });

  it("classifies choice types", () => {
    expect(isChoiceType("single_choice")).toBe(true);
    expect(isChoiceType("multi_choice")).toBe(true);
    expect(isChoiceType("boolean")).toBe(false);
    expect(isChoiceType("short_text")).toBe(false);
  });
});

describe("Answer contract rejects a mismatched value space", () => {
  it("rejects a boolean question for an enumerated fact", () => {
    const error = checkAnswerContract(FACT.REGISTERED_KEEPER, "boolean", [
      { value: "true" },
      { value: "false" },
    ]);
    expect(error).toBeTruthy();
    expect(error).toMatch(/single_choice/);
  });

  it("accepts a single_choice question using the canonical values", () => {
    expect(
      checkAnswerContract(FACT.REGISTERED_KEEPER, "single_choice", [
        { value: "YES" },
        { value: "NO" },
      ]),
    ).toBeNull();
  });

  it("accepts a subset of the canonical values", () => {
    expect(
      checkAnswerContract(FACT.REGISTERED_KEEPER, "single_choice", [
        { value: "YES" },
        { value: "NO" },
      ]),
    ).toBeNull();
  });

  it("rejects invented option values", () => {
    const error = checkAnswerContract(FACT.REGISTERED_KEEPER, "single_choice", [
      { value: "yes" },
      { value: "nope" },
    ]);
    expect(error).toMatch(/not part of the value space/);
  });

  it("ignores facts with no fixed vocabulary", () => {
    expect(checkAnswerContract(FACT.VRM_ENTERED, "short_text", undefined)).toBeNull();
  });
});

describe("The generated-question validator enforces the contract", () => {
  const facts: KnownFacts = { known: new Set(), values: {} } as KnownFacts;

  function validate(type: Question["type"], options: Array<{ value: string; label: string }>) {
    const requirement = allRequirements().find(
      (r) => r.fact === FACT.REGISTERED_KEEPER,
    )!;
    return validateGeneratedQuestion({
      candidate: {
        target_fact: FACT.REGISTERED_KEEPER,
        route: requirement.route,
        reason_code: requirement.reasonCode,
        question: {
          type,
          label: "Are you the registered keeper of the vehicle?",
          options,
        },
      } as never,
      facts,
      missing: [requirement],
      askedLabels: [],
      askedFacts: [],
    });
  }

  it("rejects the exact question that broke the live journey", () => {
    const result = validate("boolean", [
      { value: "true", label: "Yes" },
      { value: "false", label: "No" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.map((f) => f.rule)).toContain("ANSWER_CONTRACT");
    }
  });

  it("accepts the same question as a single_choice with canonical values", () => {
    const result = validate("single_choice", [
      { value: "YES", label: "Yes" },
      { value: "NO", label: "No" },
      { value: "UNSURE", label: "I'm not sure" },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("Answers are normalised into the canonical vocabulary", () => {
  it("maps a boolean true to YES for an enumerated fact", () => {
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, true)).toBe("YES");
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, false)).toBe("NO");
  });

  it("upper-cases a lowercase answer", () => {
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, "yes")).toBe("YES");
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, " no ")).toBe("NO");
  });

  it("maps the strings 'true' and 'false' too", () => {
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, "true")).toBe("YES");
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, "false")).toBe("NO");
  });

  it("leaves an already-canonical value alone", () => {
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, "UNSURE")).toBe("UNSURE");
  });

  it("does not touch free-form facts", () => {
    expect(normaliseAnswerValue(FACT.VRM_ENTERED, "KT19 RPI")).toBe("KT19 RPI");
  });

  it("does not guess at an unrecognised value", () => {
    // Better to fail validation than to invent a fact.
    expect(normaliseAnswerValue(FACT.REGISTERED_KEEPER, "probably")).toBe("probably");
  });

  it("records the keeper fact as YES when a legacy boolean question is answered", () => {
    /*
     * The exact recovery path for a case whose pending question was
     * persisted as a boolean before the contract rule existed.
     */
    const legacy: Question = {
      questionId: "gen:registered_keeper",
      type: "boolean",
      label: "Are you the registered keeper of the vehicle?",
      required: true,
      options: [
        { value: "YES", label: "Yes" },
        { value: "NO", label: "No" },
      ],
    };
    const result = applyAnswerToFact({}, legacy, FACT.REGISTERED_KEEPER, true);
    expect(result.ok).toBe(true);
    expect(result.answers[FACT.REGISTERED_KEEPER]).toBe("YES");
  });
});

describe("Recording an answer", () => {
  const booleanQuestion: Question = {
    questionId: "gen:test_bool",
    type: "boolean",
    label: "Did the barrier fail to open?",
    required: true,
    options: [
      { value: "YES", label: "Yes" },
      { value: "NO", label: "No" },
    ],
  };

  it("accepts a boolean answer even when the question carries Yes/No labels", () => {
    // Previously "Invalid option(s): true".
    expect(validateAgainstQuestion(booleanQuestion, true)).toBeNull();
    expect(validateAgainstQuestion(booleanQuestion, false)).toBeNull();
  });

  it("still rejects a non-boolean answer to a boolean question", () => {
    expect(validateAgainstQuestion(booleanQuestion, "maybe")).toMatch(/true or false/);
  });

  it("still enforces the option set for a choice question", () => {
    const choice: Question = {
      questionId: "gen:test_choice",
      type: "single_choice",
      label: "Are you the registered keeper?",
      required: true,
      options: [
        { value: "YES", label: "Yes" },
        { value: "NO", label: "No" },
      ],
    };
    expect(validateAgainstQuestion(choice, "YES")).toBeNull();
    expect(validateAgainstQuestion(choice, "MAYBE")).toMatch(/Invalid option/);
  });

  it("records a boolean answer and marks the fact as asked", () => {
    const result = applyAnswerToFact({}, booleanQuestion, "barrier_failed", true);
    expect(result.ok).toBe(true);
    expect(result.answers.barrier_failed).toBe(true);
    expect(result.answers["__askedfact:barrier_failed"]).toBe(true);
  });

  it("marks a fact as asked even when the customer is unsure", () => {
    const result = applyAnswerToFact({}, { ...booleanQuestion, required: false }, "barrier_failed", null);
    expect(result.ok).toBe(true);
    expect(result.answers["__askedfact:barrier_failed"]).toBe(true);
    expect(result.answers.barrier_failed).toBeUndefined();
  });
});

/**
 * The bank is the source of truth, so it must itself be internally
 * consistent — otherwise the contract it defines is unenforceable.
 */
describe("The bank's own questions satisfy the contract", () => {
  it("every bank question matches its fact's value space", () => {
    for (const def of QUESTION_BANK) {
      if (def.establishesFacts.length !== 1) continue;
      const error = checkAnswerContract(
        def.establishesFacts[0],
        def.type,
        def.options,
      );
      expect(error, `${def.questionId}: ${error}`).toBeNull();
    }
  });
});
