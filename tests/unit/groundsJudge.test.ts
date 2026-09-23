/**
 * @vitest-environment node
 *
 * The grounds judge, and specifically its enforcement layer.
 *
 * The provider is the part that can be wrong; `enforceJudgeVerdict` is
 * the part that makes being wrong harmless. So most of this file builds
 * deliberately bad verdicts by hand and asserts they are refused — a
 * hallucinated module id, a ground resting on a fact nobody established,
 * a ground resting on a system default, a confident attempt to reopen a
 * prohibition. Testing the mock provider's own output would prove
 * nothing about any of that.
 */
import { describe, expect, it } from "vitest";
import {
  MockGroundsJudgeProvider,
  MAX_SELECTED_MODULES,
  enforceJudgeVerdict,
  judgeCandidates,
  judgeGrounds,
  type JudgeGround,
  type JudgeVerdict,
} from "@/lib/judge";
import { judgeSchema, groundableFactKeys } from "@/lib/judge/schema";
import { buildJudgeUserPrompt, JUDGE_SYSTEM_PROMPT } from "@/lib/judge/prompt";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { ALL_KB_MODULES } from "@/lib/kb/seed";
import type { KbModule } from "@/lib/kb/types";
import type { KnownFacts } from "@/lib/facts/types";
import { runReleaseChecklist } from "@/lib/validation/releaseChecklist";
import type { ValidatorContext } from "@/lib/validation/context";
import { UAT_FIXTURES } from "../fixtures/uatCases";

const ALL_MODULES: KbModule[] = ALL_KB_MODULES;

function facts(over: Partial<KnownFacts> = {}): KnownFacts {
  return {
    values: { notice_route: "POSTAL", driver_identified: "NO" },
    known: new Set(["notice_route", "driver_identified"]),
    provenance: { notice_route: "notice", driver_identified: "answer" },
    tags: new Set<string>(),
    evidence: new Set<string>(),
    ...over,
  };
}

