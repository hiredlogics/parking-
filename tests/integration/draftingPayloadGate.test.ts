// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts } from "@/lib/facts/facts";
import { analyseCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { resolveAnswersWithDefaults } from "@/lib/rules/factDefaults";
import { assessGroundSufficiency } from "@/lib/generation/groundGuard";
import { generateValidatedAppeal } from "@/lib/generation/engine";

/**
 * The drafting payload, and the gate in front of it.
 *
 * Three cases, chosen to pin the gate's boundaries:
 *
 *   euro-car-parks   a conduct issue with customer answers — must draft
 *   smart-parking    no allegation at all, but a PROVEN late notice —
 *                    must still draft, because the argument is real
 *   extraction-dead  nothing established — must NOT draft
 *
 * The middle case is the one worth arguing about, and the reason the
 * gate keys on "substantive ground" rather than on the allegation
 * alone. See the carve-out note in lib/generation/groundGuard.ts.
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

const EURO = {
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
    payment_evidence: "NO",
    "__askedfact:payment_made": true,
    "__askedfact:payment_method": true,
    "__askedfact:vrm_entered": true,
    "__askedfact:keying_error": true,
    "__askedfact:payment_evidence": true,
  },
};

const SMART = {
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
    alleged_breach: undefined,
  }),
  answers: {},
};

/**
 * The client's actual symptom, isolated.
 *
 * Identifiers and dates present, PoFA timing sound, and the ONE thing
 * missing is the contravention — which is what a photographed notice
 * looks like after vision extraction falls back to the text reader.
 *
 * Deliberately NOT an empty fixture: an empty one trips the older
 * unresolved-variables guard (`NO_SUPPORTED_ROUTE`) before reaching
 * this gate, which would prove nothing about the gate.
 */
const DEAD = {
  confirmed: notice({
    operator_name: "Smart Parking Ltd",
    pcn_number: "SP62712518",
    vrm: "FD18BOF",
    parking_event_date: "2026-08-29",
    notice_issue_date: "2026-09-04",
    charge_amount: 100,
    alleged_breach: undefined,
  }),
  answers: {},
};

async function gateFor(c: { confirmed: ConfirmedPcn; answers: Record<string, unknown> }) {
  const { answers, answerProvenance } = resolveAnswersWithDefaults(
    c.confirmed,
    c.answers as never,
    [],
  );
  const facts = deriveKnownFacts({
    confirmed: c.confirmed,
    answers,
    evidenceTypes: [],
    answerProvenance,
  });
  const analysis = await analyseCase({
    confirmed: c.confirmed,
    answers,
    evidenceTypes: [],
    evidenceRefs: [],
    pofaConfig: await loadPofaConfig(),
  });
  const ground = await assessGroundSufficiency({
    facts,
    analysis,
    evidenceTypes: [],
  });
  return { ground, analysis, answers, answerProvenance };
}

function show(label: string, g: Awaited<ReturnType<typeof gateFor>>["ground"]) {
  console.log(`\n=== GROUND GATE :: ${label} ===`);
  console.log(`  allegation            : ${g.allegation.category} (${g.allegation.matched ?? "-"})`);
  console.log(`  active issues         : ${g.activeIssues.join(", ") || "(none)"}`);
  console.log(`  substantive issues    : ${g.substantiveIssues.join(", ") || "(none)"}`);
  console.log(`  established PoFA defect: ${g.establishedPofaDefect}`);
  console.log(`  assertable facts      : ${g.assertableFactCount}`);
  console.log(`  missing facts         : ${g.missingFacts.join(", ") || "(none)"}`);
  console.log(`  DECISION              : ${g.ok ? "DRAFT" : `STOP — ${g.reason}`}`);
  if (!g.ok) console.log(`  detail                : ${g.detail}`);
}

describe("the drafting payload gate", () => {
  it("Euro Car Parks — conduct issue with answers, drafts", async () => {
    const { ground } = await gateFor(EURO);
    show("euro-car-parks (payment/keying)", ground);

    expect(ground.ok).toBe(true);
    expect(ground.allegation.category).toBe("NO_VALIDATION");
    expect(ground.substantiveIssues).toContain("PAYMENT_KEYING");
    // The customer's own answers are assertable, which is what makes a
    // bespoke argument possible at all.
    expect(ground.assertableFactCount).toBeGreaterThan(10);
  }, 60_000);

  it("Smart Parking — no allegation, but a proven late notice still drafts", async () => {
    const { ground, analysis } = await gateFor(SMART);
    show("smart-parking (no allegation, PoFA timing failed)", ground);

    expect(ground.allegation.category).toBe("UNKNOWN");
    expect(ground.substantiveIssues).toHaveLength(0);
    // The carve-out: established, not merely unresolved.
    expect(analysis.pofa.timingStatus).toBe("FAILED");
    expect(ground.establishedPofaDefect).toBe(true);
    expect(ground.ok).toBe(true);
  }, 60_000);

  it("allegation not extracted — nothing established, so generation STOPS", async () => {
    const { ground, analysis } = await gateFor(DEAD);
    show("allegation-missing (timing sound)", ground);

    // Nothing else is wrong with this case, which is the point.
    expect(analysis.pofa.timingStatus).not.toBe("FAILED");
    expect(ground.ok).toBe(false);
    expect(ground.reason).toBe("NO_SUBSTANTIVE_GROUND");
    expect(ground.detail).toMatch(/could not be identified/i);
    expect(ground.substantiveIssues).toHaveLength(0);
    expect(ground.establishedPofaDefect).toBe(false);
  }, 60_000);

  /**
   * The gate has to hold in the real engine, not merely as a function.
   *
   * NOTE ON WHICH GUARD FIRES. With the allegation missing and the
   * timing sound, no route is assessed at all, so `analyseCase` stops
   * the case at NO_SUPPORTED_ROUTE (lib/analysis/engine.ts:127) before
   * the ground gate is consulted. The gate is the narrower second net,
   * for cases where a route IS assessed but nothing substantive is
   * established. Asserting the specific reason here would be asserting
   * guard ordering; what matters to the customer is that no letter is
   * released.
   */
  it("the engine refuses to release a letter for an unidentified case", async () => {
    const r = await generateValidatedAppeal({
      confirmed: DEAD.confirmed,
      answers: {},
      evidenceTypes: [],
      evidenceRefs: [],
    });
    console.log(`\n=== ENGINE :: allegation-missing ===`);
    console.log(`  status   : ${r.status}`);
    console.log(`  reason   : ${r.reason}`);
    console.log(`  warnings : ${r.warnings.join(" | ")}`);

    expect(r.status).toBe("MANUAL_REVIEW");
    expect(["NO_SUBSTANTIVE_GROUND", "NO_SUPPORTED_ROUTE"]).toContain(r.reason);
  }, 120_000);

  /**
   * The case the client called generic, end to end.
   *
   * This is the one the gate lets through on the PoFA carve-out, so the
   * letter it produces is exactly what that decision costs or buys.
   * Printed in full rather than asserted on, because whether a
   * PoFA-only letter reads as "generic" is a judgement for a human.
   */
  it("Smart Parking through the engine — what the carve-out actually releases", async () => {
    // Defaults resolved first, as the case service does before calling
    // generation. Passing the raw answer map instead leaves
    // driver_identified unset, no PoFA route is assessed, and the case
    // stops at NO_SUPPORTED_ROUTE for a reason unrelated to this gate.
    const { answers, answerProvenance } = resolveAnswersWithDefaults(
      SMART.confirmed,
      SMART.answers as never,
      [],
    );
    const r = await generateValidatedAppeal({
      confirmed: SMART.confirmed,
      answers,
      answerProvenance,
      evidenceTypes: [],
      evidenceRefs: [],
    });
    console.log(`\n=== ENGINE :: smart-parking ===`);
    console.log(`  status  : ${r.status}  reason=${r.reason ?? "-"}`);
    console.log(`  provider: ${r.provider?.providerId ?? "-"} bespoke=${r.provider?.bespoke ?? "-"}`);
    console.log(`  modules : ${r.moduleIds.join(", ") || "(none)"}`);
    console.log(`  warnings:\n${r.warnings.map((w) => `    - ${w}`).join("\n") || "    (none)"}`);
    console.log(`  argues the late Notice to Keeper? ${
      /not\s+(?:given|delivered|served)\s+within/i.test(r.body ?? "") ? "YES" : "NO"
    }`);
    console.log(`  states both dates? ${
      (r.body ?? "").includes("10 August 2026") &&
      (r.body ?? "").includes("27 August 2026")
        ? "YES"
        : "NO"
    }`);
    console.log(`  --- body ---\n${r.body ?? "(none released)"}`);

    // Whatever it says, it must not have been silently dropped.
    expect(r.status === "READY" || r.status === "MANUAL_REVIEW").toBe(true);
  }, 120_000);

  /** And it must not have become a blanket refusal. */
  it("the engine still produces a letter for Euro Car Parks", async () => {
    const r = await generateValidatedAppeal({
      confirmed: EURO.confirmed,
      answers: EURO.answers as never,
      evidenceTypes: [],
      evidenceRefs: [],
    });
    console.log(`\n=== ENGINE :: euro-car-parks ===`);
    console.log(`  status  : ${r.status}  reason=${r.reason ?? "-"}`);
    console.log(`  modules : ${r.moduleIds.join(", ")}`);
    console.log(`  body    : ${r.body ? `${r.body.length} chars` : "(none)"}`);

    expect(r.reason).not.toBe("NO_SUBSTANTIVE_GROUND");
    expect(r.moduleIds.length).toBeGreaterThan(0);
  }, 120_000);
});
