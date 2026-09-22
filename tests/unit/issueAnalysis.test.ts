import { describe, expect, it } from "vitest";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { addWorkingDays, analysePofa, BOUNDARY_TOLERANCE_DAYS } from "@/lib/analysis/pofa";
import { ALWAYS_PROHIBITED } from "@/lib/analysis/prohibited";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { deriveKnownFacts, FACT } from "@/lib/questions/facts";
import type { AnswerMap } from "@/lib/questions/types";
import type { ConfirmedPcn } from "@/types";

/**
 * Encodes MASTER Developer Pack V2 Part 5/Part 12, AI Legal Knowledge
 * Base V2 §16/§17/§20 + Appendix B, and Legal Authority & Source
 * Register V1 §3 as executable tests.
 */

function pcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP123456",
    vrm: "AB12CDE",
    parking_location: "Retail Park, Northampton",
    parking_event_date: "2026-05-04", // Monday
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

/* ================= PoFA Schedule 4 ================= */

describe("PoFA working-day arithmetic", () => {
  it("skips weekends when adding working days", () => {
    // 2026-05-08 is a Friday; +2 working days = Tuesday 2026-05-12.
    const d = new Date(Date.UTC(2026, 4, 8));
    expect(addWorkingDays(d, 2).toISOString().slice(0, 10)).toBe("2026-05-12");
  });
});

describe("PoFA paragraph 9 (postal NTK, no prior Notice to Driver)", () => {
  it("classifies the route and finds a clearly compliant notice", () => {
    const facts = deriveKnownFacts({ confirmed: pcn(), answers: answers() });
    const p = analysePofa({ facts });
    expect(p.applicable).toBe(true);
    expect(p.route).toBe("POSTAL");
    expect(p.paragraph).toBe("9");
    expect(p.timingStatus).toBe("COMPLIANT");
    expect(p.deadline).toBe("2026-05-18");
  });

  it("finds a clearly late notice", () => {
    const facts = deriveKnownFacts({
      confirmed: pcn({ notice_issue_date: "2026-06-10" }),
      answers: answers(),
    });
    const p = analysePofa({ facts });
    expect(p.timingStatus).toBe("FAILED");
    expect(p.daysLate).toBeGreaterThan(BOUNDARY_TOLERANCE_DAYS);
    expect(p.reasons.join(" ")).toMatch(/after the 14-day paragraph 9 deadline/);
  });

  it("refuses to allege a failure within the bank-holiday tolerance", () => {
    // Deliberately land just past the deadline.
    const facts = deriveKnownFacts({
      confirmed: pcn({ notice_issue_date: "2026-05-15" }),
      answers: answers(),
    });
    const p = analysePofa({ facts });
    expect(p.timingStatus).toBe("UNRESOLVED");
    expect(p.daysLate).toBeNull();
    expect(p.reasons.join(" ")).toMatch(/no timing failure is alleged/i);
  });

  it("returns UNRESOLVED when a required date is missing", () => {
    const facts = deriveKnownFacts({
      confirmed: pcn({ notice_issue_date: undefined }),
      answers: answers(),
    });
    const p = analysePofa({ facts });
    expect(p.timingStatus).toBe("UNRESOLVED");
    expect(p.unresolved).toContain(FACT.NOTICE_ISSUE_DATE);
  });
});

describe("PoFA paragraph 8 (NTK following a Notice to Driver)", () => {
  it("applies the 28-day route for a windscreen notice", () => {
    const facts = deriveKnownFacts({
      confirmed: pcn({ notice_route: "WINDSCREEN", notice_issue_date: "2026-05-20" }),
      answers: answers(),
    });
    const p = analysePofa({ facts });
    expect(p.route).toBe("WINDSCREEN");
    expect(p.paragraph).toBe("8");
    expect(p.deadline).toBe("2026-06-01");
    expect(p.timingStatus).toBe("COMPLIANT");
  });
});

