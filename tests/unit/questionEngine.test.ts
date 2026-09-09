import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  candidateRoutes,
  nextQuestion,
  runJourney,
} from "@/lib/questions/engine";
import { QUESTION_BANK } from "@/lib/questions/bank";
import { deriveKnownFacts, FACT } from "@/lib/questions/facts";
import {
  checkBankKeeperSafe,
  checkQuestionKeeperSafe,
} from "@/lib/questions/keeperGuard";
import type { AnswerMap, AnswerValue, Question } from "@/lib/questions/types";
import type { ConfirmedPcn } from "@/types";

/**
 * Encodes MASTER Developer Pack V2 Part 4 as executable tests:
 * one question at a time, never re-asking established facts, a short
 * journey, and absolute keeper safety.
 */

const confirmedPostal: ConfirmedPcn = {
  operator_name: "Euro Car Parks",
  pcn_number: "ECP123456",
  vrm: "AB12CDE",
  parking_location: "Retail Park, Northampton",
  parking_event_date: "2026-05-02",
  notice_issue_date: "2026-05-10",
  notice_route: "POSTAL",
  charge_amount: 100,
  alleged_breach: "Overstayed the maximum period",
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: new Date().toISOString(),
};

/** Answer helper: keeper, driver not identified, England/Wales, private. */
function baseAnswers(extra: AnswerMap = {}): AnswerMap {
  return {
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    "__asked:Q-SCOPE-JURISDICTION": true,
    [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
    "__asked:Q-SCOPE-HIRE": true,
    [FACT.REGISTERED_KEEPER]: "YES",
    "__asked:Q-KEEPER-01": true,
    [FACT.DRIVER_IDENTIFIED]: "NO",
    "__asked:Q-DRIVER-ID-01": true,
    ...extra,
  };
}

describe("Keeper safety (non-negotiable)", () => {
  it("no question in the bank asks who was driving", () => {
    const violations = checkBankKeeperSafe(QUESTION_BANK);
    expect(violations).toEqual([]);
  });

  it("the guard rejects a question that asks who was driving", () => {
    const bad = {
      questionId: "Q-BAD",
      type: "short_text" as const,
      label: "Who was driving the vehicle?",
      required: true,
    };
    const issues = checkQuestionKeeperSafe(bad);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].why).toMatch(/who was driving/i);
  });

  it("the guard rejects 'were you driving' and 'did you park'", () => {
    for (const label of [
      "Were you driving at the time?",
      "Did you park in the disabled bay?",
      "What is the name of the driver?",
    ]) {
      const issues = checkQuestionKeeperSafe({
        questionId: "Q-BAD",
        type: "short_text",
        label,
        required: true,
      });
      expect(issues.length, label).toBeGreaterThan(0);
    }
  });

  it("still permits asking whether driver details were already provided", () => {
    const q = QUESTION_BANK.find((x) => x.questionId === "Q-DRIVER-ID-01")!;
    expect(checkQuestionKeeperSafe(q)).toEqual([]);
  });
});

describe("One question at a time", () => {
  it("returns exactly one question, never a list", () => {
    const r = nextQuestion({ confirmed: confirmedPostal });
    expect(r.questioningComplete).toBe(false);
    expect(r.question).not.toBeNull();
    expect(Array.isArray(r.question)).toBe(false);
  });

  it("never exposes internal fields to the browser", () => {
    const r = nextQuestion({ confirmed: confirmedPostal });
    const keys = Object.keys(r.question!);
    expect(keys).not.toContain("askWhen");
    expect(keys).not.toContain("establishesFacts");
    expect(keys).not.toContain("serves");
    expect(keys).not.toContain("priority");
    expect(keys).not.toContain("supportsModules");
  });
});

describe("Never asks what is already established", () => {
  it("skips the notice-route question when extraction established it", () => {
    const r = runJourney(
      { confirmed: confirmedPostal, answers: baseAnswers() },
      (q) => answerGeneric(q),
    );
    const ids = r.asked.map((q) => q.questionId);
    expect(ids).not.toContain("Q-NOTICE-ROUTE");
  });

  it("asks the notice-route question when extraction could not read it", () => {
    const unknownRoute: ConfirmedPcn = {
      ...confirmedPostal,
      notice_route: "UNKNOWN",
    };
    const r = runJourney(
      { confirmed: unknownRoute, answers: baseAnswers() },
      (q) => answerGeneric(q),
    );
    expect(r.asked.map((q) => q.questionId)).toContain("Q-NOTICE-ROUTE");
  });

  it("does not re-ask a question once answered", () => {
    let answers: AnswerMap = {};
    const first = nextQuestion({ confirmed: confirmedPostal, answers });
    const id = first.question!.questionId;
    answers = applyAnswer(answers, id, answerGeneric(first.question!)).answers;
    const second = nextQuestion({ confirmed: confirmedPostal, answers });
    expect(second.question?.questionId).not.toBe(id);
  });

  it("does not repeat an optional question answered with nothing selected", () => {
    let answers = baseAnswers();
    const r1 = nextQuestion({ confirmed: confirmedPostal, answers });
    expect(r1.question!.questionId).toBe("Q-WHAT-HAPPENED");
    // Customer selects nothing.
    answers = applyAnswer(answers, "Q-WHAT-HAPPENED", []).answers;
    const r2 = nextQuestion({ confirmed: confirmedPostal, answers });
    expect(r2.question?.questionId).not.toBe("Q-WHAT-HAPPENED");
  });
});

