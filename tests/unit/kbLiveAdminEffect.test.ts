/**
 * @vitest-environment node
 *
 * Live admin KB effect — proving the persisted catalog (not compiled
 * seed) governs both questioning and drafting retrieval.
 *
 * Catalogs are injected the way loadKbCatalog() would after an admin
 * mutation. Production fail-closed behaviour is also covered.
 */
import { afterEach, describe, expect, it } from "vitest";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { retrieveForQuestion } from "@/lib/reasoning/questionKnowledge";
import {
  invalidateKbCatalog,
  KbCatalogError,
  modulesForRetrieval,
} from "@/lib/kb/catalog";
import { ALL_KB_MODULES, LEGAL_SOURCES, buildAllDraftingBlocks } from "@/lib/kb/seed";
import type { KbModule } from "@/lib/kb/types";
import { FACT } from "@/lib/facts/facts";
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/facts/types";
import type { FactRequirement } from "@/lib/facts/requirements";

function cloneModule(id: string, over: Partial<KbModule> = {}): KbModule {
  const base = ALL_KB_MODULES.find((m) => m.moduleId === id);
  if (!base) throw new Error(`missing seed module ${id}`);
  return { ...structuredClone(base), ...over, moduleId: over.moduleId ?? id };
}

function confirmed(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP123456",
    vrm: "AB12CDE",
    parking_location: "Retail Park, Northampton",
    parking_event_date: "2026-05-04",
    notice_issue_date: "2026-05-06",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "No payment",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: new Date().toISOString(),
    ...over,
  };
}

function paymentAnswers(extra: AnswerMap = {}): AnswerMap {
  return {
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
    [FACT.SCENARIOS]: ["payment_made"],
    [FACT.PAYMENT_METHOD]: "app",
    [FACT.PAYMENT_EVIDENCE]: "YES",
    ...extra,
  };
}

function retrievePayment(
  modules: KbModule[],
  eventDate = "2026-05-04",
) {
  const c = confirmed({ parking_event_date: eventDate });
  const input = {
    confirmed: c,
    answers: paymentAnswers(),
    evidenceTypes: ["receipt"],
  };
  const analysis = analyseCase(input);
  return retrieveKnowledge({
    analysis,
    facts: factsForCase(input),
    parkingEventDate: eventDate,
    evidenceTypes: ["receipt"],
    modules,
    sources: LEGAL_SOURCES,
    blocks: buildAllDraftingBlocks(),
  });
}

describe("Admin status changes affect live retrieval", () => {
  it("ACTIVE module is eligible for an appropriate appeal", () => {
    const r = retrievePayment([
      cloneModule("KB-PAY-01", { status: "ACTIVE" }),
    ]);
    expect(r.modules.map((m) => m.moduleId)).toContain("KB-PAY-01");
  });

  it("DISABLED module is not returned by new retrieval", () => {
    const r = retrievePayment([
      cloneModule("KB-PAY-01", { status: "DISABLED" }),
    ]);
    expect(r.modules.map((m) => m.moduleId)).not.toContain("KB-PAY-01");
  });

  it("reactivated module is returned again", () => {
    const before = retrievePayment([
      cloneModule("KB-PAY-01", { status: "DISABLED" }),
    ]);
    const after = retrievePayment([
      cloneModule("KB-PAY-01", { status: "ACTIVE" }),
    ]);
    expect(before.modules.map((m) => m.moduleId)).not.toContain("KB-PAY-01");
    expect(after.modules.map((m) => m.moduleId)).toContain("KB-PAY-01");
  });
});

