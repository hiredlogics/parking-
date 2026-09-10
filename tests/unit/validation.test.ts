/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { validateDraft, summariseForRegeneration } from "@/lib/validation/engine";
import { runReleaseChecklist } from "@/lib/validation/releaseChecklist";
import { VALIDATORS } from "@/lib/validation/validators";
import { ALL_VALIDATOR_CODES } from "@/lib/kb/types";
import { generateValidatedAppeal } from "@/lib/generation/engine";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { resetDraftingProvider } from "@/services/ai/drafting";
import { FACT } from "@/lib/questions/facts";
import type { AnswerMap } from "@/lib/questions/types";
import type { ValidatorContext } from "@/lib/validation/context";
import type { ConfirmedPcn } from "@/types";

/**
 * MASTER Developer Pack V2 Part 10 and AI Legal Knowledge Base V2 §17
 * and Appendix C, encoded as tests.
 */

function pcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP123456",
    vrm: "AB12CDE",
    parking_location: "Retail Park, Northampton",
    parking_event_date: "2026-05-04",
    notice_issue_date: "2026-05-06",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "Overstayed the maximum period",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: new Date().toISOString(),
    ...over,
  };
}

function answers(extra: AnswerMap = {}): AnswerMap {
  return {
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
    ...extra,
  };
}

/** Build a validator context with an arbitrary body. */
function ctxFor(
  body: string,
  extra: AnswerMap = {},
  evidenceTypes: string[] = [],
  confirmedOver: Partial<ConfirmedPcn> = {},
): ValidatorContext {
  const confirmed = pcn(confirmedOver);
  const input = { confirmed, answers: answers(extra), evidenceTypes };
  const analysis = analyseCase(input);
  const facts = factsForCase(input);
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: confirmed.parking_event_date,
    evidenceTypes,
  });
  return {
    body,
    analysis,
    modules: retrieval.modules,
    sources: retrieval.sources,
    facts,
    evidence: new Set(evidenceTypes),
    variables: {
      vrm: confirmed.vrm ?? "",
      pcn_number: confirmed.pcn_number ?? "",
      operator_name: confirmed.operator_name ?? "",
    },
  };
}

const CLEAN_BODY = `I write as the registered keeper of vehicle AB12CDE in respect of Parking Charge Notice ECP123456. I dispute liability for this parking charge.

This appeal is submitted by the registered keeper. No admission is made as to the identity of the driver.

Where the operator seeks to recover the charge from the registered keeper rather than the driver, it must establish that the statutory conditions for keeper liability under Schedule 4 of the Protection of Freedoms Act 2012 have been satisfied.

The operator is requested to cancel Parking Charge Notice ECP123456.`;

/* ===================== Engine wiring ===================== */

describe("Validation engine", () => {
  it("registers all thirteen validators exactly once", () => {
    // Thirteen since VAL-UNSUPPORTED completed the MASTER V2 Part 10
    // set with unsupported claims and source governance.
    expect(VALIDATORS).toHaveLength(13);
    const codes = VALIDATORS.map((v) => v.code).sort();
    expect(codes).toEqual([...ALL_VALIDATOR_CODES].sort());
  });

  it("passes a clean keeper-route draft", () => {
    const run = validateDraft(ctxFor(CLEAN_BODY));
    expect(run.status).toBe("PASS");
    expect(run.blockingCount).toBe(0);
  });

  it("reports which validators passed", () => {
    const run = validateDraft(ctxFor(CLEAN_BODY));
    expect(run.passed).toContain("VAL-DRIVER");
    expect(run.passed.length).toBe(13);
  });

  it("fails the whole run on a single blocking issue", () => {
    const run = validateDraft(ctxFor(`${CLEAN_BODY}\n\nI parked in the bay.`));
    expect(run.status).toBe("FAIL");
    expect(run.blockingCount).toBeGreaterThan(0);
  });

  it("produces regeneration feedback naming the offending codes", () => {
    const run = validateDraft(ctxFor(`${CLEAN_BODY}\n\nI drove to the site.`));
    const summary = summariseForRegeneration(run);
    expect(summary).toMatch(/REJECTED by the independent validator/);
    expect(summary).toMatch(/VAL-DRIVER/);
  });
});