describe("Journey length (V2 Part 4 — normally 3–6 after confirmation)", () => {
  it("a simple keeper case completes in a short journey", () => {
    const r = runJourney({ confirmed: confirmedPostal }, (q) =>
      q.questionId === "Q-WHAT-HAPPENED" ? [] : answerGeneric(q),
    );
    expect(r.result.questioningComplete).toBe(true);
    // 4 triage/scope + 1 "what happened" = 5.
    expect(r.asked.length).toBeLessThanOrEqual(6);
  });

  it("a payment + keying case stays within a reasonable journey", () => {
    const r = runJourney({ confirmed: confirmedPostal }, (q) => {
      if (q.questionId === "Q-WHAT-HAPPENED") return ["payment_made", "vrm_error"];
      return answerGeneric(q);
    });
    expect(r.result.questioningComplete).toBe(true);
    expect(r.asked.length).toBeLessThanOrEqual(9);
    const ids = r.asked.map((q) => q.questionId);
    expect(ids).toContain("Q-PAY-METHOD");
    expect(ids).toContain("Q-KEY-ENTERED");
  });

  it("terminates for every single-tag scenario", () => {
    const tags = (
      QUESTION_BANK.find((q) => q.questionId === "Q-WHAT-HAPPENED")!.options ?? []
    ).map((o) => o.value);
    for (const tag of tags) {
      const r = runJourney({ confirmed: confirmedPostal }, (q) =>
        q.questionId === "Q-WHAT-HAPPENED" ? [tag] : answerGeneric(q),
      );
      expect(r.result.questioningComplete, tag).toBe(true);
      expect(r.asked.length, tag).toBeLessThanOrEqual(12);
    }
  });
});

describe("Route-specific questioning", () => {
  it("asks breakdown questions only when the breakdown tag is set", () => {
    const without = runJourney({ confirmed: confirmedPostal }, (q) =>
      q.questionId === "Q-WHAT-HAPPENED" ? ["payment_made"] : answerGeneric(q),
    );
    expect(without.asked.map((q) => q.questionId)).not.toContain("Q-BREAK-NATURE");

    const withTag = runJourney({ confirmed: confirmedPostal }, (q) =>
      q.questionId === "Q-WHAT-HAPPENED"
        ? ["breakdown_immobilised"]
        : answerGeneric(q),
    );
    const ids = withTag.asked.map((q) => q.questionId);
    expect(ids).toContain("Q-BREAK-NATURE");
    expect(ids).toContain("Q-BREAK-PREVENTED");
    expect(ids).toContain("Q-BREAK-EVIDENCE");
  });

  it("asks the lease permit-clause question only once an agreement exists", () => {
    const noAgreement = runJourney({ confirmed: confirmedPostal }, (q) => {
      if (q.questionId === "Q-WHAT-HAPPENED") return ["resident_parking_rights"];
      if (q.questionId === "Q-RES-AGREEMENT") return "NO";
      return answerGeneric(q);
    });
    expect(noAgreement.asked.map((q) => q.questionId)).not.toContain(
      "Q-RES-PERMIT-CLAUSE",
    );

    const withAgreement = runJourney({ confirmed: confirmedPostal }, (q) => {
      if (q.questionId === "Q-WHAT-HAPPENED") return ["resident_parking_rights"];
      if (q.questionId === "Q-RES-AGREEMENT") return "YES";
      return answerGeneric(q);
    });
    expect(withAgreement.asked.map((q) => q.questionId)).toContain(
      "Q-RES-PERMIT-CLAUSE",
    );
  });

  it("opens the PoFA route for an unidentified-driver keeper case", () => {
    const facts = deriveKnownFacts({ answers: baseAnswers() });
    expect(candidateRoutes(facts)).toContain("POFA");
  });

  it("maps tags onto the V2 route families", () => {
    const facts = deriveKnownFacts({
      answers: baseAnswers({
        [FACT.SCENARIOS]: ["breakdown_immobilised", "resident_parking_rights"],
      }),
    });
    const routes = candidateRoutes(facts);
    expect(routes).toContain("BREAKDOWN");
    expect(routes).toContain("RESIDENTIAL");
  });
});