describe("PoFA applicability gates (Source Register §15)", () => {
  it("does not apply Schedule 4 in Scotland", () => {
    const facts = deriveKnownFacts({
      confirmed: pcn(),
      answers: answers({ [FACT.JURISDICTION]: "SCOTLAND" }),
    });
    const p = analysePofa({ facts });
    expect(p.applicable).toBe(false);
    expect(p.route).toBe("NOT_APPLICABLE");
    expect(p.reasons.join(" ")).toMatch(/England and Wales/);
  });

  it("does not treat a hire vehicle as an ordinary keeper case", () => {
    const facts = deriveKnownFacts({
      confirmed: pcn(),
      answers: answers({ [FACT.VEHICLE_HIRE_STATUS]: "HIRE" }),
    });
    expect(analysePofa({ facts }).applicable).toBe(false);
  });

  it("steps aside once the driver has been formally identified", () => {
    const facts = deriveKnownFacts({
      confirmed: pcn(),
      answers: answers({ [FACT.DRIVER_IDENTIFIED]: "YES" }),
    });
    const p = analysePofa({ facts });
    expect(p.applicable).toBe(false);
    expect(p.reasons.join(" ")).toMatch(/already been formally identified/);
  });
});

/* ================= Prohibited claims ================= */

describe("Prohibited claims (V2 Part 9 + KB §17)", () => {
  it("always bans the obsolete penalty argument and the 10-minute rule", () => {
    const a = analyseCase({ confirmed: pcn(), answers: answers() });
    for (const claim of [
      "OBSOLETE_PENALTY_ARGUMENT",
      "GENUINE_PRE_ESTIMATE_OF_LOSS",
      "UNIVERSAL_10_MINUTE_CANCELLATION",
      "ANPR_PRESENCE_EQUALS_PARKING_TIME",
      "MERGE_CONSIDERATION_AND_GRACE",
      "IDENTIFY_OR_IMPLY_DRIVER",
      "POPLA_IAS_OR_COURT_LANGUAGE",
    ]) {
      expect(a.prohibitedClaims, claim).toContain(claim);
    }
    expect(ALWAYS_PROHIBITED.length).toBeGreaterThan(15);
  });

  it("bans alleging a PoFA timing failure when none is established", () => {
    const a = analyseCase({ confirmed: pcn(), answers: answers() });
    expect(a.pofa.timingStatus).toBe("COMPLIANT");
    expect(a.prohibitedClaims).toContain("ALLEGE_POFA_TIMING_FAILURE");
  });

  it("permits the timing point once a failure is established", () => {
    const a = analyseCase({
      confirmed: pcn({ notice_issue_date: "2026-06-10" }),
      answers: answers(),
    });
    expect(a.pofa.timingStatus).toBe("FAILED");
    expect(a.prohibitedClaims).not.toContain("ALLEGE_POFA_TIMING_FAILURE");
  });

  it("bans residential primacy and lease quotation with no instrument", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "NO",
      }),
    });
    expect(a.prohibitedClaims).toContain("ASSERT_RESIDENTIAL_PRIMACY");
    expect(a.prohibitedClaims).toContain("QUOTE_LEASE_TERMS");
    expect(a.prohibitedClaims).toContain("ASSERT_UNFETTERED_RIGHT");
  });

  it("still bans 'unfettered' when the lease contains a permit clause", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "YES",
        [FACT.AGREEMENT_PERMIT_CLAUSE]: "YES",
      }),
    });
    expect(a.prohibitedClaims).toContain("ASSERT_UNFETTERED_RIGHT");
    expect(a.prohibitedClaims).toContain("IGNORE_PERMIT_OR_REGULATIONS_CLAUSE");
  });

  it("bans frustration unless the breakdown actually prevented departure", () => {
    const notPrevented = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "NO",
      }),
    });
    expect(notPrevented.prohibitedClaims).toContain("ASSERT_FRUSTRATION_OR_IMPOSSIBILITY");

    const prevented = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
      }),
    });
    expect(prevented.prohibitedClaims).not.toContain("ASSERT_FRUSTRATION_OR_IMPOSSIBILITY");
  });

  it("bans claiming evidence is enclosed when none is available", () => {
    const a = analyseCase({ confirmed: pcn(), answers: answers(), evidenceTypes: [] });
    expect(a.prohibitedClaims).toContain("CLAIM_EVIDENCE_ENCLOSED");
  });

  it("always bans quoting case law by default", () => {
    const a = analyseCase({ confirmed: pcn(), answers: answers() });
    expect(a.prohibitedClaims).toContain("QUOTE_CASE_LAW");
  });
});

/* ================= Appendix B ground selection matrix ================= */

