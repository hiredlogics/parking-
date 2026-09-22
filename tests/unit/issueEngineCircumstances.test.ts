import { describe, expect, it } from "vitest";
import { evaluateIssues } from "@/lib/engine/issueEngine";
import { deriveKnownFacts, FACT } from "@/lib/questions/facts";
import { vi } from "vitest";

vi.mock("@/lib/config/seedAdminConfig", () => ({
  ensureAdminConfigSeeded: async () => undefined,
}));

vi.mock("@/lib/db/pool", () => ({
  hasDb: () => true,
  q: async () => ({ rows: [] }),
}));

const GRACE_GRAPH = {
  service: { code: "PRIVATE_PARKING_INITIAL_APPEAL" },
  issues: [
    {
      code: "GRACE",
      label: "Grace period",
      sortOrder: 50,
      triggerTags: ["grace"],
      knowledge: [{ moduleId: "KB-GRACE-01" }],
      facts: [
        {
          factKey: FACT.EXIT_DELAY_REASON,
          reasonCode: "GRACE_PERIOD_UNRESOLVED",
          priority: 20,
          evidenceTypes: [],
        },
      ],
    },
    {
      code: "RESIDENTIAL",
      label: "Residential / Lease",
      sortOrder: 60,
      triggerTags: ["residential", "lease"],
      knowledge: [{ moduleId: "KB-RES-01" }],
      facts: [
        {
          factKey: FACT.OCCUPIER_STATUS,
          reasonCode: "OCCUPIER_STATUS_UNRESOLVED",
          priority: 20,
          evidenceTypes: [],
        },
        {
          factKey: FACT.AGREEMENT_UPLOADED,
          reasonCode: "AGREEMENT_EVIDENCE_UNRESOLVED",
          priority: 30,
          evidenceTypes: ["lease"],
        },
      ],
    },
    {
      code: "AUTHORISATION",
      label: "Authorisation / Permit",
      sortOrder: 70,
      triggerTags: ["permit", "authorisation"],
      knowledge: [{ moduleId: "KB-AUTH-01" }],
      facts: [
        {
          factKey: FACT.PERMISSION_HELD,
          reasonCode: "PERMISSION_STATUS_UNRESOLVED",
          priority: 20,
          evidenceTypes: [],
        },
        {
          factKey: FACT.PERMISSION_SOURCE,
          reasonCode: "PERMISSION_SOURCE_UNRESOLVED",
          priority: 30,
          evidenceTypes: [],
        },
      ],
    },
  ],
};

vi.mock("@/lib/config/adminRepo", () => ({
  loadServiceGraph: async () => GRACE_GRAPH,
}));

describe("evaluateIssues — circumstance-led questioning", () => {
  it("before circumstances are named, allegation alone does not open AUTHORISATION/RESIDENTIAL", async () => {
    const facts = deriveKnownFacts({
      confirmed: {
        alleged_breach: "Unauthorised parking",
        parking_location: "Queen Elizabeth Hospital",
        confirmedAt: new Date().toISOString(),
      },
      answers: {
        [FACT.REGISTERED_KEEPER]: "YES",
        [FACT.DRIVER_IDENTIFIED]: "NO",
      },
    });

    const result = await evaluateIssues({ facts });
    expect(result.activeIssues.map((i) => i.code)).not.toContain("RESIDENTIAL");
    expect(result.activeIssues.map((i) => i.code)).not.toContain("AUTHORISATION");
    expect(result.missingFacts.map((f) => f.factKey)).not.toContain(
      FACT.PERMISSION_HELD,
    );
    expect(result.missingFacts.map((f) => f.factKey)).not.toContain(
      FACT.OCCUPIER_STATUS,
    );
  });

  it("after grace-only selection, does not queue residential/permission facts from an unauthorised notice", async () => {
    const facts = deriveKnownFacts({
      confirmed: {
        alleged_breach: "Unauthorised parking",
        parking_location: "Queen Elizabeth Hospital",
        confirmedAt: new Date().toISOString(),
      },
      answers: {
        [FACT.SCENARIOS]: ["grace_or_exit"],
        [FACT.REGISTERED_KEEPER]: "YES",
        [FACT.DRIVER_IDENTIFIED]: "NO",
      },
    });

    const result = await evaluateIssues({ facts });

    expect(result.activeIssues.map((i) => i.code)).toContain("GRACE");
    expect(result.activeIssues.map((i) => i.code)).not.toContain("RESIDENTIAL");
    expect(result.activeIssues.map((i) => i.code)).not.toContain("AUTHORISATION");
    expect(result.missingFacts.map((f) => f.factKey)).toEqual([
      FACT.EXIT_DELAY_REASON,
    ]);
  });

  it("does not ask permission_source after permission_held = NO", async () => {
    const facts = deriveKnownFacts({
      answers: {
        [FACT.SCENARIOS]: ["authorised_or_permit"],
        [FACT.PERMISSION_HELD]: "NO",
      },
    });

    const result = await evaluateIssues({ facts });
    expect(result.missingFacts.map((f) => f.factKey)).not.toContain(
      FACT.PERMISSION_SOURCE,
    );
  });
});