/* ===================== Individual validators ===================== */

describe("VAL-DRIVER", () => {
  it("blocks first-person driver admissions", () => {
    const run = validateDraft(ctxFor("I drove into the car park and I parked."));
    expect(run.byValidator["VAL-DRIVER"].length).toBeGreaterThan(0);
    expect(run.byValidator["VAL-DRIVER"][0].severity).toBe("BLOCKING");
  });

  it("blocks statements that the keeper was driving", () => {
    const run = validateDraft(ctxFor("The registered keeper drove to the site."));
    expect(run.byValidator["VAL-DRIVER"].length).toBeGreaterThan(0);
  });

  it("blocks third-person attribution of driving", () => {
    const run = validateDraft(ctxFor("When she parked, the barrier was open."));
    expect(run.byValidator["VAL-DRIVER"].length).toBeGreaterThan(0);
  });

  it("allows neutral keeper-safe wording", () => {
    const run = validateDraft(
      ctxFor("The vehicle was parked and a payment was made for the session.", {
        [FACT.SCENARIOS]: ["payment_made"],
      }),
    );
    expect(run.byValidator["VAL-DRIVER"]).toEqual([]);
  });
});

describe("VAL-FACT", () => {
  it("blocks a date not established by the case", () => {
    const run = validateDraft(ctxFor("The event occurred on 2026-01-01."));
    expect(run.byValidator["VAL-FACT"].some((i) => i.message.includes("date"))).toBe(true);
  });

  it("accepts the confirmed event date in long form", () => {
    const run = validateDraft(ctxFor("The parking event occurred on 4 May 2026."));
    expect(run.byValidator["VAL-FACT"]).toEqual([]);
  });

  it("blocks a registration that is not the confirmed vehicle", () => {
    const run = validateDraft(ctxFor("The vehicle ZZ99 XYZ was present."));
    expect(
      run.byValidator["VAL-FACT"].some((i) =>
        i.message.includes("vehicle registration"),
      ),
    ).toBe(true);
  });

  it("blocks the obsolete pre-estimate-of-loss argument", () => {
    const run = validateDraft(
      ctxFor("The charge is not a genuine pre-estimate of loss."),
    );
    expect(
      run.byValidator["VAL-FACT"].some((i) => i.message.includes("pre-estimate")),
    ).toBe(true);
  });

  it("blocks the unlawful-penalty argument", () => {
    const run = validateDraft(ctxFor("This charge is an unenforceable penalty."));
    expect(run.byValidator["VAL-FACT"].length).toBeGreaterThan(0);
  });
});

describe("VAL-EVIDENCE", () => {
  it("blocks enclosure claims when no evidence exists", () => {
    const run = validateDraft(ctxFor("Evidence of payment is enclosed."));
    expect(run.byValidator["VAL-EVIDENCE"].length).toBeGreaterThan(0);
    expect(run.byValidator["VAL-EVIDENCE"][0].severity).toBe("BLOCKING");
  });

  it("allows enclosure claims once evidence exists", () => {
    const run = validateDraft(
      ctxFor("Evidence of payment is enclosed.", { [FACT.SCENARIOS]: ["payment_made"] }, ["receipt"]),
    );
    expect(run.byValidator["VAL-EVIDENCE"]).toEqual([]);
  });
});

describe("VAL-POFA", () => {
  it("blocks a timing allegation with no established failure", () => {
    const run = validateDraft(
      ctxFor("The Notice to Keeper was not delivered within the relevant period."),
    );
    expect(run.byValidator["VAL-POFA"].length).toBeGreaterThan(0);
  });

  it("allows the timing allegation once a failure is established", () => {
    const run = validateDraft(
      ctxFor(
        "The Notice to Keeper was not delivered within the relevant statutory period.",
        {},
        [],
        { notice_issue_date: "2026-06-10" },
      ),
    );
    expect(run.byValidator["VAL-POFA"]).toEqual([]);
  });

  it("blocks asserting the charge itself is void", () => {
    const run = validateDraft(ctxFor("The parking charge is therefore void."));
    expect(
      run.byValidator["VAL-POFA"].some((i) => i.message.includes("charge itself is void")),
    ).toBe(true);
  });
});