describe("Appendix B — AI ground selection matrix", () => {
  it("Breakdown evidence present → breakdown leads", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["breakdown_immobilised", "grace_or_exit"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
        [FACT.BREAKDOWN_EVIDENCE]: ["recovery_report"],
        [FACT.EXIT_DELAY_REASON]: "waiting for recovery",
      }),
      evidenceTypes: ["recovery_report"],
    });
    expect(a.primaryRoute).toBe("BREAKDOWN");
    // Grace remains available but secondary.
    expect(a.secondaryRoutes).toContain("GRACE");
  });

  it("Resident + lease uploaded → residential leads and supersedes generic permit", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["resident_parking_rights", "authorised_or_permit"],
        [FACT.AGREEMENT_UPLOADED]: "YES",
        [FACT.PERMISSION_SOURCE]: "resident_permit",
      }),
      evidenceTypes: ["lease"],
    });
    expect(a.primaryRoute).toBe("RESIDENTIAL");
    expect(a.secondaryRoutes).not.toContain("PERMIT");
  });

  it("Paid + wrong VRM → payment/keying before generic signage", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["payment_made", "vrm_error", "signage_issue"],
        [FACT.PAYMENT_EVIDENCE]: "YES",
        [FACT.VRM_ENTERED]: "AB12CDF",
        [FACT.SIGNAGE_ISSUE_BASIS]: [],
      }),
      evidenceTypes: ["receipt"],
    });
    const order = [a.primaryRoute, ...a.secondaryRoutes];
    expect(order[0]).toBe("KEYING");
    // Unsupported generic signage is suppressed, not merely demoted.
    expect(order).not.toContain("SIGNAGE");
  });

  it("ANPR + multiple visits → ANPR sequence route in play", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["multiple_visits_same_day"],
        [FACT.VISIT_COUNT]: 2,
      }),
    });
    expect([a.primaryRoute, ...a.secondaryRoutes]).toContain("ANPR");
  });

  it("Short entry-to-exit → consideration ranks before grace", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["short_stay_consideration", "grace_or_exit"],
        [FACT.INITIAL_PERIOD_REASON]: "circled looking for a space then left",
        [FACT.EXIT_DELAY_REASON]: "queue at the barrier",
      }),
    });
    const order = [a.primaryRoute, ...a.secondaryRoutes];
    expect(order.indexOf("CONSIDERATION")).toBeLessThan(order.indexOf("GRACE"));
  });

  it("Keeper + valid PoFA defect → PoFA leads", () => {
    const a = analyseCase({
      confirmed: pcn({ notice_issue_date: "2026-06-10" }),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(a.primaryRoute).toBe("POFA");
  });

  it("Hospital emergency ranks ahead of ordinary grounds", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["hospital_attendance", "grace_or_exit"],
        [FACT.HOSPITAL_ATTENDANCE]: "emergency",
        [FACT.EXIT_DELAY_REASON]: "clinical delay",
      }),
    });
    expect(a.primaryRoute).toBe("HOSPITAL");
  });

  it("does not stack every possible ground (KB §16 rule 5)", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: [
          "payment_made", "vrm_error", "signage_issue",
          "landowner_authority_challenge",
        ],
        [FACT.PAYMENT_EVIDENCE]: "YES",
        [FACT.VRM_ENTERED]: "AB12CDF",
        [FACT.SIGNAGE_ISSUE_BASIS]: [],
      }),
      evidenceTypes: ["receipt"],
    });
    const all = [a.primaryRoute, ...a.secondaryRoutes];
    expect(all).not.toContain("SIGNAGE");
    expect(all).not.toContain("LANDOWNER");
  });
});

/* ================= Code version + manual review ================= */

describe("Code applicability and manual review", () => {
  it("resolves the applicable Code version from the event date", () => {
    const a = analyseCase({ confirmed: pcn(), answers: answers() });
    expect(a.codeVersion).toMatch(/v1\.1/);
    expect(a.codeVersionId).toBe("CODE-SINGLE-V1-1");
  });

  it("routes to manual review when the Code version cannot be resolved", () => {
    const a = analyseCase({
      confirmed: pcn({ parking_event_date: undefined }),
      answers: answers(),
    });
    expect(a.codeVersion).toBeNull();
    expect(a.manualReview?.reason).toBe("CODE_VERSION_UNRESOLVED");
    expect(a.missingFacts).toContain("applicable_code_version");
  });

  it("routes a Scotland case to manual review", () => {
    const a = analyseCase({
      confirmed: pcn(),
      answers: answers({ [FACT.JURISDICTION]: "SCOTLAND" }),
    });
    expect(a.manualReview?.reason).toBe("JURISDICTION_SCOTLAND");
  });

  it("records driver status as unidentified on the keeper route", () => {
    const a = analyseCase({ confirmed: pcn(), answers: answers() });
    expect(a.driverStatus).toBe("UNIDENTIFIED");
  });
});

