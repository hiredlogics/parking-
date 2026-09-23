/**
 * @vitest-environment node
 *
 * Node environment is required: the OpenAI SDK refuses to construct a
 * client in a browser-like environment, and the provider factory test
 * instantiates it.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  draftAppeal,
  findUnresolvedVariables,
  normaliseProse,
  stripIdentifiers,
} from "@/lib/drafting/engine";
import {
  DeterministicDraftingProvider,
  getDraftingProvider,
  resetDraftingProvider,
} from "@/services/ai/drafting";
import { serialiseDraftingContext } from "@/services/ai/drafting/contextSerialiser";
import {
  ACTIVE_DRAFTING_PROMPT,
  DRAFTING_SYSTEM_PROMPT_V1,
  getDraftingPrompt,
} from "@/services/ai/prompts/drafting";
import { analyseCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { transformToKeeperSafe, validateKeeperSafe } from "@/lib/keeperSafe";
import { FACT } from "@/lib/facts/facts";
import { buildVariableMap } from "@/lib/variables";
import { toLegacyAnswers } from "@/lib/facts/toLegacyAnswers";
import type { AnswerMap } from "@/lib/facts/types";
import type { ConfirmedPcn } from "@/types";

/**
 * MASTER Developer Pack V2 Part 9 (drafting instructions), Part 11
 * (keeper-safe transformations) and KB §16 (priority/suppression),
 * encoded as tests.
 */