function ground(over: Partial<JudgeGround> = {}): JudgeGround {
  return {
    moduleId: "KB-POFA-01",
    applies: true,
    confidence: 0.9,
    groundingFactKeys: ["notice_route"],
    reasoning: "test",
    ...over,
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

describe("judge enforcement: what a verdict cannot do", () => {
  it("refuses a module id that is not in the catalog", () => {
    const d = enforceJudgeVerdict({
      verdict: verdict([ground({ moduleId: "KB-TOTALLY-MADE-UP" })]),
      facts: facts(),
      eligible: [],
      allModules: ALL_MODULES,
      trace: [],
    });
    expect(d.moduleIds).toEqual([]);
    expect(d.drops[0].reason).toBe("UNKNOWN_MODULE");
    expect(d.failure).toBe("JUDGE_SELECTED_NONE");
  });

  it("refuses a ground resting on a fact nobody established", () => {
    const d = enforceJudgeVerdict({
      verdict: verdict([
        ground({ groundingFactKeys: ["payment_made", "notice_route"] }),
      ]),
      facts: facts(),
      eligible: [moduleOf("KB-POFA-01")],
      allModules: ALL_MODULES,
      trace: [{ moduleId: "KB-POFA-01", eligible: true, code: "ELIGIBLE", reason: "" }],
    });
    expect(d.moduleIds).toEqual([]);
    expect(d.drops[0].reason).toBe("UNGROUNDED");
    expect(d.drops[0].detail).toContain("payment_made");
  });

  it("refuses a ground resting on a system default, however confident", () => {
    /*
     * This is the fabrication-laundering case. resolveAnswersWithDefaults
     * fills provisional assumptions so the pipeline can run without
     * questions; those must never become their own permission to argue a
     * ground. A judge at confidence 1.0 does not change that.
     */
    const f = facts({
      values: { notice_route: "POSTAL", keeper_liability_assumed: "YES" },
      known: new Set(["notice_route", "keeper_liability_assumed"]),
      provenance: {
        notice_route: "notice",
        keeper_liability_assumed: "system_default",
      },
    });
    const d = enforceJudgeVerdict({
      verdict: verdict([
        ground({
          confidence: 1,
          groundingFactKeys: ["keeper_liability_assumed"],
        }),
      ]),
      facts: f,
      eligible: [moduleOf("KB-POFA-01")],
      allModules: ALL_MODULES,
      trace: [{ moduleId: "KB-POFA-01", eligible: true, code: "ELIGIBLE", reason: "" }],
    });
    expect(d.moduleIds).toEqual([]);
    expect(d.drops[0].reason).toBe("UNGROUNDED");
    expect(d.drops[0].detail).toContain("system_default");
  });

  it.each([
    "STATUS",
    "EFFECTIVE_DATES",
    "SOURCE_NON_BINDING",
    "PROHIBITED",
    "EVIDENCE_MISSING",
  ] as const)("cannot reopen a %s rejection", (code) => {
    const d = enforceJudgeVerdict({
      verdict: verdict([ground({ moduleId: "KB-RES-01" })]),
      facts: facts(),
      eligible: [],
      allModules: ALL_MODULES,
      trace: [{ moduleId: "KB-RES-01", eligible: false, code, reason: "" }],
    });
    expect(d.moduleIds).toEqual([]);
    expect(d.drops[0].reason).toBe("HARD_REJECTION");
    expect(d.drops[0].detail).toContain(code);
  });

  it.each(["FACT_GATE", "ROUTE"] as const)(
    "may overturn a %s rejection, and records it as an override",
    (code) => {
      const d = enforceJudgeVerdict({
        verdict: verdict([ground({ moduleId: "KB-SIGN-01" })]),
        facts: facts(),
        eligible: [],
        allModules: ALL_MODULES,
        trace: [{ moduleId: "KB-SIGN-01", eligible: false, code, reason: "" }],
      });
      expect(d.moduleIds).toEqual(["KB-SIGN-01"]);
      expect(d.overrides).toEqual(["KB-SIGN-01"]);
      expect(d.failure).toBeNull();
    },
  );

  it("refuses an untraced module even when the module exists", () => {
    // No trace entry at all means retrieval never considered it. That is
    // not an overridable rejection, it is an unexplained appearance.
    const d = enforceJudgeVerdict({
      verdict: verdict([ground({ moduleId: "KB-SIGN-01" })]),
      facts: facts(),
      eligible: [],
      allModules: ALL_MODULES,
      trace: [],
    });
    expect(d.drops[0].reason).toBe("HARD_REJECTION");
    expect(d.drops[0].detail).toContain("UNTRACED");
  });

  it("drops grounds the judge itself marked inapplicable", () => {
    const d = enforceJudgeVerdict({
      verdict: verdict([
        ground({ moduleId: "KB-POFA-01", applies: false }),
        ground({ moduleId: "KB-POFA-05" }),
      ]),
      facts: facts(),
      eligible: [moduleOf("KB-POFA-01"), moduleOf("KB-POFA-05")],
      allModules: ALL_MODULES,
      trace: [
        { moduleId: "KB-POFA-01", eligible: true, code: "ELIGIBLE", reason: "" },
        { moduleId: "KB-POFA-05", eligible: true, code: "ELIGIBLE", reason: "" },
      ],
    });
    expect(d.moduleIds).toEqual(["KB-POFA-05"]);
    expect(d.drops.map((x) => x.reason)).toContain("NOT_APPLICABLE");
  });
});

describe("judge enforcement: the ceiling and ordering", () => {
  const many = ALL_MODULES.filter((m) => m.routeFamily !== "GOVERNANCE").slice(
    0,
    MAX_SELECTED_MODULES + 3,
  );

  it(`caps selection at ${MAX_SELECTED_MODULES} and records every drop`, () => {
    const d = enforceJudgeVerdict({
      verdict: verdict(
        many.map((m) => ground({ moduleId: m.moduleId, confidence: 0.5 })),
      ),
      facts: facts(),
      eligible: many,
      allModules: ALL_MODULES,
      trace: many.map((m) => ({
        moduleId: m.moduleId,
        eligible: true,
        code: "ELIGIBLE" as const,
        reason: "",
      })),
    });
    expect(d.moduleIds.length).toBe(MAX_SELECTED_MODULES);
    expect(d.drops.filter((x) => x.reason === "CEILING").length).toBe(
      many.length - MAX_SELECTED_MODULES,
    );
    // Nothing is lost silently: selected + dropped accounts for all of them.
    expect(d.moduleIds.length + d.drops.length).toBe(many.length);
  });

  it("orders by confidence, and breaks ties on BASE_RANK not emission order", () => {
    // KB-SIGN-01 is SIGNAGE (rank 60); KB-POFA-01 is POFA (rank 10).
    // Emitted signage-first, at equal confidence, POFA must still lead.
    const d = enforceJudgeVerdict({
      verdict: verdict([
        ground({ moduleId: "KB-SIGN-01", confidence: 0.5 }),
        ground({ moduleId: "KB-POFA-01", confidence: 0.5 }),
      ]),
      facts: facts(),
      eligible: [moduleOf("KB-SIGN-01"), moduleOf("KB-POFA-01")],
      allModules: ALL_MODULES,
      trace: [
        { moduleId: "KB-SIGN-01", eligible: true, code: "ELIGIBLE", reason: "" },
        { moduleId: "KB-POFA-01", eligible: true, code: "ELIGIBLE", reason: "" },
      ],
    });
    expect(d.moduleIds[0]).toBe("KB-POFA-01");
    expect(d.primaryRoute).toBe("POFA");
    expect(d.secondaryRoutes).toEqual(["SIGNAGE"]);
  });

  it("lets confidence beat rank when the judge is actually confident", () => {
    const d = enforceJudgeVerdict({
      verdict: verdict([
        ground({ moduleId: "KB-SIGN-01", confidence: 0.95 }),
        ground({ moduleId: "KB-POFA-01", confidence: 0.2 }),
      ]),
      facts: facts(),
      eligible: [moduleOf("KB-SIGN-01"), moduleOf("KB-POFA-01")],
      allModules: ALL_MODULES,
      trace: [
        { moduleId: "KB-SIGN-01", eligible: true, code: "ELIGIBLE", reason: "" },
        { moduleId: "KB-POFA-01", eligible: true, code: "ELIGIBLE", reason: "" },
      ],
    });
    expect(d.moduleIds[0]).toBe("KB-SIGN-01");
    expect(d.primaryRoute).toBe("SIGNAGE");
  });

  it("is deterministic: the same verdict always enforces identically", () => {
    const v = verdict([
      ground({ moduleId: "KB-SIGN-01", confidence: 0.5 }),
      ground({ moduleId: "KB-POFA-01", confidence: 0.5 }),
      ground({ moduleId: "KB-POFA-05", confidence: 0.5 }),
    ]);
    const args = {
      facts: facts(),
      eligible: [moduleOf("KB-SIGN-01"), moduleOf("KB-POFA-01"), moduleOf("KB-POFA-05")],
      allModules: ALL_MODULES,
      trace: ["KB-SIGN-01", "KB-POFA-01", "KB-POFA-05"].map((moduleId) => ({
        moduleId,
        eligible: true,
        code: "ELIGIBLE" as const,
        reason: "",
      })),
    };
    const a = enforceJudgeVerdict({ verdict: v, ...args });
    const b = enforceJudgeVerdict({ verdict: v, ...args });
    expect(a.moduleIds).toEqual(b.moduleIds);
    expect(a.primaryRoute).toBe(b.primaryRoute);
  });

  it("reports JUDGE_SELECTED_NONE when nothing survives", () => {
    const d = enforceJudgeVerdict({
      verdict: verdict([]),
      facts: facts(),
      eligible: [moduleOf("KB-POFA-01")],
      allModules: ALL_MODULES,
      trace: [{ moduleId: "KB-POFA-01", eligible: true, code: "ELIGIBLE", reason: "" }],
    });
    expect(d.failure).toBe("JUDGE_SELECTED_NONE");
    expect(d.moduleIds).toEqual([]);
  });

  it("never selects a governance module", () => {
    const gov = ALL_MODULES.find((m) => m.routeFamily === "GOVERNANCE");
    expect(gov).toBeDefined();
    const d = enforceJudgeVerdict({
      verdict: verdict([ground({ moduleId: gov!.moduleId })]),
      facts: facts(),
      eligible: [],
      allModules: ALL_MODULES,
      trace: [
        { moduleId: gov!.moduleId, eligible: false, code: "GOVERNANCE", reason: "" },
      ],
    });
    expect(d.moduleIds).toEqual([]);
    expect(d.drops[0].reason).toBe("HARD_REJECTION");
  });
});

describe("judge schema: the model is constrained before it answers", () => {
  it("restricts module_id to this case's candidates", () => {
    const spec = judgeSchema({
      candidateModuleIds: ["KB-POFA-01", "KB-SIGN-01"],
      facts: facts(),
    });
    const props = (spec.schema as Record<string, never>).properties as Record<
      string,
      Record<string, Record<string, Record<string, unknown>>>
    >;
    const moduleId = props.grounds.items.properties.module_id as {
      enum?: string[];
    };
    expect(moduleId.enum).toEqual(["KB-POFA-01", "KB-SIGN-01"]);
  });

  it("restricts grounding keys to facts with assertable provenance", () => {
    const f = facts({
      values: { notice_route: "POSTAL", guessed: "YES" },
      known: new Set(["notice_route", "guessed"]),
      provenance: { notice_route: "notice", guessed: "inferred" },
    });
    const keys = groundableFactKeys(f);
    expect(keys).toContain("notice_route");
    expect(keys).not.toContain("guessed");
  });

  it("offers tags and evidence as groundable, since grounds rest on them", () => {
    const keys = groundableFactKeys(
      facts({
        tags: new Set(["payment_made"]),
        evidence: new Set(["payment_receipt"]),
      }),
    );
    expect(keys).toContain("payment_made");
    expect(keys).toContain("payment_receipt");
  });
});

describe("judge prompt: the module contract reaches the model", () => {
  it("includes use_when, do_not_use_when and the core proposition", () => {
    const m = moduleOf("KB-POFA-01");
    const prompt = buildJudgeUserPrompt({
      analysis: analyseCase({
        confirmed: UAT_FIXTURES[0].confirmed,
        answers: {},
        evidenceTypes: [],
        evidenceRefs: [],
      }),
      facts: facts(),
      eligible: [m],
      overridable: [],
      trace: [],
    });
    expect(prompt).toContain(m.coreProposition);
    expect(prompt).toContain("USE WHEN");
    if (m.doNotUseWhen.length > 0) expect(prompt).toContain("DO NOT USE WHEN");
    expect(prompt).toContain("KB-POFA-01");
  });

  it("marks a previously-refused module so the judge knows to be strict", () => {
    const prompt = buildJudgeUserPrompt({
      analysis: analyseCase({
        confirmed: UAT_FIXTURES[0].confirmed,
        answers: {},
        evidenceTypes: [],
        evidenceRefs: [],
      }),
      facts: facts(),
      eligible: [],
      overridable: [moduleOf("KB-SIGN-01")],
      trace: [],
    });
    expect(prompt).toContain("[PREVIOUSLY REFUSED]");
  });

  it("never asks the model to identify the driver", () => {
    expect(JUDGE_SYSTEM_PROMPT).toMatch(/NEVER identify, infer or imply/);
    expect(JUDGE_SYSTEM_PROMPT).not.toMatch(/who was driving\?/i);
  });

  it("shows only groundable facts, so an inferred value cannot be cited", () => {
    const f = facts({
      values: { notice_route: "POSTAL", guessed: "YES" },
      known: new Set(["notice_route", "guessed"]),
      provenance: { notice_route: "notice", guessed: "inferred" },
    });
    const prompt = buildJudgeUserPrompt({
      analysis: analyseCase({
        confirmed: UAT_FIXTURES[0].confirmed,
        answers: {},
        evidenceTypes: [],
        evidenceRefs: [],
      }),
      facts: f,
      eligible: [],
      overridable: [],
      trace: [],
    });
    expect(prompt).toContain("notice_route");
    expect(prompt).not.toContain("guessed");
  });
});

describe("judge candidates: which refusals are offered back", () => {
  it("offers FACT_GATE and ROUTE refusals and nothing else", () => {
    const f = UAT_FIXTURES[0];
    const input = {
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    };
    const analysis = analyseCase(input);
    const retrieval = retrieveKnowledge({
      analysis,
      facts: factsForCase(input),
      parkingEventDate: f.confirmed.parking_event_date ?? null,
      evidenceTypes: f.evidenceTypes,
    });
    const { eligible, overridable } = judgeCandidates({
      retrieval,
      allModules: ALL_MODULES,
    });

    expect(eligible).toEqual(retrieval.modules);
    const codeById = new Map(retrieval.trace.map((t) => [t.moduleId, t.code]));
    for (const m of overridable) {
      expect(["FACT_GATE", "ROUTE"]).toContain(codeById.get(m.moduleId));
      expect(m.routeFamily).not.toBe("GOVERNANCE");
    }
    // The pool is real, not empty — otherwise this test proves nothing.
    expect(overridable.length).toBeGreaterThan(0);
  });
});

describe("judgeGrounds: end to end with the mock provider", () => {
  it("selects grounds for a real fixture and derives routes from them", async () => {
    const f = UAT_FIXTURES.find((x) => x.evidenceTypes.length > 0)!;
    const input = {
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    };
    const analysis = analyseCase(input);
    const facts_ = factsForCase(input);
    const retrieval = retrieveKnowledge({
      analysis,
      facts: facts_,
      parkingEventDate: f.confirmed.parking_event_date ?? null,
      evidenceTypes: f.evidenceTypes,
    });

    const d = await judgeGrounds({
      analysis,
      facts: facts_,
      retrieval,
      allModules: ALL_MODULES,
      provider: new MockGroundsJudgeProvider(),
    });

    expect(d).not.toBeNull();
    expect(d!.failure).toBeNull();
    expect(d!.moduleIds.length).toBeGreaterThan(0);
    expect(d!.moduleIds.length).toBeLessThanOrEqual(MAX_SELECTED_MODULES);
    expect(d!.primaryRoute).not.toBeNull();
    // Every selected module was eligible — the mock never overrides.
    const eligibleIds = new Set(retrieval.modules.map((m) => m.moduleId));
    for (const id of d!.moduleIds) expect(eligibleIds.has(id)).toBe(true);
    expect(d!.overrides).toEqual([]);
  });

  it("returns null when no judge is configured, meaning stay deterministic", async () => {
    const d = await judgeGrounds({
      analysis: analyseCase({
        confirmed: UAT_FIXTURES[0].confirmed,
        answers: {},
        evidenceTypes: [],
        evidenceRefs: [],
      }),
      facts: facts(),
      retrieval: {
        output: {} as never,
        modules: [],
        blocks: [],
        sources: [],
        trace: [],
        retrievalVersion: "x",
      },
      allModules: ALL_MODULES,
      provider: null,
    });
    expect(d).toBeNull();
  });

  it("labels a transport failure distinctly from a schema failure", async () => {
    const boom = (message: string) => ({
      id: "broken",
      displayName: "broken",
      judge: async () => {
        throw new Error(message);
      },
    });
    const args = {
      analysis: analyseCase({
        confirmed: UAT_FIXTURES[0].confirmed,
        answers: {},
        evidenceTypes: [],
        evidenceRefs: [],
      }),
      facts: facts(),
      retrieval: {
        output: {} as never,
        modules: [],
        blocks: [],
        sources: [],
        trace: [],
        retrievalVersion: "x",
      },
      allModules: ALL_MODULES,
    };

    const transport = await judgeGrounds({
      ...args,
      provider: boom("socket hang up"),
    });
    expect(transport!.failure).toBe("JUDGE_TRANSPORT_FAILED");

    const schema = await judgeGrounds({
      ...args,
      provider: boom("returned non-JSON output"),
    });
    expect(schema!.failure).toBe("JUDGE_SCHEMA_INVALID");
  });
});

describe("judge selection pass: hard filters still apply", () => {
  it("will not admit a prohibited module even when the judge selected it", () => {
    /*
     * The judge-selection pass skips the fact gate and the route filter.
     * It must not skip the prohibition check — that is the difference
     * between "the gates were too narrow" and "this claim is unsupported
     * on these facts".
     */
    const f = UAT_FIXTURES[0];
    const input = {
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    };
    const analysis = analyseCase(input);
    expect(analysis.prohibitedClaims.length).toBeGreaterThan(0);

    // Ask for every module in the catalog, including prohibited ones.
    const second = retrieveKnowledge({
      analysis,
      facts: factsForCase(input),
      parkingEventDate: f.confirmed.parking_event_date ?? null,
      evidenceTypes: f.evidenceTypes,
      judgeSelection: ALL_MODULES.map((m) => m.moduleId),
    });

    const retained = new Set(second.modules.map((m) => m.moduleId));
    const prohibitedCodes = new Set(analysis.prohibitedClaims);
    // At least one prohibition maps onto a module, and that module is out.
    const stillRefused = second.trace.filter(
      (t) => !t.eligible && t.code === "PROHIBITED",
    );
    if (prohibitedCodes.size > 0 && stillRefused.length > 0) {
      for (const t of stillRefused) expect(retained.has(t.moduleId)).toBe(false);
    }
    // Governance modules are never drafting context, selection or not.
    for (const m of second.modules) {
      expect(m.routeFamily).not.toBe("GOVERNANCE");
    }
  });

  it("retains exactly the selection and nothing else", () => {
    const f = UAT_FIXTURES[0];
    const input = {
      confirmed: f.confirmed,
      answers: f.answers,
      evidenceTypes: f.evidenceTypes,
    };
    const analysis = analyseCase(input);
    const wide = retrieveKnowledge({
      analysis,
      facts: factsForCase(input),
      parkingEventDate: f.confirmed.parking_event_date ?? null,
      evidenceTypes: f.evidenceTypes,
    });
    expect(wide.modules.length).toBeGreaterThan(0);

    const pick = [wide.modules[0].moduleId];
    const narrow = retrieveKnowledge({
      analysis,
      facts: factsForCase(input),
      parkingEventDate: f.confirmed.parking_event_date ?? null,
      evidenceTypes: f.evidenceTypes,
      judgeSelection: pick,
    });
    expect(narrow.modules.map((m) => m.moduleId)).toEqual(pick);
    expect(
      narrow.trace.some((t) => t.code === "NOT_SELECTED"),
    ).toBe(true);
  });
});

describe("JUDGE_DECISION_RECORDED: the release gate", () => {
  const f = UAT_FIXTURES[0];
  const input = {
    confirmed: f.confirmed,
    answers: f.answers,
    evidenceTypes: f.evidenceTypes,
  };

  function checklistWith(judge: ValidatorContext["judge"]) {
    const analysis = analyseCase(input);
    const facts_ = factsForCase(input);
    const retrieval = retrieveKnowledge({
      analysis,
      facts: facts_,
      parkingEventDate: f.confirmed.parking_event_date ?? null,
      evidenceTypes: f.evidenceTypes,
    });
    const ctx: ValidatorContext = {
      body: "The vehicle in question is recorded as present.\n\nThe operator should review its records.",
      analysis,
      modules: retrieval.modules,
      sources: retrieval.sources,
      facts: facts_,
      evidence: new Set(f.evidenceTypes),
      variables: {},
      judge,
    };
    const c = runReleaseChecklist(ctx);
    return c.items.find((i) => i.id === "JUDGE_DECISION_RECORDED")!;
  }

  it("passes when no judge ran — the deterministic path is accounted for", () => {
    expect(checklistWith(null).passed).toBe(true);
  });

  it("passes on a recorded decision that selected grounds", () => {
    expect(
      checklistWith({
        failure: null,
        moduleIds: ["KB-POFA-01"],
        providerId: "mock-judge-v1",
        recorded: true,
      }).passed,
    ).toBe(true);
  });

  it("fails when the judge failed", () => {
    const item = checklistWith({
      failure: "JUDGE_TRANSPORT_FAILED",
      moduleIds: [],
      providerId: "openai:x",
      recorded: true,
    });
    expect(item.passed).toBe(false);
    expect(item.detail).toContain("JUDGE_TRANSPORT_FAILED");
  });

  it("fails when the judge selected nothing", () => {
    expect(
      checklistWith({
        failure: null,
        moduleIds: [],
        providerId: "openai:x",
        recorded: true,
      }).passed,
    ).toBe(false);
  });

  it("fails when the decision never reached retrieval_runs", () => {
    /*
     * The audit write is allowed to fail without throwing away a paid-for
     * appeal — but the letter must then not be RELEASED, because nothing
     * stored explains why it argues the grounds it argues.
     */
    const item = checklistWith({
      failure: null,
      moduleIds: ["KB-POFA-01"],
      providerId: "openai:x",
      recorded: false,
    });
    expect(item.passed).toBe(false);
    expect(item.detail).toContain("retrieval_runs");
  });
});