/* ================= Hybrid retrieval (KB §20) ================= */

describe("Hybrid structured retrieval", () => {
  function retrieveFor(extra: AnswerMap, evidenceTypes: string[] = []) {
    const confirmed = pcn();
    const input = { confirmed, answers: answers(extra), evidenceTypes };
    const analysis = analyseCase(input);
    return {
      analysis,
      ...retrieveKnowledge({
        analysis,
        facts: factsForCase(input),
        parkingEventDate: confirmed.parking_event_date,
        evidenceTypes,
      }),
    };
  }

  it("gates payment modules by whether the payment succeeded or failed", () => {
    /*
     * The payment status fact plus real evidence, not a ticked
     * situation category, is what puts a payment ground in play.
     * KB-PAY-01 asserts a payment WAS made, so it stays excluded by the
     * ASSERT_PAYMENT_WAS_MADE prohibition until something evidences it
     * — a tick with nothing behind it used to retrieve it anyway.
     */
    const paid = retrieveFor(
      {
        [FACT.PAYMENT_MADE]: "YES",
        [FACT.PAYMENT_METHOD]: "app",
        [FACT.PAYMENT_EVIDENCE]: "YES",
      },
      ["payment_receipt"],
    );
    expect(paid.output.moduleIds).toContain("KB-PAY-01");
    // Machine-failure and digital-failure modules must not apply.
    expect(paid.output.moduleIds).not.toContain("KB-PAY-02");
    expect(paid.output.moduleIds).not.toContain("KB-PAY-03");

    const failedMachine = retrieveFor({
      [FACT.PAYMENT_MADE]: "ATTEMPTED_FAILED",
      [FACT.PAYMENT_METHOD]: "machine",
    });

    expect(failedMachine.output.moduleIds).toContain("KB-PAY-02");
    expect(failedMachine.output.moduleIds).not.toContain("KB-PAY-03");
  });

  it("retrieves only the keeper-liability threshold module when no defect exists", () => {
    const postal = retrieveFor({});
    expect(postal.output.moduleIds).toContain("KB-POFA-01");
    // The timing modules exist to support an allegation. With no
    // established failure there is nothing for them to say, so they are
    // dropped rather than retrieved and then left unused.
    expect(postal.output.moduleIds).not.toContain("KB-POFA-02");
    expect(postal.output.moduleIds).not.toContain("KB-POFA-03");
  });

  it("gates the timing module to the statutory route once a failure exists", () => {
    const confirmed = pcn({ notice_issue_date: "2026-06-10" });
    const input = { confirmed, answers: answers(), evidenceTypes: [] };
    const analysis = analyseCase(input);
    const r = retrieveKnowledge({
      analysis,
      facts: factsForCase(input),
      parkingEventDate: confirmed.parking_event_date,
    });
    expect(analysis.pofa.timingStatus).toBe("FAILED");
    // Paragraph 9 route engaged, so the postal module applies and the
    // windscreen module does not.
    expect(r.output.moduleIds).toContain("KB-POFA-02");
    expect(r.output.moduleIds).not.toContain("KB-POFA-03");
    expect(r.blocks.map((b) => b.blockId)).toContain("PP-POFA-003");
    expect(r.blocks.map((b) => b.blockId)).not.toContain("PP-POFA-004");
  });

  it("never retrieves the content-defect module without a confirmed defect", () => {
    const r = retrieveFor({});
    expect(r.output.moduleIds).not.toContain("KB-POFA-04");
  });

  it("gates signage modules to the specific basis raised", () => {
    const r = retrieveFor({
      [FACT.SCENARIOS]: ["signage_issue"],
      [FACT.SIGNAGE_ISSUE_BASIS]: ["conflicting_signs"],
    });
    expect(r.output.moduleIds).toContain("KB-SIGN-03");
    expect(r.output.moduleIds).not.toContain("KB-SIGN-02");
  });

  it("never retrieves quiet enjoyment as a universal answer", () => {
    const r = retrieveFor(
      {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "YES",
      },
      ["lease"],
    );
    expect(r.output.moduleIds).not.toContain("KB-RES-05");
  });

  it("only offers derogation from grant when there is no permit clause", () => {
    const withClause = retrieveFor(
      {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "YES",
        [FACT.AGREEMENT_PERMIT_CLAUSE]: "YES",
      },
      ["lease"],
    );
    expect(withClause.output.moduleIds).not.toContain("KB-RES-04");
    // The clause itself must be confronted instead.
    expect(withClause.output.moduleIds).toContain("KB-RES-06");

    const withoutClause = retrieveFor(
      {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "YES",
        [FACT.AGREEMENT_PERMIT_CLAUSE]: "NO",
      },
      ["lease"],
    );
    expect(withoutClause.output.moduleIds).toContain("KB-RES-04");
  });

  it("blocks the payment-evidence paragraph when no evidence exists", () => {
    const none = retrieveFor({ [FACT.SCENARIOS]: ["payment_made"] }, []);
    expect(none.blocks.map((b) => b.blockId)).not.toContain("PP-PAY-002");

    const some = retrieveFor(
      { [FACT.SCENARIOS]: ["payment_made"], [FACT.PAYMENT_EVIDENCE]: "YES" },
      ["receipt"],
    );
    expect(some.blocks.map((b) => b.blockId)).toContain("PP-PAY-002");
  });

  it("blocks the 'no Notice to Keeper received' paragraph unless claimed", () => {
    const r = retrieveFor({ [FACT.SCENARIOS]: ["payment_made"] });
    expect(r.blocks.map((b) => b.blockId)).not.toContain("PP-POFA-002");
  });

  it("never retrieves governance modules for drafting", () => {
    const r = retrieveFor({ [FACT.SCENARIOS]: ["payment_made"] });
    expect(r.modules.every((m) => m.routeFamily !== "GOVERNANCE")).toBe(true);
    expect(r.output.moduleIds.some((id) => id.startsWith("KB-GOV"))).toBe(false);
  });

  it("only retrieves modules for routes actually in play", () => {
    const r = retrieveFor({
      [FACT.SCENARIOS]: ["payment_made"],
      [FACT.PAYMENT_EVIDENCE]: "YES",
    });
    expect(r.output.moduleIds).toContain("KB-PAY-01");
    expect(r.output.moduleIds.some((id) => id.startsWith("KB-RES"))).toBe(false);
    expect(r.output.moduleIds.some((id) => id.startsWith("KB-EQ"))).toBe(false);
  });

  it("drops residential modules when the lease is not available", () => {
    const r = retrieveFor(
      {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "NO",
      },
      [],
    );
    expect(r.output.moduleIds).not.toContain("KB-RES-01");
    const traced = r.trace.find((t) => t.moduleId === "KB-RES-01");
    expect(traced?.eligible).toBe(false);
  });

  it("retrieves residential modules once the lease is uploaded", () => {
    const r = retrieveFor(
      {
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "YES",
      },
      ["lease"],
    );
    expect(r.output.moduleIds).toContain("KB-RES-01");
  });

  it("drops breakdown modules with no supporting evidence", () => {
    const r = retrieveFor(
      {
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
        [FACT.BREAKDOWN_EVIDENCE]: ["none"],
      },
      [],
    );
    expect(r.output.moduleIds).not.toContain("KB-BREAK-01");
  });

  it("only returns ACTIVE drafting blocks", () => {
    const r = retrieveFor({
      [FACT.SCENARIOS]: ["payment_made"],
      [FACT.PAYMENT_EVIDENCE]: "YES",
    });
    expect(r.blocks.every((b) => b.status === "ACTIVE")).toBe(true);
  });

  it("always includes the keeper intro and closing blocks", () => {
    const r = retrieveFor({ [FACT.SCENARIOS]: ["payment_made"] });
    const ids = r.blocks.map((b) => b.blockId);
    expect(ids).toContain("PP-INTRO-001");
    expect(ids).toContain("PP-INTRO-002");
    expect(ids).toContain("PP-END-001");
  });

  it("omits the driver-not-identified block once the driver is identified", () => {
    const confirmed = pcn();
    const analysis = analyseCase({
      confirmed,
      answers: answers({ [FACT.DRIVER_IDENTIFIED]: "YES" }),
    });
    const r = retrieveKnowledge({
      analysis,
      parkingEventDate: confirmed.parking_event_date,
    });
    expect(r.blocks.map((b) => b.blockId)).not.toContain("PP-INTRO-002");
  });

  it("emits the KB §18 retrieval output schema", () => {
    const r = retrieveFor({
      [FACT.SCENARIOS]: ["payment_made"],
      [FACT.PAYMENT_EVIDENCE]: "YES",
    });
    const o = r.output;
    for (const key of [
      "primaryRoute", "secondaryRoutes", "moduleIds", "verifiedFacts",
      "missingFacts", "evidenceRefs", "prohibitedClaims", "codeVersion",
      "pofaRoute", "driverStatus",
    ]) {
      expect(o, key).toHaveProperty(key);
    }
    expect(o.pofaRoute).toBe("POSTAL");
    expect(o.driverStatus).toBe("UNIDENTIFIED");
  });

  it("records a decision trace for every module", () => {
    const r = retrieveFor({ [FACT.SCENARIOS]: ["payment_made"] });
    expect(r.trace.length).toBe(58);
    expect(r.trace.every((t) => t.reason.length > 0)).toBe(true);
  });
});