describe("Scope and jurisdiction gates (Source Register V1 §15)", () => {
  it("routes a Scotland case to manual review", () => {
    const r = nextQuestion({
      confirmed: confirmedPostal,
      answers: { ...baseAnswers(), [FACT.JURISDICTION]: "SCOTLAND" },
    });
    expect(r.questioningComplete).toBe(true);
    expect(r.outOfScope?.action).toBe("MANUAL_REVIEW");
    expect(r.outOfScope?.reason).toBe("JURISDICTION_SCOTLAND");
    expect(r.question).toBeNull();
  });

  it("routes hire, lease and company vehicles to manual review", () => {
    for (const status of ["HIRE", "LEASE", "COMPANY"]) {
      const r = nextQuestion({
        confirmed: confirmedPostal,
        answers: { ...baseAnswers(), [FACT.VEHICLE_HIRE_STATUS]: status },
      });
      expect(r.outOfScope?.reason, status).toBe("HIRE_OR_COMPANY_VEHICLE");
    }
  });

  it("routes a non-keeper appellant to manual review", () => {
    const r = nextQuestion({
      confirmed: confirmedPostal,
      answers: { ...baseAnswers(), [FACT.REGISTERED_KEEPER]: "NO" },
    });
    expect(r.outOfScope?.reason).toBe("NOT_REGISTERED_KEEPER");
  });

  it("lets an England/Wales private-vehicle keeper case proceed", () => {
    const r = nextQuestion({
      confirmed: confirmedPostal,
      answers: baseAnswers(),
    });
    expect(r.outOfScope).toBeUndefined();
  });
});

describe("Answer validation", () => {
  it("rejects an unknown question id", () => {
    const r = applyAnswer({}, "Q-DOES-NOT-EXIST", "YES");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unknown question/i);
  });

  it("rejects an option outside the declared set", () => {
    const r = applyAnswer({}, "Q-KEEPER-01", "MAYBE");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalid option/i);
  });

  it("rejects a wrong value type", () => {
    const r = applyAnswer({}, "Q-ANPR-VISITS", "three" as unknown as AnswerValue);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/expected a number/i);
  });

  it("enforces number bounds", () => {
    expect(applyAnswer({}, "Q-ANPR-VISITS", 0).ok).toBe(false);
    expect(applyAnswer({}, "Q-ANPR-VISITS", 25).ok).toBe(false);
    expect(applyAnswer({}, "Q-ANPR-VISITS", 2).ok).toBe(true);
  });

  it("rejects an empty answer to a required question", () => {
    const r = applyAnswer({}, "Q-KEEPER-01", "");
    expect(r.ok).toBe(false);
  });

  it("accepts an empty answer to an optional question", () => {
    const r = applyAnswer({}, "Q-WHAT-HAPPENED", []);
    expect(r.ok).toBe(true);
  });

  it("writes the established fact keys", () => {
    const r = applyAnswer({}, "Q-KEEPER-01", "YES");
    expect(r.answers[FACT.REGISTERED_KEEPER]).toBe("YES");
  });
});

describe("Question bank integrity", () => {
  it("has unique question IDs", () => {
    const ids = QUESTION_BANK.map((q) => q.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares at least one established fact per question", () => {
    for (const q of QUESTION_BANK) {
      expect(q.establishesFacts.length, q.questionId).toBeGreaterThan(0);
    }
  });

  it("gives every choice question a non-empty option set", () => {
    for (const q of QUESTION_BANK) {
      if (q.type === "single_choice" || q.type === "multi_choice") {
        expect(q.options?.length, q.questionId).toBeGreaterThan(1);
      }
    }
  });

  it("uses only the nine supported input types", () => {
    const allowed = new Set([
      "boolean", "single_choice", "multi_choice", "short_text",
      "long_text", "date", "time", "number", "evidence_upload",
    ]);
    for (const q of QUESTION_BANK) {
      expect(allowed.has(q.type), `${q.questionId}:${q.type}`).toBe(true);
    }
  });

  it("covers every V2 route family that needs questioning", () => {
    const served = new Set(QUESTION_BANK.map((q) => q.serves));
    for (const family of [
      "PAYMENT", "KEYING", "BREAKDOWN", "RESIDENTIAL", "EQUALITY",
      "HOSPITAL", "LOADING", "EV_CHARGING", "INFRASTRUCTURE",
      "ANPR", "CONSIDERATION", "GRACE", "SIGNAGE", "AUTHORIZATION",
    ]) {
      expect(served.has(family as never), family).toBe(true);
    }
  });
});

/* ------------------------- helpers ------------------------- */

function answerGeneric(q: Question): AnswerValue {
  switch (q.type) {
    case "boolean":
      return true;
    case "number":
      return q.min ?? 1;
    case "multi_choice":
      return q.options && q.required ? [q.options[0].value] : [];
    case "single_choice": {
      // Prefer in-scope answers so generic journeys don't bail out early.
      const prefer = ["ENGLAND_WALES", "PRIVATE", "YES"];
      const opts = q.options ?? [];
      const match = opts.find((o) => prefer.includes(o.value));
      return (match ?? opts[0]).value;
    }
    default:
      return "Provided detail for testing.";
  }
}