describe("VAL-CODE", () => {
  it("blocks Code reliance when the version is unresolved", () => {
    const run = validateDraft(
      ctxFor("The applicable Code of Practice provides a grace period.", {}, [], {
        parking_event_date: undefined,
      }),
    );
    expect(run.byValidator["VAL-CODE"].length).toBeGreaterThan(0);
  });

  it("blocks naming the wrong Code version", () => {
    const run = validateDraft(
      ctxFor("Under the Code of Practice version 9 a grace period applies."),
    );
    expect(
      run.byValidator["VAL-CODE"].some((i) => i.message.includes("version 9")),
    ).toBe(true);
  });

  it("blocks a universal 10-minute cancellation rule", () => {
    const run = validateDraft(
      ctxFor("A period of 10 minutes must automatically cancel the charge."),
    );
    expect(run.byValidator["VAL-CODE"].length).toBeGreaterThan(0);
  });
});

describe("VAL-RES", () => {
  it("blocks asserted lease rights with no instrument", () => {
    const run = validateDraft(
      ctxFor("The vehicle was parked pursuant to pre-existing parking rights.", {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "NO",
      }),
    );
    expect(run.byValidator["VAL-RES"].length).toBeGreaterThan(0);
  });

  it("blocks 'unfettered' without a supporting instrument", () => {
    const run = validateDraft(ctxFor("The lease grants an unfettered right to park."));
    expect(
      run.byValidator["VAL-RES"].some((i) => i.message.includes("unfettered")),
    ).toBe(true);
  });

  it("blocks primacy that ignores an existing permit clause", () => {
    const run = validateDraft(
      ctxFor(
        "The vehicle was parked pursuant to pre-existing parking rights granted by the agreement.",
        {
          [FACT.SCENARIOS]: ["resident_parking_rights"],
          [FACT.AGREEMENT_UPLOADED]: "YES",
          [FACT.AGREEMENT_PERMIT_CLAUSE]: "YES",
        },
        ["lease"],
      ),
    );
    expect(
      run.byValidator["VAL-RES"].some((i) =>
        i.message.includes("without addressing that clause"),
      ),
    ).toBe(true);
  });

  it("blocks quiet enjoyment framed as immunity from regulation", () => {
    const run = validateDraft(
      ctxFor(
        "The covenant for quiet enjoyment means the resident is free from all parking regulation.",
        { [FACT.SCENARIOS]: ["resident_parking_rights"], [FACT.AGREEMENT_UPLOADED]: "YES" },
        ["lease"],
      ),
    );
    expect(run.byValidator["VAL-RES"].length).toBeGreaterThan(0);
  });
});

