/**
 * @vitest-environment node
 *
 * Keeper-safety regeneration: one controlled correction attempt, then
 * MANUAL_REVIEW. Never loops indefinitely.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const draftAppeal = vi.fn();
const getDraftingProvider = vi.fn();

vi.mock("@/lib/drafting/engine", () => ({
  draftAppeal: (...args: unknown[]) => draftAppeal(...args),
  DRAFTING_ENGINE_VERSION: "test",
}));

vi.mock("@/services/ai/drafting", () => ({
  getDraftingProvider: () => getDraftingProvider(),
}));

vi.mock("@/lib/kb/catalog", async () => {
  const seed = await import("@/lib/kb/seed");
  return {
    KbCatalogError: class KbCatalogError extends Error {
      constructor(message: string) {
        super(message);
        this.name = "KbCatalogError";
      }
    },
    loadKbCatalog: async () => ({
      modules: seed.ALL_KB_MODULES,
      sources: seed.LEGAL_SOURCES,
      blocks: seed.buildAllDraftingBlocks(),
      codeVersions: seed.CODE_VERSIONS,
      origin: "seed" as const,
      loadedAt: new Date().toISOString(),
    }),
    invalidateKbCatalog: () => undefined,
    modulesForRetrieval: (o: unknown) =>
      (o as unknown[]) ?? seed.ALL_KB_MODULES,
    sourcesForRetrieval: (o: unknown) =>
      (o as unknown[]) ?? seed.LEGAL_SOURCES,
    blocksForRetrieval: (o: unknown) =>
      (o as unknown[]) ?? seed.buildAllDraftingBlocks(),
  };
});

import { generateValidatedAppeal } from "@/lib/generation/engine";
import { FACT } from "@/lib/questions/facts";
import type { ConfirmedPcn } from "@/types";
import type { AnswerMap } from "@/lib/questions/types";

function confirmed(): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP999001",
    vrm: "AB12CDE",
    parking_location: "Retail Park",
    parking_event_date: "2026-05-04",
    notice_issue_date: "2026-05-06",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "No payment",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: new Date().toISOString(),
  };
}

function answers(): AnswerMap {
  return {
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
    [FACT.SCENARIOS]: ["payment_made"],
    [FACT.PAYMENT_METHOD]: "app",
    [FACT.PAYMENT_EVIDENCE]: "YES",
  };
}

function blockedDraft(excerpt: string) {
  return {
    ok: false,
    body: null,
    variables: {},
    analysis: null,
    draft: {
      providerId: "openai",
      promptVersion: "t",
      model: "test",
      bespoke: true,
      moduleIds: ["KB-PAY-01"],
      text: excerpt,
    },
    strippedIdentifiers: [],
    keeperSafe: false,
    keeperSafeViolations: [
      { label: "FIRST_PERSON_DRIVING", excerpt },
    ],
    appliedTransformations: [],
    unresolvedVariables: [],
    warnings: [],
    blockedReason: "KEEPER_SAFETY_FAILED",
    engineVersion: "test",
  };
}

function safeDraft(body: string) {
  return {
    ok: true,
    body,
    variables: {},
    analysis: null,
    draft: {
      providerId: "openai",
      promptVersion: "t",
      model: "test",
      bespoke: true,
      moduleIds: ["KB-PAY-01"],
      text: body,
    },
    strippedIdentifiers: [],
    keeperSafe: true,
    keeperSafeViolations: [],
    appliedTransformations: [],
    unresolvedVariables: [],
    warnings: [],
    blockedReason: null,
    engineVersion: "test",
  };
}

describe("Keeper-safety regeneration", () => {
  afterEach(() => {
    draftAppeal.mockReset();
    getDraftingProvider.mockReset();
  });

  it("regenerates once with structured correction feedback naming unsafe phrases", async () => {
    getDraftingProvider.mockReturnValue({ bespoke: true, id: "openai" });

    const unsafe =
      "I parked the vehicle and I drove away. When I arrived the bay was free.";

    draftAppeal
      .mockResolvedValueOnce(blockedDraft(unsafe))
      .mockResolvedValueOnce(blockedDraft("I parked again."));

    const r = await generateValidatedAppeal({
      confirmed: confirmed(),
      answers: answers(),
      evidenceTypes: ["receipt"],
      maxAttempts: 2,
    });

    expect(draftAppeal).toHaveBeenCalledTimes(2);
    const secondCall = draftAppeal.mock.calls[1]?.[0] as {
      feedback?: string;
    };
    expect(secondCall.feedback).toMatch(/keeper-safety/i);
    expect(secondCall.feedback).toMatch(/I parked|I drove|When I arrived/i);
    expect(r.warnings.some((w) => /keeper safety/i.test(w))).toBe(true);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reason).toBe("KEEPER_SAFETY_FAILED");
    expect(r.body).toBeNull();
  });

  it("routes to MANUAL_REVIEW after a second keeper-safety failure", async () => {
    getDraftingProvider.mockReturnValue({ bespoke: true, id: "openai" });

    draftAppeal
      .mockResolvedValueOnce(blockedDraft("I parked overnight."))
      .mockResolvedValueOnce(blockedDraft("I drove into the car park."));

    const r = await generateValidatedAppeal({
      confirmed: confirmed(),
      answers: answers(),
      evidenceTypes: ["receipt"],
      maxAttempts: 2,
    });

    expect(draftAppeal).toHaveBeenCalledTimes(2);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reason).toBe("KEEPER_SAFETY_FAILED");
    expect(r.body).toBeNull();
  });

  it("does not regenerate keeper-safety for deterministic providers", async () => {
    getDraftingProvider.mockReturnValue({ bespoke: false, id: "deterministic" });
    draftAppeal.mockResolvedValueOnce(blockedDraft("I parked."));

    const r = await generateValidatedAppeal({
      confirmed: confirmed(),
      answers: answers(),
      evidenceTypes: ["receipt"],
      maxAttempts: 2,
    });

    expect(draftAppeal).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("MANUAL_REVIEW");
    expect(r.reason).toBe("KEEPER_SAFETY_FAILED");
  });
});
