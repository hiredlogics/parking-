/**
 * @vitest-environment node
 *
 * Module→module edges, and the judge constraints built on them.
 *
 * Two things are worth testing here and they are different in kind.
 *
 * The first is the seed itself. An edge that names a module which does
 * not exist is silently inert — `conflictsWith` returns a set nothing
 * matches — so a typo would never surface at runtime. The integrity
 * tests below are the only thing that would catch it.
 *
 * The second is the enforcement. A CONFLICTS_WITH edge SUPPRESSES a
 * ground, which is the one direction of error that loses the customer an
 * argument they were entitled to. So the tests assert not only that
 * conflicts are enforced but the boundaries: that an absent edge set
 * invents no conflict, that the higher-confidence ground is the survivor
 * whichever way the row happens to be stored, and that a suppressed
 * ground does not consume a ceiling slot on its way out.
 */
import { describe, expect, it } from "vitest";
import {
  SEED_MODULE_EDGES,
  conflictsWith,
  generalisationsOf,
  invalidateModuleEdgeCache,
  loadModuleEdges,
  prerequisitesOf,
  supersededBy,
  type ModuleEdge,
} from "@/lib/kb/edges";
import {
  MAX_SELECTED_MODULES,
  enforceJudgeVerdict,
  type JudgeGround,
  type JudgeVerdict,
} from "@/lib/judge";
import { ALL_KB_MODULES } from "@/lib/kb/seed";
import type { KbModule } from "@/lib/kb/types";
import type { KnownFacts } from "@/lib/facts/types";

const ALL_MODULES: KbModule[] = ALL_KB_MODULES;

function facts(over: Partial<KnownFacts> = {}): KnownFacts {
  return {
    values: { notice_route: "POSTAL" },
    known: new Set(["notice_route"]),
    provenance: { notice_route: "notice" },
    tags: new Set<string>(),
    evidence: new Set<string>(),
    ...over,
  };
}

function ground(moduleId: string, confidence: number): JudgeGround {
  return {
    moduleId,
    applies: true,
    confidence,
    groundingFactKeys: ["notice_route"],
    reasoning: "test",
  };
}

function verdict(grounds: JudgeGround[]): JudgeVerdict {
  return {
    caseUnderstanding: "test",
    grounds,
    providerId: "test-judge",
    model: null,
  };
}

function moduleOf(id: string): KbModule {
  const m = ALL_MODULES.find((x) => x.moduleId === id);
  if (!m) throw new Error(`no such seed module ${id}`);
  return m;
}

/** Run enforcement with every named module already ruled eligible. */
function enforce(
  grounds: JudgeGround[],
  edges: ModuleEdge[] | undefined,
  extra: Partial<Parameters<typeof enforceJudgeVerdict>[0]> = {},
) {
  const ids = [...new Set(grounds.map((g) => g.moduleId))];
  return enforceJudgeVerdict({
    verdict: verdict(grounds),
    facts: facts(),
    eligible: ids.map(moduleOf),
    allModules: ALL_MODULES,
    trace: [],
    edges,
    ...extra,
  });
}