describe("VAL-BREAK", () => {
  it("blocks automatic frustration language", () => {
    const run = validateDraft(
      ctxFor("A breakdown automatically frustrates the parking contract.", {
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
      }),
    );
    expect(run.byValidator["VAL-BREAK"].length).toBeGreaterThan(0);
  });

  it("blocks frustration when prevention is not established", () => {
    const run = validateDraft(
      ctxFor("The obligation was rendered impossible by a supervening event.", {
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "NO",
      }),
    );
    expect(run.byValidator["VAL-BREAK"].length).toBeGreaterThan(0);
  });

  it("blocks immobilisation claims with no breakdown established", () => {
    const run = validateDraft(ctxFor("The vehicle became mechanically immobilised."));
    expect(run.byValidator["VAL-BREAK"].length).toBeGreaterThan(0);
  });

  it("allows a properly grounded breakdown argument", () => {
    const run = validateDraft(
      ctxFor(
        "The vehicle became mechanically immobilised and could not reasonably be moved during the relevant period.",
        {
          [FACT.SCENARIOS]: ["breakdown_immobilised"],
          [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
        },
        ["recovery_report"],
      ),
    );
    expect(run.byValidator["VAL-BREAK"]).toEqual([]);
  });
});

describe("VAL-EQ", () => {
  it("blocks an Equality Act ground with no disability facts", () => {
    const run = validateDraft(
      ctxFor("The operator owed a reasonable adjustment under the Equality Act."),
    );
    expect(run.byValidator["VAL-EQ"].length).toBeGreaterThan(0);
  });

  it("allows it once the facts are established", () => {
    const run = validateDraft(
      ctxFor("A reasonable adjustment was required in the circumstances.", {
        [FACT.SCENARIOS]: ["accessibility_additional_time"],
        [FACT.ADDITIONAL_TIME_NEEDED]: "extra time was needed to reach the machine",
      }),
    );
    expect(
      run.byValidator["VAL-EQ"].filter((i) => i.severity === "BLOCKING"),
    ).toEqual([]);
  });

  it("blocks equating a Blue Badge with the statutory test", () => {
    const run = validateDraft(
      ctxFor("A Blue Badge therefore entitles the holder to park without charge.", {
        [FACT.SCENARIOS]: ["accessibility_additional_time"],
        [FACT.ADDITIONAL_TIME_NEEDED]: "extra time needed",
      }),
    );
    expect(run.byValidator["VAL-EQ"].length).toBeGreaterThan(0);
  });
});

describe("VAL-ANPR", () => {
  it("blocks a generic calibration demand", () => {
    const run = validateDraft(
      ctxFor("Please provide the calibration records for the cameras.", {
        [FACT.SCENARIOS]: ["anpr_disputed"],
      }),
    );
    expect(run.byValidator["VAL-ANPR"].length).toBeGreaterThan(0);
  });

  it("allows a calibration request where a discrepancy was identified", () => {
    const run = validateDraft(
      ctxFor("Please provide the calibration records for the cameras.", {
        [FACT.SCENARIOS]: ["anpr_disputed"],
        [FACT.CONTINUOUS_PRESENCE]: "the exit image is timestamped 30 minutes late",
      }),
    );
    expect(run.byValidator["VAL-ANPR"]).toEqual([]);
  });

  it("blocks 'ANPR is unreliable' with no basis", () => {
    const run = validateDraft(ctxFor("ANPR is inherently unreliable."));
    expect(run.byValidator["VAL-ANPR"].length).toBeGreaterThan(0);
  });

  it("blocks equating entry-to-exit with parking time", () => {
    const run = validateDraft(
      ctxFor("The entry-to-exit interval is the parking period relied upon."),
    );
    expect(run.byValidator["VAL-ANPR"].length).toBeGreaterThan(0);
  });
});

describe("VAL-STAGE", () => {
  it("blocks POPLA and IAS references", () => {
    for (const body of [
      "This will be escalated to POPLA.",
      "The IAS will consider this appeal.",
    ]) {
      const run = validateDraft(ctxFor(body));
      expect(run.byValidator["VAL-STAGE"].length, body).toBeGreaterThan(0);
    }
  });

  it("blocks court and litigation language", () => {
    for (const body of [
      "A county court claim would fail.",
      "This is our defence to the claim.",
      "See the particulars of claim.",
      "Under CPR the claim is defective.",
    ]) {
      const run = validateDraft(ctxFor(body));
      expect(run.byValidator["VAL-STAGE"].length, body).toBeGreaterThan(0);
    }
  });

  it("allows the generic independent-appeal next step", () => {
    const run = validateDraft(
      ctxFor(
        "If rejected, please provide the reference required to pursue the applicable independent appeal route.",
      ),
    );
    expect(run.byValidator["VAL-STAGE"]).toEqual([]);
  });
});

describe("VAL-CONFLICT", () => {
  it("blocks asserting a payment that was not made", () => {
    const run = validateDraft(ctxFor("A payment was made for the parking session."));
    expect(run.byValidator["VAL-CONFLICT"].length).toBeGreaterThan(0);
  });

  it("blocks contradicting a completed payment", () => {
    const run = validateDraft(
      ctxFor("The payment could not be completed at the machine.", {
        [FACT.SCENARIOS]: ["payment_made"],
      }),
    );
    expect(run.byValidator["VAL-CONFLICT"].length).toBeGreaterThan(0);
  });

  it("blocks claiming no Notice to Keeper when one was confirmed", () => {
    const run = validateDraft(
      ctxFor("The registered keeper has not received a Notice to Keeper."),
    );
    expect(run.byValidator["VAL-CONFLICT"].length).toBeGreaterThan(0);
  });

  it("blocks multiple-visit wording for a single visit", () => {
    const run = validateDraft(
      ctxFor("The vehicle attended the location on more than one separate occasion."),
    );
    expect(run.byValidator["VAL-CONFLICT"].length).toBeGreaterThan(0);
  });
});

describe("VAL-REPETITION", () => {
  it("blocks a near-identical sentence repeated", () => {
    const repeated =
      "The operator should review its payment records against the parking event before continuing enforcement action here.";
    const run = validateDraft(ctxFor(`${repeated}\n\n${repeated}`));
    const issues = run.byValidator["VAL-REPETITION"];
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].severity).toBe("BLOCKING");
  });

  it("does not flag distinct paragraphs", () => {
    const run = validateDraft(ctxFor(CLEAN_BODY));
    expect(run.byValidator["VAL-REPETITION"]).toEqual([]);
  });
});

