/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT } from "@/lib/questions/facts";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { serialiseDraftingContext } from "@/services/ai/drafting/contextSerialiser";
import { ALL_KB_MODULES } from "@/lib/kb/seed";

/**
 * What actually reaches OpenAI.
 *
 * The knowledge base is controlled reference data. Sending all of it on
 * every request would defeat the point of structured retrieval: the
 * model could then argue from a module that the case facts, effective
 * dates or prohibited claims had specifically excluded.
 *
 * These tests assert the drafting payload carries ONLY the retrieved
 * modules, and that it carries no internal identifiers the model could
 * echo into a customer document.
 */

const input = {
  confirmed: {
    operator_name: "CitySquare Parking Management",
    pcn_number: "CSP-120726-73104",
    vrm: "KT19 RPL",
    parking_location: "Harbour Point, Bristol",
    parking_event_date: "2026-07-12",
    notice_issue_date: "2026-07-18",
    notice_received_date: "2026-07-22",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "Failure to make a valid payment",
    confirmedAt: "2026-07-23T00:00:00.000Z",
  } as ConfirmedPcn,
  answers: {
    [FACT.JURISDICTION]: "ENGLAND_WALES",
    [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
    [FACT.REGISTERED_KEEPER]: "YES",
    [FACT.DRIVER_IDENTIFIED]: "NO",
    [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
    [FACT.PAYMENT_MADE]: "YES",
    [FACT.PAYMENT_METHOD]: "machine",
    [FACT.PAYMENT_EVIDENCE]: "YES",
    [FACT.VRM_ENTERED]: "KT19 RPI",
    [FACT.KEYING_ERROR]: "YES",
  },
  evidenceTypes: ["payment_receipt"],
};

function buildPayload() {
  const analysis = analyseCase(input);
  const retrieval = retrieveKnowledge({
    analysis,
    facts: factsForCase(input),
    parkingEventDate: input.confirmed.parking_event_date ?? null,
    evidenceTypes: input.evidenceTypes,
  });
  const payload = serialiseDraftingContext({
    analysis,
    modules: retrieval.modules,
    blocks: retrieval.blocks,
    sources: retrieval.sources,
    variables: { pcn_number: "CSP-120726-73104", vrm: "KT19 RPL" },
    availableEvidence: input.evidenceTypes,
  });
  return { analysis, retrieval, payload };
}

describe("Only retrieved KB sections are sent to OpenAI", () => {
  it("includes every retained module's proposition", () => {
    const { retrieval, payload } = buildPayload();
    expect(retrieval.modules.length).toBeGreaterThan(0);
    for (const m of retrieval.modules) {
      expect(payload, m.moduleId).toContain(m.coreProposition);
    }
  });

  it("excludes the propositions of every module that was not retrieved", () => {
    const { retrieval, payload } = buildPayload();
    const retained = new Set(retrieval.modules.map((m) => m.moduleId));
    const excluded = ALL_KB_MODULES.filter((m) => !retained.has(m.moduleId));

    // The whole point of structured retrieval.
    expect(excluded.length).toBeGreaterThan(0);
    for (const m of excluded) {
      if (!m.coreProposition || m.coreProposition.length < 40) continue;
      expect(payload, `${m.moduleId} leaked into the prompt`).not.toContain(
        m.coreProposition,
      );
    }
  });

  it("sends a small fraction of the catalogue", () => {
    const { retrieval } = buildPayload();
    expect(retrieval.modules.length).toBeLessThan(ALL_KB_MODULES.length / 3);
  });

  it("carries no internal identifiers the model could echo", () => {
    const { payload } = buildPayload();
    for (const pattern of [/\bKB-[A-Z]+-\d+\b/, /\bSRC-[A-Z0-9-]+\b/, /\bPP-[A-Z]+-\d+/]) {
      expect(payload, String(pattern)).not.toMatch(pattern);
    }
  });

  it("does not include retrieval traces or exclusion reasons", () => {
    const { payload } = buildPayload();
    expect(payload).not.toContain("not in play for this case");
    expect(payload).not.toContain("Governance rule");
    expect(payload).not.toMatch(/eligible/i);
  });

  it("states the prohibition when no timing failure is established", () => {
    const { payload } = buildPayload();
    expect(payload).toContain("must NOT allege a timing or content defect");
  });
});
