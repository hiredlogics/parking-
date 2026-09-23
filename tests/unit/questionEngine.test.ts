/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { QUESTION_BANK, TAG_ROUTES } from "@/lib/questions/bank";
import { toWireQuestion, countAnswered, askedKey } from "@/lib/questions/engine";
import { checkBankKeeperSafe } from "@/lib/questions/keeperGuard";
import { FACT, deriveKnownFacts } from "@/lib/facts/facts";
import { bankQuestionsForFact, fallbackQuestionFor } from "@/lib/questions/fallback";
import { TRIAGE_REQUIREMENTS, ROUTE_REQUIREMENTS } from "@/lib/facts/requirements";
import type { ConfirmedPcn } from "@/types";

/**
 * The controlled question bank, in its DEMOTED role.
 *
 * MASTER V2 Part 14 supersedes the fixed branch questionnaire, and the
 * client confirmed the bank is now FALLBACK / REFERENCE / TEST
 * COVERAGE / SAFETY only. `nextQuestion()` — the V1 selector that
 * ordered by static priority and treated twelve answers as readiness —
 * has been deleted, so these cover what the bank must still guarantee
 * as a safety net.
 */

const confirmed: ConfirmedPcn = {
  operator_name: "Op Ltd",
  pcn_number: "PCN1",
  vrm: "AB12CDE",
  parking_location: "Site",
  parking_event_date: "2026-03-01",
  notice_route: "POSTAL",
  confirmedAt: "2026-03-05T00:00:00.000Z",
} as ConfirmedPcn;

describe("Bank integrity", () => {
  it("still holds the 32 controlled questions", () => {
    expect(QUESTION_BANK).toHaveLength(32);
  });

  it("has unique question ids", () => {
    const ids = QUESTION_BANK.map((q) => q.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("declares at least one fact for every question", () => {
    for (const q of QUESTION_BANK) {
      expect(q.establishesFacts.length, q.questionId).toBeGreaterThan(0);
    }
  });

  it("only establishes facts from the FACT registry", () => {
    const known = new Set(Object.values(FACT) as string[]);
    for (const q of QUESTION_BANK) {
      for (const f of q.establishesFacts) {
        expect(known.has(f), `${q.questionId} → ${f}`).toBe(true);
      }
    }
  });

  it("gives every choice question at least two options", () => {
    for (const q of QUESTION_BANK) {
      if (q.type !== "single_choice" && q.type !== "multi_choice") continue;
      expect(q.options?.length ?? 0, q.questionId).toBeGreaterThanOrEqual(2);
    }
  });
});

/* ===================== Keeper safety (non-negotiable) ===================== */

describe("Keeper safety", () => {
  it("holds across the entire bank", () => {
    const violations = checkBankKeeperSafe(QUESTION_BANK);
    expect(violations).toEqual([]);
  });

  it("permits the driver-notification question, which is about a past event", () => {
    const q = QUESTION_BANK.find((x) => x.questionId === "Q-DRIVER-ID-01")!;
    expect(q.label).toMatch(/already been given the driver's/i);
    expect(checkBankKeeperSafe([q])).toEqual([]);
  });

  it("never ASKS who was driving anywhere in the bank", () => {
    // The bank reassures the customer that we "will never ask you who
    // was driving". That mentions the phrase without asking it, and is
    // an explicitly permitted exception in the guard — so it is
    // stripped before this stricter raw check runs.
    const REASSURANCE = /we\s+will\s+never\s+ask\s+you\s+who\s+was\s+driving\.?/gi;
    for (const q of QUESTION_BANK) {
      const text = [q.label, q.helpText ?? "", ...(q.options ?? []).map((o) => o.label)]
        .join(" ")
        .replace(REASSURANCE, "");
      expect(text, q.questionId).not.toMatch(/\bwho\s+(was|were)\s+driv/i);
      expect(text, q.questionId).not.toMatch(/\bwere\s+you\s+driv/i);
      expect(text, q.questionId).not.toMatch(/\bdriver'?s?\s+name\s*\?/i);
    }
  });
});

/* ========================= Wire projection ========================= */

describe("Wire projection", () => {
  it("strips internal fields before a question leaves the server", () => {
    const wire = toWireQuestion(QUESTION_BANK[0]);
    for (const internal of ["serves", "establishesFacts", "askWhen", "priority", "supportsModules"]) {
      expect(Object.keys(wire)).not.toContain(internal);
    }
  });

  it("keeps the fields the UI needs", () => {
    const wire = toWireQuestion(QUESTION_BANK[0]);
    expect(wire.questionId).toBeTruthy();
    expect(wire.label).toBeTruthy();
    expect(wire.type).toBeTruthy();
  });
});

/* ====================== Fallback coverage ====================== */

describe("Fallback coverage", () => {
  const facts = deriveKnownFacts({ confirmed, answers: {} });

  it("serves the triage facts the AI cannot skip", () => {
    for (const fact of [
      FACT.JURISDICTION, FACT.VEHICLE_HIRE_STATUS,
      FACT.REGISTERED_KEEPER, FACT.DRIVER_IDENTIFIED,
    ]) {
      expect(bankQuestionsForFact(fact).length, fact).toBeGreaterThan(0);
    }
  });

  it("returns a keeper-safe wire question for a triage requirement", () => {
    const req = TRIAGE_REQUIREMENTS.find((r) => r.fact === FACT.REGISTERED_KEEPER)!;
    const fb = fallbackQuestionFor(req, facts);
    expect(fb).not.toBeNull();
    expect(checkBankKeeperSafe([fb!.question])).toEqual([]);
  });

  it("reports honestly when the bank cannot cover a fact", () => {
    // payment_made has no bank question — the engine must route to
    // manual review rather than pretend the case is complete.
    const req = ROUTE_REQUIREMENTS.PAYMENT!.find((r) => r.fact === FACT.PAYMENT_MADE)!;
    expect(fallbackQuestionFor(req, facts)).toBeNull();
  });
});

/* ==================== Route trigger data ==================== */

describe("Route triggers", () => {
  it("maps every scenario tag to at least one route", () => {
    for (const [tag, routes] of Object.entries(TAG_ROUTES)) {
      expect(routes.length, tag).toBeGreaterThan(0);
    }
  });

  it("is now assisting data, not the sole route source", () => {
    // Re-exported from the requirement map, which the reasoning layer
    // owns. Proven by the candidacy tests in caseReasoning.test.ts.
    expect(Object.keys(TAG_ROUTES).length).toBeGreaterThan(10);
  });
});

/* ============ Count is reporting only, never readiness ============ */

describe("Question count", () => {
  it("counts asked questions for reporting", () => {
    expect(countAnswered({ [askedKey("Q-A")]: true, [askedKey("Q-B")]: true })).toBe(2);
  });

  it("is not consulted by any readiness decision", async () => {
    // Guard against the deleted behaviour returning: no live module may
    // branch on how many questions were answered.
    const { readFileSync } = await import("node:fs");
    for (const file of [
      "lib/questions/dynamicEngine.ts",
      "lib/cases/sufficiency.ts",
      "lib/facts/missing.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/countAnswered/);
      expect(src, file).not.toMatch(/answered\s*>=\s*max/);
    }
  });
});