/* ===================== Appendix C checklist ===================== */

describe("Appendix C release checklist", () => {
  it("passes a clean keeper-route draft", () => {
    const c = runReleaseChecklist(ctxFor(CLEAN_BODY));
    expect(c.passed).toBe(true);
    expect(c.items.length).toBe(12);
  });

  it("fails when the Code version cannot be resolved", () => {
    const c = runReleaseChecklist(
      ctxFor(CLEAN_BODY, {}, [], { parking_event_date: undefined }),
    );
    expect(c.failedIds).toContain("CODE_VERSION_RESOLVED");
  });

  it("fails when reference details are missing from the letter", () => {
    const c = runReleaseChecklist(ctxFor("A short letter with no references."));
    expect(c.failedIds).toContain("REFERENCES_MATCH");
  });

  it("fails on wrong-stage language", () => {
    const c = runReleaseChecklist(ctxFor(`${CLEAN_BODY}\n\nWe will go to POPLA.`));
    expect(c.failedIds).toContain("CORRECT_STAGE");
  });

  it("fails when the letter is not concise", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Paragraph number ${i} of the letter.`).join("\n\n");
    const c = runReleaseChecklist(ctxFor(long));
    expect(c.failedIds).toContain("CONCISE_AND_COHERENT");
  });
});

/* ===================== Generation orchestration ===================== */

describe("Generation pipeline", () => {
  const saved = process.env.DRAFTING_PROVIDER;
  beforeEach(() => {
    process.env.DRAFTING_PROVIDER = "deterministic";
    resetDraftingProvider();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DRAFTING_PROVIDER;
    else process.env.DRAFTING_PROVIDER = saved;
    resetDraftingProvider();
  });

  it("releases a valid appeal", async () => {
    const r = await generateValidatedAppeal({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["payment_made"],
        [FACT.PAYMENT_METHOD]: "app",
        [FACT.PAYMENT_EVIDENCE]: "YES",
      }),
      evidenceTypes: ["receipt"],
    });
    expect(r.status).toBe("READY");
    expect(r.body).toBeTruthy();
    expect(r.attempts[0].validation.status).toBe("PASS");
    expect(r.attempts[0].checklist.passed).toBe(true);
  });

  it("routes an out-of-scope case to manual review before drafting", async () => {
    const r = await generateValidatedAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.JURISDICTION]: "SCOTLAND" }),
    });
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reason).toBe("JURISDICTION_SCOTLAND");
    expect(r.body).toBeNull();
    expect(r.attempts).toHaveLength(0);
  });

  it("never releases a body when status is not READY", async () => {
    const r = await generateValidatedAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.JURISDICTION]: "SCOTLAND" }),
    });
    expect(r.body).toBeNull();
  });

  it("does not retry a deterministic provider", async () => {
    const r = await generateValidatedAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.attempts.length).toBeLessThanOrEqual(1);
  });

  it("records the provider and validator versions for audit", async () => {
    const r = await generateValidatedAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.provider?.providerId).toBe("deterministic-draft");
    expect(r.generationVersion).toBe("generation-v1");
    expect(r.attempts[0].validation.validatorVersion).toBe("validator-v1");
  });

  it("surfaces warnings without blocking release", async () => {
    const r = await generateValidatedAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.status).toBe("READY");
    expect(r.warnings.join(" ")).toMatch(/not bespoke/i);
  });
});