describe("Effective dates and historic versions", () => {
  it("future effective_from is not used before the effective date", () => {
    const r = retrievePayment([
      cloneModule("KB-PAY-01", {
        status: "ACTIVE",
        effectiveFrom: "2027-01-01",
        effectiveTo: null,
      }),
    ]);
    expect(r.modules.map((m) => m.moduleId)).not.toContain("KB-PAY-01");
  });

  it("expired effective_to is not used after expiry", () => {
    const r = retrievePayment([
      cloneModule("KB-PAY-01", {
        status: "ACTIVE",
        effectiveFrom: "2020-01-01",
        effectiveTo: "2025-12-31",
      }),
    ]);
    expect(r.modules.map((m) => m.moduleId)).not.toContain("KB-PAY-01");
  });

  it("historic case uses the historic version; current case uses current", () => {
    const historic = cloneModule("KB-PAY-01", {
      status: "ACTIVE",
      coreProposition: "HISTORIC_PROPOSITION",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2024-12-31",
      version: 1,
    });
    const current = cloneModule("KB-PAY-01", {
      moduleId: "KB-PAY-01B",
      status: "ACTIVE",
      coreProposition: "CURRENT_PROPOSITION",
      effectiveFrom: "2025-01-01",
      effectiveTo: null,
      version: 2,
    });

    const past = retrievePayment([historic, current], "2023-06-01");
    const now = retrievePayment([historic, current], "2026-05-04");

    expect(past.modules.map((m) => m.coreProposition)).toContain(
      "HISTORIC_PROPOSITION",
    );
    expect(past.modules.map((m) => m.coreProposition)).not.toContain(
      "CURRENT_PROPOSITION",
    );
    expect(now.modules.map((m) => m.coreProposition)).toContain(
      "CURRENT_PROPOSITION",
    );
    expect(now.modules.map((m) => m.coreProposition)).not.toContain(
      "HISTORIC_PROPOSITION",
    );
  });

  it("admin content update reaches subsequent retrieval", () => {
    const r1 = retrievePayment([
      cloneModule("KB-PAY-01", {
        status: "ACTIVE",
        coreProposition: "OLD_APPROVED_PROPOSITION",
      }),
    ]);
    const r2 = retrievePayment([
      cloneModule("KB-PAY-01", {
        status: "ACTIVE",
        coreProposition: "NEW_APPROVED_PROPOSITION",
        version: 2,
      }),
    ]);
    expect(r1.modules.find((m) => m.moduleId === "KB-PAY-01")?.coreProposition)
      .toBe("OLD_APPROVED_PROPOSITION");
    expect(r2.modules.find((m) => m.moduleId === "KB-PAY-01")?.coreProposition)
      .toBe("NEW_APPROVED_PROPOSITION");
  });
});

describe("Question-time and drafting use the same repository rules", () => {
  it("DISABLED module is excluded from both retrieveKnowledge and retrieveForQuestion", () => {
    const modules = [cloneModule("KB-PAY-01", { status: "DISABLED" })];
    const drafting = retrievePayment(modules);

    const c = confirmed();
    const input = {
      confirmed: c,
      answers: paymentAnswers(),
      evidenceTypes: ["receipt"] as string[],
    };
    const analysis = analyseCase(input);
    const requirement = {
      fact: "payment_method",
      reasonCode: "TEST",
      route: "PAYMENT",
      rationale: "test",
      kbModules: ["KB-PAY-01"],
      priority: 1,
    } as unknown as FactRequirement;

    const questioning = retrieveForQuestion({
      requirement,
      facts: factsForCase(input),
      evidenceTypes: ["receipt"],
      parkingEventDate: "2026-05-04",
      pofa: analysis.pofa,
      modules,
      sources: LEGAL_SOURCES,
    });

    expect(drafting.modules.map((m) => m.moduleId)).not.toContain("KB-PAY-01");
    expect(questioning).toHaveLength(0);
  });

  it("ACTIVE module with matching dates is visible to both paths", () => {
    const modules = [cloneModule("KB-PAY-01", { status: "ACTIVE" })];
    const drafting = retrievePayment(modules);

    const c = confirmed();
    const input = {
      confirmed: c,
      answers: paymentAnswers(),
      evidenceTypes: ["receipt"] as string[],
    };
    const analysis = analyseCase(input);
    const requirement = {
      fact: "payment_method",
      reasonCode: "TEST",
      route: "PAYMENT",
      rationale: "test",
      kbModules: ["KB-PAY-01"],
      priority: 1,
    } as unknown as FactRequirement;
    const questioning = retrieveForQuestion({
      requirement,
      facts: factsForCase(input),
      evidenceTypes: ["receipt"],
      parkingEventDate: "2026-05-04",
      pofa: analysis.pofa,
      modules,
      sources: LEGAL_SOURCES,
    });

    expect(drafting.modules.map((m) => m.moduleId)).toContain("KB-PAY-01");
    expect(questioning.length).toBeGreaterThan(0);
    expect(questioning[0]?.proposition).toBe(
      drafting.modules.find((m) => m.moduleId === "KB-PAY-01")?.coreProposition,
    );
  });
});

describe("Production refuses silent seed fallback", () => {
  const prevAppEnv = process.env.APP_ENV;

  afterEach(() => {
    if (prevAppEnv === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = prevAppEnv;
    invalidateKbCatalog();
  });

  it("modulesForRetrieval throws in production when catalog is omitted", () => {
    process.env.APP_ENV = "production";
    expect(() => modulesForRetrieval(undefined)).toThrow(KbCatalogError);
  });
});
