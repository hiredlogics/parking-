/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT, deriveKnownFacts } from "@/lib/facts/facts";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { retrieveForQuestion } from "@/lib/reasoning/questionKnowledge";
import { ALL_KB_MODULES } from "@/lib/kb/seed";
import { LEGAL_SOURCES } from "@/lib/kb/seed/sources";
import { buildAllDraftingBlocks } from "@/lib/kb/seed/blocks";
import { TRIAGE_REQUIREMENTS, ROUTE_REQUIREMENTS } from "@/lib/facts/requirements";
import { BASE, TRIAGE, UAT_FIXTURES, type UatFixture } from "../fixtures/uatCases";

/**
 * Retrieval determinism.
 *
 * A UAT run showed the same fixture producing 3 modules alone and 0
 * modules inside a batch. Retrieval, analysis and applicability are all
 * deterministic code, so that difference must come from shared state
 * being mutated between requests.
 *
 * These snapshot the FULL retrieval decision — module IDs, sources,
 * Code version, routes, prohibited claims and every exclusion reason —
 * not just a count, and assert it never varies with execution order.
 */

type Fixture = UatFixture;

/** The same ten fixtures the real UAT harness uses, plus the unsafe one. */
const FIXTURES: Fixture[] = UAT_FIXTURES;

/**
 * The full retrieval decision, as a comparable string.
 *
 * Deliberately more than a module count: a count can coincide while the
 * decision differs.
 */
function snapshot(f: Fixture): string {
  const input = {
    confirmed: f.confirmed,
    answers: f.answers,
    evidenceTypes: f.evidenceTypes,
    evidenceRefs: f.evidenceTypes,
  };
  const analysis = analyseCase(input);
  const result = retrieveKnowledge({
    analysis,
    facts: factsForCase(input),
    parkingEventDate: f.confirmed.parking_event_date ?? null,
    evidenceTypes: f.evidenceTypes,
  });

  return JSON.stringify({
    primaryRoute: analysis.primaryRoute,
    secondaryRoutes: analysis.secondaryRoutes,
    assessments: analysis.assessments.map((a) => a.route),
    codeVersionId: analysis.codeVersionId,
    pofaRoute: analysis.pofa.route,
    pofaTiming: analysis.pofa.timingStatus,
    prohibitedClaims: [...analysis.prohibitedClaims].sort(),
    missingFacts: [...analysis.missingFacts].sort(),
    moduleIds: result.modules.map((m) => m.moduleId),
    sourceIds: result.sources.map((s) => s.sourceId).sort(),
    blockIds: result.blocks.map((b) => b.blockId).sort(),
    trace: result.trace.map((t) => `${t.moduleId}|${t.eligible}|${t.reason}`),
  });
}

const byId = (id: string) => FIXTURES.find((f) => f.id === id)!;

/**
 * Guard against a vacuous suite.
 *
 * Every order-independence assertion below compares two snapshots for
 * equality. Nothing but these tests stops "0 modules every time" from
 * satisfying all of them, which would let the exact defect we are
 * chasing hide inside a green run.
 */
describe("Retrieval actually retrieves", () => {
  it("UAT-1 reaches drafting with its payment/keying modules", () => {
    const snap = JSON.parse(snapshot(byId("UAT-1")));
    expect(snap.primaryRoute).toBe("KEYING");
    expect(snap.moduleIds).toContain("KB-KEY-01");
    expect(snap.moduleIds).toContain("KB-PAY-01");
    expect(snap.moduleIds.length).toBeGreaterThanOrEqual(3);
    expect(snap.codeVersionId).toBeTruthy();
  });

  it("no releasable fixture silently retrieves nothing", () => {
    // UAT-11 is the intentionally unsupported case and is excluded.
    for (const f of FIXTURES.filter((x) => x.id !== "UAT-11")) {
      const snap = JSON.parse(snapshot(f));
      expect(snap.moduleIds.length, `${f.id} retrieved no modules`).toBeGreaterThan(0);
    }
  });
});

/* ===================== Catalogue integrity ===================== */