function pcn(over: Partial<ConfirmedPcn> = {}): ConfirmedPcn {
  return {
    operator_name: "Euro Car Parks",
    pcn_number: "ECP123456",
    vrm: "AB12CDE",
    parking_location: "Retail Park, Northampton",
    parking_event_date: "2026-05-04",
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

/* ============ V2 Part 11 keeper-safe transformations ============ */

describe("V2 Part 11 keeper-safe transformation table", () => {
  const rows: Array<[string, RegExp]> = [
    ["I paid on the app.", /A payment was made using the parking app\./],
    [
      "I broke down and couldn't move.",
      /The vehicle became mechanically immobilised and could not reasonably be moved during the relevant period\./,
    ],
    [
      "I park there because I live there.",
      /pursuant to the resident's pre-existing parking rights/,
    ],
    [
      "I came back twice.",
      /The vehicle attended the location on more than one separate occasion\./,
    ],
    ["I didn't see the sign.", /signage was visible on entry|not sufficiently prominent/i],
  ];

  for (const [input, expected] of rows) {
    it(`transforms: ${input}`, () => {
      const { text } = transformToKeeperSafe(input);
      expect(text).toMatch(expected);
      expect(validateKeeperSafe(text).ok).toBe(true);
    });
  }

  it("transforms 'my car wouldn't start'", () => {
    const { text } = transformToKeeperSafe("My car wouldn't start.");
    expect(text).toMatch(/mechanically immobilised/);
  });

  it("leaves already keeper-safe prose untouched", () => {
    const safe =
      "The vehicle became mechanically immobilised and could not reasonably be moved.";
    expect(transformToKeeperSafe(safe).text).toBe(safe);
  });
});

/* ============ Post-processing of untrusted model output ============ */

describe("Identifier leak prevention (V2 Part 9 item 13)", () => {
  it("strips module, block, source, rule and validator identifiers", () => {
    const dirty =
      "Per KB-POFA-01 and PP-POFA-003, see SRC-POFA-2012 (PP-R012) and VAL-DRIVER under CODE-SINGLE-V1-1, also AI-RES-001.";
    const { text, stripped } = stripIdentifiers(dirty);
    expect(text).not.toMatch(/KB-|PP-|SRC-|VAL-|CODE-|AI-RES/);
    expect(stripped).toContain("KB-POFA-01");
    expect(stripped).toContain("PP-POFA-003");
    expect(stripped).toContain("SRC-POFA-2012");
    expect(stripped).toContain("VAL-DRIVER");
    expect(stripped).toContain("AI-RES-001");
  });

  it("leaves clean prose unchanged", () => {
    const clean = "A payment was made in connection with the parking event.";
    expect(stripIdentifiers(clean).text).toBe(clean);
  });
});

describe("Prose normalisation", () => {
  it("removes markdown headings, emphasis and list markers", () => {
    const out = normaliseProse(
      "## Grounds\n\n- **Payment** was made\n1. The vehicle was present\n\n*emphasis*",
    );
    expect(out).not.toMatch(/[#*]/);
    expect(out).not.toMatch(/^\s*[-\d]/m);
    expect(out).toMatch(/Payment was made/);
  });

  it("removes the salutation and sign-off owned by the template", () => {
    const out = normaliseProse(
      "Dear Sir or Madam,\n\nThe vehicle was parked lawfully.\n\nYours faithfully,\nThe registered keeper",
    );
    expect(out).not.toMatch(/dear/i);
    expect(out).not.toMatch(/yours faithfully/i);
    expect(out).not.toMatch(/the registered keeper$/i);
    expect(out).toMatch(/The vehicle was parked lawfully\./);
  });

  it("collapses excess blank lines", () => {
    expect(normaliseProse("A.\n\n\n\nB.")).toBe("A.\n\nB.");
  });
});

describe("Unresolved variable detection", () => {
  it("finds unresolved placeholders", () => {
    expect(findUnresolvedVariables("Vehicle {{vrm}} and {{pcn_number}}")).toEqual([
      "vrm",
      "pcn_number",
    ]);
  });
  it("returns nothing for fully substituted text", () => {
    expect(findUnresolvedVariables("Vehicle AB12CDE")).toEqual([]);
  });
});

/* ============ Provider factory ============ */

describe("Drafting provider factory", () => {
  const saved = {
    provider: process.env.DRAFTING_PROVIDER,
    key: process.env.OPENAI_API_KEY,
  };
  beforeEach(() => resetDraftingProvider());
  afterEach(() => {
    if (saved.provider === undefined) delete process.env.DRAFTING_PROVIDER;
    else process.env.DRAFTING_PROVIDER = saved.provider;
    if (saved.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = saved.key;
    resetDraftingProvider();
  });

  it("uses the deterministic provider when forced", () => {
    process.env.DRAFTING_PROVIDER = "deterministic";
    const p = getDraftingProvider();
    expect(p.id).toBe("deterministic-draft");
    expect(p.bespoke).toBe(false);
  });

  it("falls back to deterministic when no API key is present", () => {
    delete process.env.DRAFTING_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    expect(getDraftingProvider().id).toBe("deterministic-draft");
  });

  it("throws loudly when openai is forced without a key", () => {
    process.env.DRAFTING_PROVIDER = "openai";
    delete process.env.OPENAI_API_KEY;
    expect(() => getDraftingProvider()).toThrow(/OPENAI_API_KEY is not set/);
  });

  it("selects the AI provider when a key is present", () => {
    delete process.env.DRAFTING_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test-key";
    const p = getDraftingProvider();
    expect(p.bespoke).toBe(true);
    expect(p.id).toMatch(/^openai-draft:/);
  });
});

/* ============ Prompt versioning ============ */

describe("Prompt versioning (brief §38)", () => {
  it("resolves the active drafting prompt", () => {
    const p = getDraftingPrompt();
    expect(p.id).toBe(ACTIVE_DRAFTING_PROMPT);
    expect(p.operation).toBe("drafting");
  });

  it("throws on an unknown version rather than guessing", () => {
    expect(() => getDraftingPrompt("draft-v99")).toThrow(/Unknown drafting prompt/);
  });

  it("states every non-negotiable prohibition", () => {
    const p = DRAFTING_SYSTEM_PROMPT_V1;
    for (const rule of [
      /never identify, name, infer or imply who was driving/i,
      /never invent facts/i,
      /never state a legal proposition that is not present/i,
      /never say evidence is enclosed/i,
      /never quote or name case law/i,
      /never output module ids/i,
      /never use popla, ias, tribunal, court/i,
      /consideration period with an end-of-parking grace/i,
      /do not stack every possible ground/i,
    ]) {
      expect(p, String(rule)).toMatch(rule);
    }
  });
});

/* ============ Context serialisation ============ */

describe("Drafting context", () => {
  function buildContext(extra: AnswerMap = {}, evidenceTypes: string[] = []) {
    const confirmed = pcn();
    const analysis = analyseCase({
      confirmed,
      answers: answers(extra),
      evidenceTypes,
    });
    const retrieval = retrieveKnowledge({
      analysis,
      parkingEventDate: confirmed.parking_event_date,
      evidenceTypes,
    });
    const variables = buildVariableMap(
      confirmed,
      toLegacyAnswers(answers(extra)),
    ) as Record<string, string>;
    return {
      analysis,
      modules: retrieval.modules,
      blocks: retrieval.blocks,
      sources: retrieval.sources,
      variables,
      availableEvidence: evidenceTypes,
    };
  }

  it("never includes module, block or source identifiers", () => {
    const text = serialiseDraftingContext(
      buildContext({ [FACT.SCENARIOS]: ["payment_made"] }, ["receipt"]),
    );
    expect(text).not.toMatch(/\bKB-[A-Z]+-\d/);
    expect(text).not.toMatch(/\bSRC-[A-Z]/);
    expect(text).not.toMatch(/\bPP-[A-Z]+-\d/);
  });

  it("includes the prohibited claims list", () => {
    const text = serialiseDraftingContext(
      buildContext({ [FACT.SCENARIOS]: ["payment_made"] }),
    );
    expect(text).toMatch(/PROHIBITED CLAIMS/);
    expect(text).toMatch(/OBSOLETE_PENALTY_ARGUMENT/);
  });

  it("warns explicitly when no evidence is available", () => {
    const text = serialiseDraftingContext(buildContext({}, []));
    expect(text).toMatch(/NONE — you must not say any evidence is enclosed/);
  });

  it("tells the drafter when no PoFA defect is established", () => {
    const text = serialiseDraftingContext(buildContext());
    expect(text).toMatch(/No Schedule 4 timing failure is established/);
  });

  it("permits the timing point once a failure is established", () => {
    const confirmed = pcn({ notice_issue_date: "2026-06-10" });
    const analysis = analyseCase({ confirmed, answers: answers() });
    const retrieval = retrieveKnowledge({
      analysis,
      parkingEventDate: confirmed.parking_event_date,
    });
    const text = serialiseDraftingContext({
      analysis,
      modules: retrieval.modules,
      blocks: retrieval.blocks,
      sources: retrieval.sources,
      variables: {
        parking_event_date: confirmed.parking_event_date ?? "",
        notice_issue_date: confirmed.notice_issue_date ?? "",
      },
      availableEvidence: [],
    });
    expect(text).toMatch(/TIMING FAILURE ESTABLISHED/i);
    expect(text).toMatch(/MUST substantiate/i);
    expect(text).toMatch(/SUBSTANTIATION REQUIREMENT/);
    // Customer-facing prose — never raw ISO for deemed given / deadline.
    expect(text).toMatch(
      /Date the notice is treated as given \(deemed delivery applied\): \d{1,2} \w+ \d{4}/,
    );
    expect(text).toMatch(/Statutory deadline for giving the notice: \d{1,2} \w+ \d{4}/);
    expect(text).not.toMatch(
      /treated as given \(deemed delivery applied\): \d{4}-\d{2}-\d{2}/,
    );
  });

  it("active prompt requires substantiating grounds with case facts", () => {
    const p = getDraftingPrompt();
    expect(p.id).toBe("draft-v5");
    expect(p.body).toMatch(/SUBSTANTIATE EVERY GROUND/i);
    expect(p.body).toMatch(/exact dates/i);
  });
});

/* ============ End-to-end drafting (deterministic provider) ============ */

describe("draftAppeal end to end", () => {
  const saved = process.env.DRAFTING_PROVIDER;
  beforeEach(() => {
    process.env.DRAFTING_PROVIDER = "deterministic";
    resetDraftingProvider();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.DRAFTING_PROVIDER;
    else process.env.DRAFTING_PROVIDER = saved;
    resetDraftingProvider();
  });

  it("produces a keeper-safe body with no identifiers or placeholders", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["payment_made"],
        [FACT.PAYMENT_METHOD]: "app",
        [FACT.PAYMENT_EVIDENCE]: "YES",
      }),
      evidenceTypes: ["receipt"],
    });
    expect(r.ok).toBe(true);
    expect(r.body).toBeTruthy();
    expect(r.keeperSafe).toBe(true);
    expect(r.unresolvedVariables).toEqual([]);
    expect(r.body!).not.toMatch(/\bKB-[A-Z]+-\d/);
    expect(r.body!).not.toMatch(/\bPP-[A-Z]+-\d/);
    expect(r.body!).not.toMatch(/\{\{/);
    expect(r.body!).not.toMatch(/\bi\s+(?:paid|parked|drove)\b/i);
  });

  it("substitutes the real notice values", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.body).toContain("AB12CDE");
    expect(r.body).toContain("ECP123456");
  });

  it("flags that deterministic output is not bespoke", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.draft?.bespoke).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/not bespoke/i);
  });

  it("records the provider and prompt version for the audit trail", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.draft?.providerId).toBe("deterministic-draft");
    expect(r.draft?.promptVersion).toBe("none");
    expect(r.engineVersion).toBe("drafting-v1");
    expect(r.draft?.moduleIds.length).toBeGreaterThan(0);
  });

  it("blocks a case routed to manual review before drafting", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.JURISDICTION]: "SCOTLAND" }),
    });
    expect(r.ok).toBe(false);
    expect(r.body).toBeNull();
    expect(r.blockedReason).toMatch(/^MANUAL_REVIEW:JURISDICTION_SCOTLAND$/);
  });

  it("drops residential modules with no lease but still drafts the keeper route", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["resident_parking_rights"],
        [FACT.AGREEMENT_UPLOADED]: "NO",
      }),
    });
    // The keeper-liability threshold point remains legitimately available,
    // so the case is not blocked — but nothing residential may be asserted.
    expect(r.ok).toBe(true);
    expect(r.draft!.moduleIds.some((id) => id.startsWith("KB-RES"))).toBe(false);
    expect(r.body).not.toMatch(/pre-existing residential parking rights/i);
    // Word boundaries matter here — "please" contains "lease".
    expect(r.body).not.toMatch(/\b(lease|tenancy|leaseholder)\b/i);
  });

  it("blocks when the driver is identified and no other route is supported", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.DRIVER_IDENTIFIED]: "YES" }),
    });
    expect(r.ok).toBe(false);
    expect(r.blockedReason).toBe("MANUAL_REVIEW:NO_SUPPORTED_ROUTE");
  });

  it("leads on breakdown for a Part 12 Example A case", async () => {
    const r = await draftAppeal({
      confirmed: pcn({ alleged_breach: "Overstayed by 47 minutes" }),
      answers: answers({
        [FACT.SCENARIOS]: ["breakdown_immobilised"],
        [FACT.BREAKDOWN_NATURE]: "mechanical_failure",
        [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
        [FACT.BREAKDOWN_EVIDENCE]: ["recovery_report"],
      }),
      evidenceTypes: ["recovery_report"],
    });
    expect(r.ok).toBe(true);
    expect(r.analysis.primaryRoute).toBe("BREAKDOWN");
    expect(r.body).toMatch(/mechanically immobilised/i);
  });

  it("never mentions enclosed evidence when none is available", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
      evidenceTypes: [],
    });
    expect(r.ok).toBe(true);
    expect(r.analysis.prohibitedClaims).toContain("CLAIM_EVIDENCE_ENCLOSED");
    // The payment-evidence block is only authorised when evidence exists.
    expect(r.body).not.toMatch(/Evidence confirming payment is supplied/i);
    expect(r.body).not.toMatch(/supplied with this appeal/i);
  });

  it("includes payment-evidence wording once evidence really exists", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["payment_made"],
        [FACT.PAYMENT_EVIDENCE]: "YES",
      }),
      evidenceTypes: ["receipt"],
    });
    expect(r.body).toMatch(/Evidence confirming payment is supplied/i);
  });

  it("does not use machine-failure or app-failure wording for a successful payment", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({
        [FACT.SCENARIOS]: ["payment_made"],
        [FACT.PAYMENT_METHOD]: "app",
      }),
    });
    expect(r.ok).toBe(true);
    expect(r.body).not.toMatch(/payment machine did not operate/i);
    expect(r.body).not.toMatch(/could not be completed because/i);
  });

  it("uses machine-failure wording only for a prevented machine payment", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({
        // Established status, not a ticked category — see issueAnalysis.
        [FACT.PAYMENT_MADE]: "ATTEMPTED_FAILED",
        [FACT.PAYMENT_METHOD]: "machine",
      }),
    });
    expect(r.body).toMatch(/payment machine did not operate/i);
    // The digital-failure wording must not also appear.
    expect(r.body).not.toMatch(/digital payment facility/i);
  });

  it("does not assert a missing Notice to Keeper when one was received", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.body).not.toMatch(/has not received a Notice to Keeper/i);
  });

  it("does not assert a PoFA conclusion when no defect is established", async () => {
    const r = await draftAppeal({
      confirmed: pcn(),
      answers: answers({ [FACT.SCENARIOS]: ["payment_made"] }),
    });
    expect(r.analysis.pofa.timingStatus).toBe("COMPLIANT");
    // The threshold point is fine; the "has failed to establish" conclusion is not.
    expect(r.body).not.toMatch(/has (?:therefore )?failed to establish keeper liability/i);
    expect(r.body).not.toMatch(/liability cannot be transferred/i);
  });

  it("does assert the PoFA conclusion once a timing failure is established", async () => {
    const r = await draftAppeal({
      confirmed: pcn({ notice_issue_date: "2026-06-10" }),
      answers: answers(),
    });
    expect(r.analysis.pofa.timingStatus).toBe("FAILED");
    expect(r.body).toMatch(/not delivered within the relevant statutory period/i);
  });
});