/* ================= Worked examples (V2 Part 12) ================= */

describe("V2 Part 12 worked scenarios", () => {
  it("Example A — breakdown prioritises the breakdown analysis", () => {
    const a = analyseCase({
      confirmed: pcn({ alleged_breach: "Overstayed by 47 minutes" }),
      answers: answers({
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_NATURE]: "mechanical_failure",
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
        [FACT.BREAKDOWN_EVIDENCE]: ["recovery_report"],
      }),
      evidenceTypes: ["recovery_report"],
    });
    expect(a.primaryRoute).toBe("BREAKDOWN");
    // Must not promise automatic frustration.
    expect(a.prohibitedClaims).toContain("AUTOMATIC_FRUSTRATION_FROM_BREAKDOWN");
  });

  it("Example B — resident with allocated bay leads on the lease", () => {
    const a = analyseCase({
      confirmed: pcn({ alleged_breach: "No valid permit displayed" }),
      answers: answers({
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.OCCUPIER_STATUS]: "tenant",
        [FACT.AGREEMENT_UPLOADED]: "YES",
        [FACT.AGREEMENT_PERMIT_CLAUSE]: "NO",
        [FACT.BAY_REFERENCE]: "Bay 14",
      }),
      evidenceTypes: ["lease"],
    });
    expect(a.primaryRoute).toBe("RESIDENTIAL");
    expect(a.prohibitedClaims).not.toContain("ASSERT_RESIDENTIAL_PRIMACY");
  });

  it("Example C — payment plus minor keying error", () => {
    const confirmed = pcn();
    const a = analyseCase({
      confirmed,
      answers: answers({
        [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
        [FACT.PAYMENT_METHOD]: "app",
        [FACT.PAYMENT_EVIDENCE]: "YES",
        [FACT.VRM_ENTERED]: "AB12CDF",
      }),
      evidenceTypes: ["receipt"],
    });
    const r = retrieveKnowledge({
      analysis: a,
      parkingEventDate: confirmed.parking_event_date,
      evidenceTypes: ["receipt"],
    });
    expect([a.primaryRoute, ...a.secondaryRoutes]).toContain("KEYING");
    expect(r.output.moduleIds).toContain("KB-KEY-01");
    expect(r.output.moduleIds).toContain("KB-PAY-01");
  });

  it("Example D — keeper with late postal NTK, driver never identified", () => {
    const a = analyseCase({
      confirmed: pcn({ notice_issue_date: "2026-06-10" }),
      answers: answers(),
    });
    expect(a.primaryRoute).toBe("POFA");
    expect(a.pofa.paragraph).toBe("9");
    expect(a.pofa.timingStatus).toBe("FAILED");
    expect(a.driverStatus).toBe("UNIDENTIFIED");
    // Keeper liability failing does not make the charge itself void.
    expect(a.prohibitedClaims).toContain(
      "ASSERT_CHARGE_VOID_FROM_KEEPER_LIABILITY_FAILURE",
    );
  });
});
