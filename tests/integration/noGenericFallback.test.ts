// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { generateValidatedAppeal } from "@/lib/generation/engine";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { classifyAllegation } from "@/lib/reasoning/allegation";

/**
 * The four client cases, end to end, against the no-generic-fallback rule.
 *
 * WHAT THIS SUITE IS FOR
 * ----------------------
 * A released letter used to be able to come from either of two engines,
 * and the quiet substitution of one for the other is what produced every
 * "generic appeal" report. The rules-letter downgrade on validation
 * failure is gone, so a case now either argues its own facts or goes to
 * a person. These four fixtures pin that at the ends of the range:
 * a strong conduct case, a case whose only ground is arithmetic, a
 * permit/ANPR case, and a notice nothing could be read from.
 *
 * NO MODEL RUNS HERE. Drafting is pinned to the deterministic provider
 * by tests/setup.ts, which is the harder test: it cannot rewrite its way
 * out of a bad paragraph selection, so any repetition or missing ground
 * shows up instead of being papered over.
 */

const ENV_OVERRIDES: Record<string, string> = {
  KB_USE_DATABASE: "1",
  GROUNDS_PROVIDER: "deterministic",
  DRAFTING_PROVIDER: "deterministic",
};
const priorEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const [k, v] of Object.entries(ENV_OVERRIDES)) {
    priorEnv[k] = process.env[k];
    process.env[k] = v;
  }
});
afterAll(() => {
  for (const [k, v] of Object.entries(priorEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

const notice = (over: Partial<ConfirmedPcn>): ConfirmedPcn =>
  ({
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    ...over,
  }) as ConfirmedPcn;

interface Case {
  label: string;
  confirmed: ConfirmedPcn;
  answers: Record<string, unknown>;
  evidenceTypes: string[];
}

/** A: Smart Parking — no allegation on the paper, PoFA timing failed. */
const SMART: Case = {
  label: "A Smart Parking (PoFA timing)",
  confirmed: notice({
    operator_name: "Smart Parking Ltd",
    pcn_number: "SP62712518",
    vrm: "FD18BOF",
    parking_location: "B&M Chatham - ME4 4HA",
    parking_event_date: "2026-08-10",
    notice_issue_date: "2026-08-27",
    entry_time: "19:06",
    exit_time: "20:41",
    total_recorded_duration: 95,
    charge_amount: 90,
  }),
  answers: {},
  evidenceTypes: [],
};

/** B: Euro Car Parks — payment attempted, one letter mis-keyed. */
const EURO: Case = {
  label: "B Euro Car Parks (payment/keying)",
  confirmed: notice({
    operator_name: "Euro Car Parks",
    pcn_number: "88812545842",
    vrm: "KJ19KYN",
    parking_location: "Sainsburys Willesden Green",
    parking_event_date: "2026-08-29",
    notice_issue_date: "2026-09-04",
    entry_time: "13:05",
    exit_time: "14:14",
    total_recorded_duration: 69,
    charge_amount: 100,
    alleged_breach: "A voucher/receipt was not validated at the kiosk",
  }),
  answers: {
    payment_made: "ATTEMPTED_FAILED",
    payment_method: "machine",
    vrm_entered: "KJ19KYM",
    keying_error: "I typed KJ19KYM instead of KJ19KYN — one letter out.",
    payment_evidence: "YES",
  },
  evidenceTypes: ["payment_receipt"],
};

/** C: Wise Parking — permit / authorisation, ANPR-captured. */
const WISE: Case = {
  label: "C Wise Parking (permit/ANPR)",
  confirmed: notice({
    operator_name: "Wise Parking Ltd",
    pcn_number: "AP539112",
    vrm: "LR17YDA",
    parking_location: "Cranbrook Road Car Park",
    parking_event_date: "2026-09-01",
    notice_issue_date: "2026-09-05",
    entry_time: "08:12",
    exit_time: "18:40",
    total_recorded_duration: 628,
    charge_amount: 100,
    alleged_breach: "No Permit Displayed",
  }),
  answers: {
    // `permission_held` is the fact the AUTHORISATION issue requires —
    // the gap resolver asks for exactly this. Naming a near-miss key
    // instead leaves the issue open but its knowledge fact-gated out,
    // which is a different (and quieter) failure worth not confusing
    // with this one.
    permission_held: "YES",
    permit_displayed: "YES",
    authorisation_basis: "resident_permit",
  },
  evidenceTypes: ["permit"],
};

/** D: the notice nothing could be read from. */
const DEAD: Case = {
  label: "D Extraction failure (no allegation, timing sound)",
  confirmed: notice({
    operator_name: "Smart Parking Ltd",
    pcn_number: "SP62712518",
    vrm: "FD18BOF",
    parking_event_date: "2026-08-29",
    notice_issue_date: "2026-09-04",
    charge_amount: 100,
  }),
  answers: {},
  evidenceTypes: [],
};

async function run(c: Case) {
  const { answers, answerProvenance } = resolveAnswersWithDefaults(
    c.confirmed,
    c.answers as never,
    c.evidenceTypes,
  );
  const result = await generateValidatedAppeal({
    confirmed: c.confirmed,
    answers,
    answerProvenance,
    evidenceTypes: c.evidenceTypes,
    evidenceRefs: [],
  });
  const body = result.body ?? "";
  console.log(`\n=== ${c.label} ===`);
  console.log(`  allegation : ${classifyAllegation(c.confirmed.alleged_breach ?? "").category}`);
  console.log(`  status     : ${result.status}  reason=${result.reason ?? "-"}`);
  console.log(`  provider   : ${result.provider?.providerId ?? "-"}`);
  console.log(`  modules    : ${result.moduleIds.join(", ") || "(none)"}`);
  console.log(`  body       : ${body ? `${body.length} chars` : "(none released)"}`);
  return { result, body };
}

describe("no case is downgraded to a generic appeal", () => {
  it("A Smart Parking argues its PoFA timing with the actual dates", async () => {
    const { result, body } = await run(SMART);

    expect(result.status).toBe("READY");

    // The ground itself, not the generic keeper-liability threshold.
    expect(body).toMatch(/not\s+(?:given|delivered|served)\s+within/i);

    // The dates the arithmetic rests on. A timing allegation without
    // them is unanswerable to an operator and reads as boilerplate.
    expect(body).toContain("10 August 2026");
    expect(body).toContain("27 August 2026");

    // And why the period matters, so the paragraph argues rather than
    // merely asserts.
    expect(body).toMatch(/cannot operate to transfer liability/i);

    // Never released by the legacy substitute.
    expect(result.provider?.providerId).not.toBe("rules-engine");
  }, 180_000);

  it("B Euro Car Parks argues payment and the keying error", async () => {
    const { result, body } = await run(EURO);

    expect(result.status).toBe("READY");
    expect(result.moduleIds.join(",")).toMatch(/KB-(PAY|KEY)/);
    // Its own registration and payment facts, not a keeper template.
    expect(body).toMatch(/payment/i);
    expect(body).toContain("KJ19KYN");
    expect(result.provider?.providerId).not.toBe("rules-engine");
  }, 180_000);

  it("C Wise Parking opens permit / authorisation reasoning", async () => {
    const { result } = await run(WISE);

    expect(classifyAllegation(WISE.confirmed.alleged_breach ?? "").category).toBe(
      "NO_PERMIT",
    );
    // Either it argues the permit, or a person looks at it — what it must
    // NOT do is ship the keeper-liability template instead.
    expect(["READY", "MANUAL_REVIEW"]).toContain(result.status);
    if (result.status === "READY") {
      expect(result.moduleIds.join(",")).toMatch(/KB-(AUTH|PERMIT|SIGN|ANPR)/);
      expect(result.provider?.providerId).not.toBe("rules-engine");
    }
  }, 180_000);

  it("D an unread notice asks for clarification instead of drafting", async () => {
    const { result, body } = await run(DEAD);

    expect(result.status).toBe("MANUAL_REVIEW");
    expect(["NO_SUBSTANTIVE_GROUND", "NO_SUPPORTED_ROUTE"]).toContain(
      result.reason,
    );
    // Nothing is released to the customer on this path.
    expect(result.status).not.toBe("READY");
    // If a starter letter is attached for the reviewer, it must not be
    // presented as a finished appeal — the status above is what gates it.
    if (body) expect(result.status).toBe("MANUAL_REVIEW");
  }, 180_000);

  /**
   * The regression guard for the actual defect.
   *
   * `rules-engine` releasing a body used to be how a failed
   * case-specific draft became a generic letter. It must no longer be
   * reachable as a *validation-failure* substitute on any of these.
   */
  it("no case releases a rules-engine body after a failed draft", async () => {
    for (const c of [SMART, EURO, WISE, DEAD]) {
      const { answers, answerProvenance } = resolveAnswersWithDefaults(
        c.confirmed,
        c.answers as never,
        c.evidenceTypes,
      );
      const r = await generateValidatedAppeal({
        confirmed: c.confirmed,
        answers,
        answerProvenance,
        evidenceTypes: c.evidenceTypes,
        evidenceRefs: [],
      });
      const downgraded =
        r.status === "READY" &&
        r.warnings.some((w) => /Validation failed on AI draft/i.test(w));
      expect(downgraded, `${c.label} was downgraded`).toBe(false);
    }
  }, 300_000);
});