/* ============ Deterministic provider behaviour ============ */

describe("Deterministic provider guards", () => {
  it("omits blocks whose variables cannot be resolved", async () => {
    const provider = new DeterministicDraftingProvider();
    const result = await provider.draft({
      analysis: {
        primaryRoute: "RESIDENTIAL",
        secondaryRoutes: [],
        assessments: [
          { route: "RESIDENTIAL", rank: 1, basis: [], moduleIds: [], evidenceBacked: true },
        ],
        verifiedFacts: [],
        missingFacts: [],
        evidenceRefs: [],
        prohibitedClaims: [],
        codeVersion: null,
        codeVersionId: null,
        pofa: {
          route: "NOT_APPLICABLE", paragraph: null, timingStatus: "NOT_APPLICABLE",
          deadline: null, noticeGivenDate: null, daysLate: null,
          applicable: false, reasons: [], unresolved: [], confirmedContentDefects: [],
        },
        driverStatus: "UNIDENTIFIED",
        manualReview: null,
        analysisVersion: "analysis-v1",
      },
      modules: [],
      blocks: [
        {
          blockId: "AI-RES-001",
          title: "Residential Primacy",
          routeFamily: "RESIDENTIAL",
          text: "Parked pursuant to rights in the uploaded {{lease_or_tenancy}}.",
          variables: ["lease_or_tenancy"],
          status: "ACTIVE",
          version: 1,
          inV2Appendix: true,
          usageNotes: null,
        },
        {
          blockId: "PP-END-001",
          title: "Cancellation",
          routeFamily: "CLOSING",
          text: "The operator is requested to cancel the charge.",
          variables: [],
          status: "ACTIVE",
          version: 1,
          inV2Appendix: true,
          usageNotes: null,
        },
      ],
      sources: [],
      variables: {},
      availableEvidence: [],
    });
    expect(result.body).not.toMatch(/\{\{/);
    expect(result.body).toMatch(/requested to cancel/);
    expect(result.warnings.join(" ")).toMatch(/Omitted a block/);
  });
});
