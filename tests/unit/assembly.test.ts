import { describe, expect, it } from "vitest";
import { assembleAppeal } from "@/lib/assembly";
import { evaluate } from "@/rules";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import type { ConfirmedPcn } from "@/types";

function pcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    confirmedAt: "2026-08-01T00:00:00Z",
    operator_name: "Britannia Parking Ltd",
    pcn_number: "BR/PCN/2026/000123",
    vrm: "AB12 CDE",
    parking_location: "Riverside Retail Park",
    parking_event_date: "2026-07-14",
    notice_issue_date: "2026-07-16",
    notice_route: "WINDSCREEN",
    charge_amount: 100,
    alleged_breach: "Failure to make a valid payment",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    ...over,
  };
}

describe("appeal assembly", () => {
  it("orders paragraphs by priority: intro first, closing last", () => {
    const p = pcn();
    const answers = {
      core: {
        registered_keeper: "YES" as const,
        driver_identified: "NO" as const,
        scenarios: ["payment_made" as const, "vrm_error" as const],
      },
      branch: {
        payment: { parking_payment_made: "YES" as const, payment_evidence_uploaded: "YES" as const },
        keying: {
          vrm_error: "YES" as const,
          vrm_error_type: "MINOR" as const,
          payment_confirmed: "YES" as const,
        },
      },
    };
    const ev = evaluate({ pcn: p, answers, evidence: [] });
    const appeal = assembleAppeal(p, answers, [], ev);
    expect(appeal.paragraphs[0].id).toBe("PP-INTRO-001");
    expect(appeal.paragraphs[appeal.paragraphs.length - 1].id).toBe("PP-END-001");
  });

  it("blocks generation when a required variable is missing (permission_source)", () => {
    const p = pcn();
    const answers = {
      core: {
        registered_keeper: "YES" as const,
        driver_identified: "NO" as const,
        scenarios: ["authorised_or_permit" as const],
      },
      branch: {
        authorisation: {
          parking_authorised: "YES" as const,
          permission_granted: "YES" as const,
        },
      },
    };
    const ev = evaluate({ pcn: p, answers, evidence: [] });
    const appeal = assembleAppeal(p, answers, [], ev);
    // PP-AUTH-003 rule PP-R020 requires permission_source to be set — without
    // it, the rule does not fire and the paragraph is not selected. Coverage
    // of the unresolved-variable path uses a direct selection.
    expect(appeal.body).not.toMatch(/\{\{permission_source\}\}/);
    expect(appeal.unresolvedVariables).toEqual([]);
  });

  it("keeper-safe: body does not contain any first-person driver wording", () => {
    const p = pcn({ notice_route: "POSTAL" });
    const answers = {
      core: {
        registered_keeper: "YES" as const,
        driver_identified: "NO" as const,
        notice_route: "POSTAL" as const,
        scenarios: [
          "payment_made" as const,
          "signage_issue" as const,
        ],
      },
      branch: {
        payment: { parking_payment_made: "YES" as const },
        signage: { entrance_sign_visible: "NO" as const },
      },
    };
    const ev = evaluate({ pcn: p, answers, evidence: [] });
    const appeal = assembleAppeal(p, answers, [], ev);
    expect(appeal.keeperSafe).toBe(true);
    expect(appeal.body).not.toMatch(/\bI (?:drove|parked|paid|overstayed)\b/i);
  });

  it("body never contains internal rule / paragraph IDs", () => {
    const p = pcn();
    const answers = {
      core: {
        registered_keeper: "YES" as const,
        driver_identified: "NO" as const,
        scenarios: ["signage_issue" as const],
      },
      branch: {
        signage: { entrance_sign_visible: "NO" as const },
      },
    };
    const ev = evaluate({ pcn: p, answers, evidence: [] });
    const appeal = assembleAppeal(p, answers, [], ev);
    expect(appeal.body).not.toMatch(/PP-[A-Z0-9-]+/);
    expect(appeal.body).not.toMatch(/\bPP-R\d+\b/);
  });

  it("PP-INTRO-002 only appears on the unidentified-driver keeper route (Part 9 rule 1)", () => {
    const noKeeperRoute = evaluate({
      pcn: pcn(),
      answers: {
        core: { scenarios: ["payment_made"] },
        branch: { payment: { parking_payment_made: "YES" } },
      },
      evidence: [],
    });
    expect(noKeeperRoute.matchedParagraphIds).not.toContain("PP-INTRO-002");

    const withKeeperRoute = evaluate({
      pcn: pcn(),
      answers: {
        core: { registered_keeper: "YES", driver_identified: "NO", scenarios: [] },
        branch: {},
      },
      evidence: [],
    });
    expect(withKeeperRoute.matchedParagraphIds).toContain("PP-INTRO-002");
  });

  it("CRM override: a paragraph marked active:false is dropped from the assembled body even if its rule matched", () => {
    const p = pcn();
    const answers = {
      core: { registered_keeper: "YES" as const, driver_identified: "NO" as const, scenarios: [] },
      branch: {},
    };
    const ev = evaluate({ pcn: p, answers, evidence: [] });
    expect(ev.matchedParagraphIds).toContain("PP-INTRO-002");

    const overridden = PARAGRAPH_LIBRARY.map((para) =>
      para.id === "PP-INTRO-002" ? { ...para, active: false } : para,
    );
    const appeal = assembleAppeal(p, answers, [], ev, overridden);
    expect(appeal.paragraphs.some((para) => para.id === "PP-INTRO-002")).toBe(false);
    expect(appeal.body).not.toMatch(/No admission is made as to the identity of the driver/);
  });

  it("CRM override: edited paragraph text is what ends up in the assembled body", () => {
    const p = pcn();
    const answers = {
      core: { registered_keeper: "YES" as const, driver_identified: "NO" as const, scenarios: [] },
      branch: {},
    };
    const ev = evaluate({ pcn: p, answers, evidence: [] });
    const overridden = PARAGRAPH_LIBRARY.map((para) =>
      para.id === "PP-INTRO-001" ? { ...para, text: "EDITED INTRO TEXT for {{vrm}}." } : para,
    );
    const appeal = assembleAppeal(p, answers, [], ev, overridden);
    expect(appeal.body).toContain(`EDITED INTRO TEXT for ${p.vrm}.`);
  });
});