describe("Canonical KB catalogues are stable", () => {
  it("module count does not change across repeated retrievals", () => {
    const before = ALL_KB_MODULES.length;
    for (const f of FIXTURES) snapshot(f);
    expect(ALL_KB_MODULES.length).toBe(before);
  });

  it("source count does not change across repeated retrievals", () => {
    const before = LEGAL_SOURCES.length;
    for (const f of FIXTURES) snapshot(f);
    expect(LEGAL_SOURCES.length).toBe(before);
  });

  it("module statuses are not altered by retrieval", () => {
    const before = ALL_KB_MODULES.map((m) => `${m.moduleId}:${m.status}`).join(",");
    for (const f of FIXTURES) snapshot(f);
    expect(ALL_KB_MODULES.map((m) => `${m.moduleId}:${m.status}`).join(",")).toBe(before);
  });

  it("module effective dates are not altered by retrieval", () => {
    const before = ALL_KB_MODULES
      .map((m) => `${m.moduleId}:${m.effectiveFrom}:${m.effectiveTo}`)
      .join(",");
    for (const f of FIXTURES) snapshot(f);
    expect(
      ALL_KB_MODULES.map((m) => `${m.moduleId}:${m.effectiveFrom}:${m.effectiveTo}`).join(","),
    ).toBe(before);
  });

  it("module ORDER is not altered by retrieval", () => {
    // retained.sort() must not reach the shared catalogue.
    const before = ALL_KB_MODULES.map((m) => m.moduleId).join(",");
    for (const f of FIXTURES) snapshot(f);
    expect(ALL_KB_MODULES.map((m) => m.moduleId).join(",")).toBe(before);
  });

  it("a caller cannot corrupt the catalogue through a returned reference", () => {
    const before = snapshot(byId("UAT-1"));
    const result = retrieveKnowledge({
      analysis: analyseCase({
        confirmed: byId("UAT-1").confirmed,
        answers: byId("UAT-1").answers,
        evidenceTypes: byId("UAT-1").evidenceTypes,
      }),
      facts: factsForCase({
        confirmed: byId("UAT-1").confirmed,
        answers: byId("UAT-1").answers,
        evidenceTypes: byId("UAT-1").evidenceTypes,
      }),
      parkingEventDate: "2026-07-12",
      evidenceTypes: byId("UAT-1").evidenceTypes,
    });

    // Aggressively mutate what retrieval handed back.
    result.modules.sort((a, b) => b.moduleId.localeCompare(a.moduleId));
    result.modules.splice(0, result.modules.length - 1);
    result.blocks.length = 0;
    result.sources.length = 0;

    expect(snapshot(byId("UAT-1"))).toBe(before);
  });

  it("buildAllDraftingBlocks returns a fresh array each call", () => {
    const a = buildAllDraftingBlocks();
    const n = a.length;
    a.length = 0;
    expect(buildAllDraftingBlocks().length).toBe(n);
  });
});

/* ===================== Order independence ===================== */

describe("Retrieval is order-independent", () => {
  it("UAT-1 is identical alone and after the whole batch", () => {
    // The exact reported symptom.
    const alone = snapshot(byId("UAT-1"));
    for (const f of FIXTURES) snapshot(f);
    expect(snapshot(byId("UAT-1"))).toBe(alone);
  });

  it("every fixture is identical before and after the batch", () => {
    const before = new Map(FIXTURES.map((f) => [f.id, snapshot(f)]));
    for (const f of FIXTURES) snapshot(f);
    for (const f of FIXTURES) {
      expect(snapshot(f), f.id).toBe(before.get(f.id));
    }
  });

  it("A → B → A returns the same A", () => {
    const a1 = snapshot(byId("UAT-1"));
    snapshot(byId("UAT-3"));
    expect(snapshot(byId("UAT-1"))).toBe(a1);
  });

  it("B → A → B returns the same B", () => {
    const b1 = snapshot(byId("UAT-3"));
    snapshot(byId("UAT-1"));
    expect(snapshot(byId("UAT-3"))).toBe(b1);
  });

  it("forward and reverse batch order agree per fixture", () => {
    const forward = new Map<string, string>();
    for (const f of FIXTURES) forward.set(f.id, snapshot(f));

    const reverse = new Map<string, string>();
    for (const f of [...FIXTURES].reverse()) reverse.set(f.id, snapshot(f));

    for (const f of FIXTURES) {
      expect(reverse.get(f.id), f.id).toBe(forward.get(f.id));
    }
  });

  it("a deterministic shuffle agrees with the forward run", () => {
    const forward = new Map(FIXTURES.map((f) => [f.id, snapshot(f)]));
    // Fixed seed so a failure is reproducible.
    let seed = 20260910;
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const shuffled = [...FIXTURES].sort(() => rand() - 0.5);
    for (const f of shuffled) {
      expect(snapshot(f), f.id).toBe(forward.get(f.id));
    }
  });

  it("repeating one fixture 25 times never varies", () => {
    const first = snapshot(byId("UAT-1"));
    for (let i = 0; i < 25; i++) {
      expect(snapshot(byId("UAT-1")), `iteration ${i}`).toBe(first);
    }
  });

  it("concurrent retrievals stay isolated", async () => {
    const expected = new Map(FIXTURES.map((f) => [f.id, snapshot(f)]));
    const results = await Promise.all(
      FIXTURES.map(async (f) => ({ id: f.id, snap: snapshot(f) })),
    );
    for (const r of results) {
      expect(r.snap, r.id).toBe(expected.get(r.id));
    }
  });
});

/* ============== Cross-contamination between date/Code cases ============== */

