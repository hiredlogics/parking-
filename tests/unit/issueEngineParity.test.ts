/**
 * @vitest-environment node
 *
 * Parity tests for the Admin-configured generic issue engine.
 * Proves required-fact / knowledge relationships for supported issues
 * without calling legacy route engines.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FACT } from "@/lib/questions/facts";
import type { KnownFacts } from "@/lib/questions/types";

const graph = {
  service: {
    id: "svc_1",
    code: "PRIVATE_PARKING_INITIAL_APPEAL",
    name: "Private Parking",
    description: null,
    paymentRequired: true,
    amountPence: 2900,
    currency: "GBP",
    status: "ACTIVE",
    version: 1,
  },
  issues: [
    {
      id: "iss_pay",
      serviceId: "svc_1",
      code: "PAYMENT_KEYING",
      label: "Payment / Keying",
      description: null,
      status: "ACTIVE",
      sortOrder: 10,
      triggerTags: ["payment", "keying"],
      version: 1,
      facts: [
        { id: "f1", issueId: "iss_pay", factKey: FACT.PAYMENT_MADE, reasonCode: "PAYMENT_STATUS_UNRESOLVED", priority: 15, evidenceTypes: [], status: "ACTIVE" },
        { id: "f2", issueId: "iss_pay", factKey: FACT.VRM_ENTERED, reasonCode: "VRM_ENTRY_UNRESOLVED", priority: 30, evidenceTypes: [], status: "ACTIVE" },
        { id: "f3", issueId: "iss_pay", factKey: FACT.PAYMENT_EVIDENCE, reasonCode: "PAYMENT_EVIDENCE_UNRESOLVED", priority: 40, evidenceTypes: ["receipt"], status: "ACTIVE" },
      ],
      knowledge: [
        { issueId: "iss_pay", moduleId: "KB-PAY-01", status: "ACTIVE" },
        { issueId: "iss_pay", moduleId: "KB-KEY-01", status: "ACTIVE" },
      ],
    },
    {
      id: "iss_break",
      serviceId: "svc_1",
      code: "BREAKDOWN",
      label: "Breakdown",
      description: null,
      status: "ACTIVE",
      sortOrder: 20,
      triggerTags: ["breakdown"],
      version: 1,
      facts: [
        { id: "b1", issueId: "iss_break", factKey: FACT.BREAKDOWN_NATURE, reasonCode: "BREAKDOWN_NATURE_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
        { id: "b2", issueId: "iss_break", factKey: FACT.BREAKDOWN_PREVENTED_DEPARTURE, reasonCode: "BREAKDOWN_STATUS_UNRESOLVED", priority: 30, evidenceTypes: [], status: "ACTIVE" },
        { id: "b3", issueId: "iss_break", factKey: FACT.RECOVERY_ATTENDANCE, reasonCode: "BREAKDOWN_STATUS_UNRESOLVED", priority: 35, evidenceTypes: [], status: "ACTIVE" },
        { id: "b4", issueId: "iss_break", factKey: FACT.BREAKDOWN_EVIDENCE, reasonCode: "BREAKDOWN_EVIDENCE_UNRESOLVED", priority: 40, evidenceTypes: ["recovery_report"], status: "ACTIVE" },
      ],
      knowledge: [
        { issueId: "iss_break", moduleId: "KB-BREAK-01", status: "ACTIVE" },
      ],
    },
    {
      id: "iss_anpr",
      serviceId: "svc_1",
      code: "ANPR",
      label: "ANPR",
      description: null,
      status: "ACTIVE",
      sortOrder: 30,
      triggerTags: ["anpr"],
      version: 1,
      facts: [
        { id: "a1", issueId: "iss_anpr", factKey: FACT.VISIT_COUNT, reasonCode: "VISIT_COUNT_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
        { id: "a2", issueId: "iss_anpr", factKey: FACT.CONTINUOUS_PRESENCE, reasonCode: "ANPR_PRESENCE_UNRESOLVED", priority: 30, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_anpr", moduleId: "KB-ANPR-01", status: "ACTIVE" }],
    },
    {
      id: "iss_consid",
      serviceId: "svc_1",
      code: "CONSIDERATION",
      label: "Consideration",
      description: null,
      status: "ACTIVE",
      sortOrder: 40,
      triggerTags: ["consideration"],
      version: 1,
      facts: [
        { id: "c1", issueId: "iss_consid", factKey: FACT.INITIAL_PERIOD_REASON, reasonCode: "CONSIDERATION_PERIOD_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_consid", moduleId: "KB-CONSID-01", status: "ACTIVE" }],
    },
    {
      id: "iss_grace",
      serviceId: "svc_1",
      code: "GRACE",
      label: "Grace",
      description: null,
      status: "ACTIVE",
      sortOrder: 50,
      triggerTags: ["grace"],
      version: 1,
      facts: [
        { id: "g1", issueId: "iss_grace", factKey: FACT.DEPARTURE_DELAY, reasonCode: "GRACE_PERIOD_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_grace", moduleId: "KB-GRACE-01", status: "ACTIVE" }],
    },
    {
      id: "iss_res",
      serviceId: "svc_1",
      code: "RESIDENTIAL",
      label: "Residential",
      description: null,
      status: "ACTIVE",
      sortOrder: 60,
      triggerTags: ["residential"],
      version: 1,
      facts: [
        { id: "r1", issueId: "iss_res", factKey: FACT.OCCUPIER_STATUS, reasonCode: "OCCUPIER_STATUS_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_res", moduleId: "KB-RES-01", status: "ACTIVE" }],
    },
    {
      id: "iss_auth",
      serviceId: "svc_1",
      code: "AUTHORISATION",
      label: "Authorisation",
      description: null,
      status: "ACTIVE",
      sortOrder: 70,
      triggerTags: ["permit"],
      version: 1,
      facts: [
        { id: "au1", issueId: "iss_auth", factKey: FACT.PERMISSION_HELD, reasonCode: "PERMISSION_STATUS_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_auth", moduleId: "KB-AUTH-01", status: "ACTIVE" }],
    },
    {
      id: "iss_eq",
      serviceId: "svc_1",
      code: "EQUALITY",
      label: "Equality",
      description: null,
      status: "ACTIVE",
      sortOrder: 80,
      triggerTags: ["equality"],
      version: 1,
      facts: [
        { id: "e1", issueId: "iss_eq", factKey: FACT.ADDITIONAL_TIME_NEEDED, reasonCode: "EQUALITY_NEED_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_eq", moduleId: "KB-EQ-01", status: "ACTIVE" }],
    },
    {
      id: "iss_pofa",
      serviceId: "svc_1",
      code: "POFA",
      label: "PoFA",
      description: null,
      status: "ACTIVE",
      sortOrder: 90,
      triggerTags: ["pofa", "keeper"],
      version: 1,
      facts: [
        { id: "p1", issueId: "iss_pofa", factKey: FACT.REGISTERED_KEEPER, reasonCode: "KEEPER_STATUS_UNRESOLVED", priority: 10, evidenceTypes: [], status: "ACTIVE" },
        { id: "p2", issueId: "iss_pofa", factKey: FACT.DRIVER_IDENTIFIED, reasonCode: "DRIVER_NOTIFICATION_STATUS_UNRESOLVED", priority: 20, evidenceTypes: [], status: "ACTIVE" },
      ],
      knowledge: [{ issueId: "iss_pofa", moduleId: "KB-POFA-01", status: "ACTIVE" }],
    },
  ],
};

vi.mock("@/lib/config/seedAdminConfig", () => ({
  ensureAdminConfigSeeded: async () => {},
}));
vi.mock("@/lib/config/adminRepo", () => ({
  loadServiceGraph: async () => graph,
}));

const { evaluateIssues } = await import("@/lib/engine/issueEngine");

function facts(values: Record<string, unknown>, tags: string[] = []): KnownFacts {
  return {
    values: values as KnownFacts["values"],
    known: new Set(Object.keys(values)),
    tags: new Set(tags),
    evidence: new Set(),
  };
}

describe("Admin issue engine parity", () => {
  beforeEach(() => {
    delete process.env.USE_ADMIN_ISSUE_ENGINE;
  });

  it("PAYMENT_KEYING requires payment/keying facts and PAYMENT+KEYING knowledge", async () => {
    const r = await evaluateIssues({
      facts: facts({ [FACT.SCENARIOS]: ["payment"] }, ["payment"]),
    });
    expect(r.activeIssues.map((i) => i.code)).toContain("PAYMENT_KEYING");
    expect(r.applicableModuleIds).toEqual(
      expect.arrayContaining(["KB-PAY-01", "KB-KEY-01"]),
    );
    expect(r.missingFacts.map((m) => m.factKey)).toEqual(
      expect.arrayContaining([FACT.PAYMENT_MADE, FACT.VRM_ENTERED, FACT.PAYMENT_EVIDENCE]),
    );
    expect(r.sufficient).toBe(false);
  });

  it("evidence can satisfy evidence-linked payment facts", async () => {
    const r = await evaluateIssues({
      facts: facts(
        {
          [FACT.SCENARIOS]: ["payment"],
          [FACT.PAYMENT_MADE]: "YES",
          [FACT.VRM_ENTERED]: "AB12CDE",
        },
        ["payment"],
      ),
      evidenceTypes: ["receipt"],
    });
    expect(r.missingFacts.map((m) => m.factKey)).not.toContain(FACT.PAYMENT_EVIDENCE);
  });

  it("BREAKDOWN requires immobilisation / recovery / evidence facts", async () => {
    const r = await evaluateIssues({
      facts: facts({ [FACT.SCENARIOS]: ["breakdown"] }, ["breakdown"]),
    });
    expect(r.activeIssues.map((i) => i.code)).toContain("BREAKDOWN");
    expect(r.applicableModuleIds).toContain("KB-BREAK-01");
    expect(r.missingFacts.map((m) => m.factKey)).toEqual(
      expect.arrayContaining([
        FACT.BREAKDOWN_NATURE,
        FACT.BREAKDOWN_PREVENTED_DEPARTURE,
        FACT.RECOVERY_ATTENDANCE,
        FACT.BREAKDOWN_EVIDENCE,
      ]),
    );
  });

  it.each([
    ["ANPR", "anpr", FACT.VISIT_COUNT, "KB-ANPR-01"],
    ["CONSIDERATION", "consideration", FACT.INITIAL_PERIOD_REASON, "KB-CONSID-01"],
    ["GRACE", "grace", FACT.DEPARTURE_DELAY, "KB-GRACE-01"],
    ["RESIDENTIAL", "residential", FACT.OCCUPIER_STATUS, "KB-RES-01"],
    ["AUTHORISATION", "permit", FACT.PERMISSION_HELD, "KB-AUTH-01"],
    ["EQUALITY", "equality", FACT.ADDITIONAL_TIME_NEEDED, "KB-EQ-01"],
  ] as const)(
    "%s activates from tag and exposes required fact + knowledge",
    async (code, tag, factKey, moduleId) => {
      const r = await evaluateIssues({
        facts: facts({ [FACT.SCENARIOS]: [tag] }, [tag]),
      });
      expect(r.activeIssues.map((i) => i.code)).toContain(code);
      expect(r.missingFacts.map((m) => m.factKey)).toContain(factKey);
      expect(r.applicableModuleIds).toContain(moduleId);
    },
  );

  it("POFA activates from tag and resolves keeper facts via SYSTEM_SAFE_DEFAULT, asking no question", async () => {
    const r = await evaluateIssues({
      facts: facts({ [FACT.SCENARIOS]: ["keeper"] }, ["keeper"]),
    });
    expect(r.activeIssues.map((i) => i.code)).toContain("POFA");
    expect(r.applicableModuleIds).toContain("KB-POFA-01");
    // The zero-question path: registered keeper / driver-not-identified are
    // the product default, not a customer-asked question — so neither is
    // reported missing, and their provenance is explicit and overridable.
    expect(r.missingFacts.map((m) => m.factKey)).not.toContain(FACT.REGISTERED_KEEPER);
    expect(r.missingFacts.map((m) => m.factKey)).not.toContain(FACT.DRIVER_IDENTIFIED);
    expect(r.appliedDefaults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ factKey: FACT.REGISTERED_KEEPER, reasonCode: "SYSTEM_SAFE_DEFAULT" }),
        expect.objectContaining({ factKey: FACT.DRIVER_IDENTIFIED, reasonCode: "SYSTEM_SAFE_DEFAULT" }),
      ]),
    );
  });

  it("is sufficient only when active issue facts are resolved", async () => {
    const r = await evaluateIssues({
      facts: facts(
        {
          [FACT.SCENARIOS]: ["grace"],
          [FACT.DEPARTURE_DELAY]: "queue at exit",
        },
        ["grace"],
      ),
    });
    expect(r.activeIssues.map((i) => i.code)).toContain("GRACE");
    expect(r.missingFacts).toHaveLength(0);
    expect(r.sufficient).toBe(true);
  });
});