describe("seed edge integrity", () => {
  const ids = new Set(ALL_MODULES.map((m) => m.moduleId));

  it("names only modules that exist", () => {
    // A typo here is inert rather than loud: nothing would ever match it.
    const unknown = SEED_MODULE_EDGES.flatMap((e) =>
      [e.fromModule, e.toModule].filter((id) => !ids.has(id)),
    );
    expect(unknown).toEqual([]);
  });

  it("has no self-edges", () => {
    expect(
      SEED_MODULE_EDGES.filter((e) => e.fromModule === e.toModule),
    ).toEqual([]);
  });

  it("has no duplicate (from, to, kind) triples", () => {
    // The table's unique constraint would reject these at seed time; the
    // point of asserting it here is that the failure would otherwise
    // appear as an opaque insert error in production, not in CI.
    const keys = SEED_MODULE_EDGES.map(
      (e) => `${e.fromModule}|${e.toModule}|${e.kind}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("states a reason for every edge", () => {
    // An edge with no note cannot be reviewed by the lawyer who has to
    // sign off on suppressing a ground.
    for (const e of SEED_MODULE_EDGES) {
      expect(e.note.trim().length, `${e.fromModule}→${e.toModule}`).toBeGreaterThan(20);
    }
  });

  it("does not put a module in conflict with its own prerequisite", () => {
    // This combination is unsatisfiable: the ground would be dropped
    // whether or not the other is argued.
    for (const e of SEED_MODULE_EDGES) {
      if (e.kind !== "REQUIRES") continue;
      expect(
        conflictsWith(SEED_MODULE_EDGES, e.fromModule).has(e.toModule),
        `${e.fromModule} requires and conflicts with ${e.toModule}`,
      ).toBe(false);
    }
  });
});

describe("edge query helpers", () => {
  it("treats CONFLICTS_WITH as undirected", () => {
    // Stored KB-PAY-01 → KB-CON-01. Both directions must see it, or
    // enforcement would depend on which way an administrator typed it.
    expect(conflictsWith(SEED_MODULE_EDGES, "KB-PAY-01")).toContain("KB-CON-01");
    expect(conflictsWith(SEED_MODULE_EDGES, "KB-CON-01")).toContain("KB-PAY-01");
  });

  it("treats REQUIRES as directed", () => {
    expect(prerequisitesOf(SEED_MODULE_EDGES, "KB-POFA-04")).toContain("KB-POFA-01");
    // The threshold module does not require the defect module.
    expect(prerequisitesOf(SEED_MODULE_EDGES, "KB-POFA-01")).not.toContain("KB-POFA-04");
  });

  it("treats NARROWS as directed", () => {
    expect(generalisationsOf(SEED_MODULE_EDGES, "KB-KEY-01")).toContain("KB-PAY-01");
    expect(generalisationsOf(SEED_MODULE_EDGES, "KB-PAY-01")).toEqual([]);
  });

  it("reports no supersessions in the seed", () => {
    // Nothing in the KB is retired by another module yet. Asserted so
    // that adding one is a deliberate act with a test to update.
    expect(
      SEED_MODULE_EDGES.filter((e) => e.kind === "SUPERSEDES"),
    ).toEqual([]);
    expect(supersededBy(SEED_MODULE_EDGES, "KB-POFA-01")).toEqual([]);
  });

  it("returns empty sets for a module with no edges", () => {
    expect(conflictsWith(SEED_MODULE_EDGES, "KB-NOT-A-MODULE").size).toBe(0);
    expect(prerequisitesOf(SEED_MODULE_EDGES, "KB-NOT-A-MODULE")).toEqual([]);
  });

  it("falls back to the code-side seed with no database", async () => {
    invalidateModuleEdgeCache();
    const edges = await loadModuleEdges();
    expect(edges.length).toBeGreaterThanOrEqual(SEED_MODULE_EDGES.length);
    for (const seed of SEED_MODULE_EDGES) {
      expect(
        edges.some(
          (e) =>
            e.fromModule === seed.fromModule &&
            e.toModule === seed.toModule &&
            e.kind === seed.kind,
        ),
      ).toBe(true);
    }
  });
});

describe("judge enforcement: CONFLICTS", () => {
  it("drops the lower-confidence side of a conflict", () => {
    const d = enforce(
      [ground("KB-PAY-01", 0.9), ground("KB-CON-01", 0.5)],
      SEED_MODULE_EDGES,
    );
    expect(d.moduleIds).toEqual(["KB-PAY-01"]);
    expect(d.drops).toEqual([
      expect.objectContaining({ moduleId: "KB-CON-01", reason: "CONFLICTS" }),
    ]);
  });

  it("drops the other side when the confidences are reversed", () => {
    // The seed row is stored KB-PAY-01 → KB-CON-01. If enforcement read
    // the edge directionally, this case would keep both.
    const d = enforce(
      [ground("KB-PAY-01", 0.4), ground("KB-CON-01", 0.95)],
      SEED_MODULE_EDGES,
    );
    expect(d.moduleIds).toEqual(["KB-CON-01"]);
    expect(d.drops[0]).toMatchObject({ moduleId: "KB-PAY-01", reason: "CONFLICTS" });
  });

  it("explains the drop by naming the ground that won", () => {
    const d = enforce(
      [ground("KB-PAY-01", 0.9), ground("KB-CON-01", 0.5)],
      SEED_MODULE_EDGES,
    );
    expect(d.drops[0].detail).toContain("KB-PAY-01");
  });

  it("invents no conflict when no edges are supplied", () => {
    // The behaviour before edges existed. A missing edge set must never
    // suppress a ground.
    const d = enforce([ground("KB-PAY-01", 0.9), ground("KB-CON-01", 0.5)], undefined);
    expect(d.moduleIds).toEqual(["KB-PAY-01", "KB-CON-01"]);
    expect(d.drops).toEqual([]);
  });

  it("invents no conflict from an empty edge set", () => {
    const d = enforce([ground("KB-PAY-01", 0.9), ground("KB-CON-01", 0.5)], []);
    expect(d.moduleIds).toEqual(["KB-PAY-01", "KB-CON-01"]);
  });

  it("keeps both sides when only one is argued", () => {
    const d = enforce([ground("KB-PAY-01", 0.9)], SEED_MODULE_EDGES);
    expect(d.moduleIds).toEqual(["KB-PAY-01"]);
    expect(d.drops).toEqual([]);
  });

  it("records JUDGE_SELECTED_NONE, not a conflict, if everything conflicts away", () => {
    // Unreachable with the current seed (a conflict always leaves one
    // side standing) but asserted so the failure label stays honest if a
    // future edge set makes it reachable.
    const d = enforce([ground("KB-PAY-01", 0.9), ground("KB-CON-01", 0.9)], SEED_MODULE_EDGES);
    expect(d.moduleIds.length).toBe(1);
    expect(d.failure).toBeNull();
  });
});

describe("judge enforcement: MISSING_PREREQUISITE", () => {
  it("drops a ground whose prerequisite is not argued", () => {
    const d = enforce([ground("KB-POFA-04", 0.9)], SEED_MODULE_EDGES);
    expect(d.moduleIds).toEqual([]);
    expect(d.drops[0]).toMatchObject({
      moduleId: "KB-POFA-04",
      reason: "MISSING_PREREQUISITE",
    });
    expect(d.drops[0].detail).toContain("KB-POFA-01");
    expect(d.failure).toBe("JUDGE_SELECTED_NONE");
  });

  it("keeps it when the prerequisite is argued too", () => {
    const d = enforce(
      [ground("KB-POFA-01", 0.9), ground("KB-POFA-04", 0.8)],
      SEED_MODULE_EDGES,
    );
    expect(d.moduleIds).toEqual(["KB-POFA-01", "KB-POFA-04"]);
    expect(d.drops).toEqual([]);
  });

  it("checks against the surviving selection, not what was proposed", () => {
    // KB-POFA-01 is proposed but assessed as not applying, so it is not
    // being argued and cannot support anything.
    const d = enforce(
      [
        { ...ground("KB-POFA-01", 0.9), applies: false },
        ground("KB-POFA-04", 0.8),
      ],
      SEED_MODULE_EDGES,
    );
    expect(d.moduleIds).toEqual([]);
    expect(d.drops.map((x) => x.reason)).toEqual([
      "NOT_APPLICABLE",
      "MISSING_PREREQUISITE",
    ]);
  });

  it("drops a ground whose prerequisite was itself dropped as ungrounded", () => {
    const d = enforceJudgeVerdict({
      verdict: verdict([
        {
          ...ground("KB-POFA-01", 0.9),
          groundingFactKeys: ["a_fact_nobody_established"],
        },
        ground("KB-POFA-04", 0.8),
      ]),
      facts: facts(),
      eligible: [moduleOf("KB-POFA-01"), moduleOf("KB-POFA-04")],
      allModules: ALL_MODULES,
      trace: [],
      edges: SEED_MODULE_EDGES,
    });
    expect(d.moduleIds).toEqual([]);
    expect(d.drops.map((x) => x.reason)).toEqual([
      "UNGROUNDED",
      "MISSING_PREREQUISITE",
    ]);
  });
});

describe("graph constraints and the ceiling", () => {
  /**
   * The ordering here is the point. Constraints run BEFORE the ceiling,
   * so a ground that is going to be suppressed anyway does not occupy
   * one of the six slots and push out a ground that would have been
   * argued. If the order were reversed this test would see five
   * usable grounds instead of six.
   */
  it("does not let a suppressed ground consume a ceiling slot", () => {
    const fillers = [
      "KB-POFA-01",
      "KB-POFA-02",
      "KB-POFA-03",
      "KB-SIGN-02",
      "KB-GRACE-01",
      "KB-SIGN-03",
    ];
    const grounds = [
      ground("KB-PAY-01", 0.99),
      // Conflicts with KB-PAY-01 and is more confident than every filler,
      // so without the correct ordering it would take a slot.
      ground("KB-CON-01", 0.98),
      ...fillers.map((id, i) => ground(id, 0.9 - i * 0.01)),
    ];
    const d = enforce(grounds, SEED_MODULE_EDGES);

    expect(d.moduleIds).toHaveLength(MAX_SELECTED_MODULES);
    expect(d.moduleIds).not.toContain("KB-CON-01");
    // The sixth-best filler survives: it was not displaced by the
    // ground that was always going to be dropped.
    expect(d.moduleIds).toContain(fillers[4]);
    expect(
      d.drops.find((x) => x.moduleId === "KB-CON-01")?.reason,
    ).toBe("CONFLICTS");
  });

  it("still reports CEILING drops beyond the limit", () => {
    const ids = [
      "KB-POFA-01",
      "KB-POFA-02",
      "KB-POFA-03",
      "KB-SIGN-02",
      "KB-GRACE-01",
      "KB-SIGN-03",
      "KB-PAY-01",
    ];
    const d = enforce(
      ids.map((id, i) => ground(id, 0.99 - i * 0.01)),
      SEED_MODULE_EDGES,
    );
    expect(d.moduleIds).toHaveLength(MAX_SELECTED_MODULES);
    expect(d.drops.filter((x) => x.reason === "CEILING")).toHaveLength(
      ids.length - MAX_SELECTED_MODULES,
    );
  });

  it("is deterministic across repeated runs", () => {
    const grounds = [
      ground("KB-PAY-01", 0.9),
      ground("KB-CON-01", 0.9),
      ground("KB-POFA-01", 0.9),
    ];
    const a = enforce(grounds, SEED_MODULE_EDGES);
    const b = enforce(grounds, SEED_MODULE_EDGES);
    expect(a.moduleIds).toEqual(b.moduleIds);
    expect(a.drops).toEqual(b.drops);
  });
});