describe("Effective-date and Code-version isolation", () => {
  it("a historic-event case does not alter a current-event case", () => {
    // UAT-4 sits on 2026-05-01, UAT-1 on 2026-07-12.
    const current = snapshot(byId("UAT-1"));
    snapshot(byId("UAT-4"));
    expect(snapshot(byId("UAT-1"))).toBe(current);
  });

  it("a case with an unresolvable Code version does not alter the next", () => {
    const ancient: Fixture = {
      id: "ancient",
      confirmed: { ...BASE, parking_event_date: "1999-01-01" } as ConfirmedPcn,
      answers: { ...TRIAGE, [FACT.SCENARIOS]: ["payment_made"] },
      evidenceTypes: [],
    };
    const current = snapshot(byId("UAT-1"));
    snapshot(ancient);
    expect(snapshot(byId("UAT-1"))).toBe(current);
  });

  it("a manual-review case does not alter the next case", () => {
    const current = snapshot(byId("UAT-1"));
    snapshot(byId("UAT-11"));
    expect(snapshot(byId("UAT-1"))).toBe(current);
  });
});

/* ============ Question-time retrieval must not contaminate ============ */

describe("Question retrieval cannot contaminate drafting retrieval", () => {
  function questionRetrieveAll(f: Fixture) {
    const input = {
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    };
    const analysis = analyseCase(input);
    const facts = deriveKnownFacts(input);
    const reqs = [
      ...TRIAGE_REQUIREMENTS,
      ...Object.values(ROUTE_REQUIREMENTS).flatMap((r) => r ?? []),
    ];
    for (const requirement of reqs) {
      retrieveForQuestion({
        requirement,
        facts,
        evidenceTypes: f.evidenceTypes,
        parkingEventDate: f.confirmed.parking_event_date ?? null,
        pofa: analysis.pofa,
      });
    }
  }

  it("drafting retrieval is unchanged by prior question retrieval", () => {
    const clean = snapshot(byId("UAT-1"));
    questionRetrieveAll(byId("UAT-1"));
    expect(snapshot(byId("UAT-1"))).toBe(clean);
  });

  it("case A question retrieval does not contaminate case B drafting", () => {
    const b = snapshot(byId("UAT-3"));
    questionRetrieveAll(byId("UAT-1"));
    expect(snapshot(byId("UAT-3"))).toBe(b);
  });

  it("question retrieval across every fixture leaves the catalogue intact", () => {
    const before = ALL_KB_MODULES.map((m) => `${m.moduleId}:${m.status}`).join(",");
    for (const f of FIXTURES) questionRetrieveAll(f);
    expect(ALL_KB_MODULES.map((m) => `${m.moduleId}:${m.status}`).join(",")).toBe(before);
  });

  it("drafting retrieval does not contaminate later question retrieval", () => {
    const first = JSON.stringify(
      retrieveForQuestion({
        requirement: ROUTE_REQUIREMENTS.PAYMENT![0],
        facts: deriveKnownFacts({
          confirmed: byId("UAT-1").confirmed,
          answers: byId("UAT-1").answers,
          evidenceTypes: byId("UAT-1").evidenceTypes,
        }),
        evidenceTypes: byId("UAT-1").evidenceTypes,
        parkingEventDate: "2026-07-12",
        pofa: analyseCase({
          confirmed: byId("UAT-1").confirmed,
          answers: byId("UAT-1").answers,
          evidenceTypes: byId("UAT-1").evidenceTypes,
        }).pofa,
      }),
    );

    for (const f of FIXTURES) snapshot(f);

    const again = JSON.stringify(
      retrieveForQuestion({
        requirement: ROUTE_REQUIREMENTS.PAYMENT![0],
        facts: deriveKnownFacts({
          confirmed: byId("UAT-1").confirmed,
          answers: byId("UAT-1").answers,
          evidenceTypes: byId("UAT-1").evidenceTypes,
        }),
        evidenceTypes: byId("UAT-1").evidenceTypes,
        parkingEventDate: "2026-07-12",
        pofa: analyseCase({
          confirmed: byId("UAT-1").confirmed,
          answers: byId("UAT-1").answers,
          evidenceTypes: byId("UAT-1").evidenceTypes,
        }).pofa,
      }),
    );
    expect(again).toBe(first);
  });
});

/* ================= Fixture inputs must not be mutated ================= */

describe("Case inputs are not mutated by the pipeline", () => {
  it("the answers object is unchanged after analysis and retrieval", () => {
    const f = byId("UAT-1");
    const before = JSON.stringify(f.answers);
    snapshot(f);
    expect(JSON.stringify(f.answers)).toBe(before);
  });

  it("the confirmed notice object is unchanged", () => {
    const f = byId("UAT-1");
    const before = JSON.stringify(f.confirmed);
    snapshot(f);
    expect(JSON.stringify(f.confirmed)).toBe(before);
  });

  it("evidence types are unchanged", () => {
    const f = byId("UAT-2");
    const before = [...f.evidenceTypes].join(",");
    snapshot(f);
    expect(f.evidenceTypes.join(",")).toBe(before);
  });
});
