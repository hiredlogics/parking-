/**
 * @vitest-environment node
 *
 * The admin issue engine is the production path — `isAdminIssueEngineEnabled`
 * is true whenever a database is configured — but every other question test
 * sets `USE_ADMIN_ISSUE_ENGINE=0`, so this path shipped unguarded.
 *
 * Two defects lived here and both were customer-visible:
 *
 *  1. every outstanding fact was stamped `route: "TRIAGE"`, which
 *     `validateGeneratedQuestion` rejects as ROUTE_MISMATCH because the
 *     requirement map declares these facts under real routes. The AI was
 *     called and billed, its answer discarded on both attempts, and the
 *     deterministic bank served every question.
 *  2. every requirement was stamped `when: () => true`, erasing gates such
 *     as "only ask where permission came from once permission is
 *     established" — so a customer who said they had no permission
 *     document was still asked where the permission came from.
 */
import { describe, expect, it, vi } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT } from "@/lib/questions/facts";
import type { GeneratedQuestion } from "@/lib/questions/generated";
import type { QuestionProvider } from "@/services/ai/questions";
import type { MissingFact } from "@/lib/engine/issueEngine";

const missingFacts: MissingFact[] = [];

vi.mock("@/lib/engine/issueEngine", () => ({
  isAdminIssueEngineEnabled: () => true,
  evaluateIssues: async () => ({
    serviceCode: "PRIVATE_PARKING_INITIAL_APPEAL",
    activeIssues: [
      { code: "AUTHORISATION", label: "Authorisation", moduleIds: ["KB-AUTH-01"] },
    ],
    missingFacts,
    nextFact: missingFacts[0] ?? null,
    applicableModuleIds: ["KB-AUTH-01"],
    sufficient: false,
    origin: "admin_config" as const,
  }),
}));

vi.mock("@/lib/kb/catalog", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/kb/catalog")>()),
  loadKbCatalog: async () => ({ modules: [], sources: [] }),
}));

const { nextDynamicQuestion } = await import("@/lib/questions/dynamicEngine");

const CONFIRMED: ConfirmedPcn = {
  operator_name: "Op Ltd",
  pcn_number: "PCN123",
  vrm: "AB12CDE",
  parking_location: "Retail Park",
  parking_event_date: "2025-03-01",
  notice_issue_date: "2025-03-10",
  notice_received_date: "2025-03-14",
  alleged_breach: "Parked without a valid permit",
  charge_amount: 100,
  notice_route: "POSTAL",
  case_stage: "INITIAL_OPERATOR_APPEAL",
  confirmedAt: "2025-03-15T00:00:00.000Z",
};

function setMissing(rows: MissingFact[]): void {
  missingFacts.length = 0;
  missingFacts.push(...rows);
}

/**
 * A compliant model: it echoes back the route and reason code it was
 * handed in the outstanding list, which is exactly what the prompt
 * instructs. That makes this a test of the context we build, not of
 * model behaviour.
 */
function echoingProvider(): QuestionProvider & { seenRoute: () => string | null } {
  let seenRoute: string | null = null;
  return {
    id: "echo",
    bespoke: true,
    seenRoute: () => seenRoute,
    async generate(ctx) {
      const top = ctx.missing[0];
      seenRoute = top ? top.route : null;
      const output: GeneratedQuestion | null = top
        ? {
            status: "QUESTION_REQUIRED",
            target_fact: top.fact,
            reason_code: top.reasonCode,
            route: top.route,
            question: {
              type: "boolean",
              label: "Did you have permission to park there that day?",
            },
          }
        : null;
      return {
        output,
        providerId: "echo",
        model: "echo-model",
        promptVersion: "question-v1",
        error: output ? undefined : "no outstanding fact",
      };
    },
  };
}

describe("admin issue engine question routing", () => {
  it("hands the model the route the requirement map declares, not TRIAGE", async () => {
    setMissing([
      {
        factKey: FACT.PERMISSION_HELD,
        reasonCode: "PERMISSION_STATUS_UNRESOLVED",
        issueCode: "AUTHORISATION",
        priority: 20,
        evidenceTypes: [],
      },
    ]);
    const provider = echoingProvider();

    const out = await nextDynamicQuestion({ confirmed: CONFIRMED, provider });

    expect(provider.seenRoute()).not.toBe("TRIAGE");
    expect(["AUTHORIZATION", "PERMIT"]).toContain(provider.seenRoute());
    expect(out.status).toBe("QUESTION_REQUIRED");
  });

  it("accepts a compliant AI question instead of falling back to the bank", async () => {
    setMissing([
      {
        factKey: FACT.PERMISSION_HELD,
        reasonCode: "PERMISSION_STATUS_UNRESOLVED",
        issueCode: "AUTHORISATION",
        priority: 20,
        evidenceTypes: [],
      },
    ]);

    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      provider: echoingProvider(),
    });

    expect(out.status).toBe("QUESTION_REQUIRED");
    if (out.status === "QUESTION_REQUIRED") {
      expect(out.provenance.origin).toBe("AI");
      expect(out.provenance.rejections).toEqual([]);
      expect(out.targetFact).toBe(FACT.PERMISSION_HELD);
    }
  });

  it("does not ask where permission came from while permission is unestablished", async () => {
    setMissing([
      {
        factKey: FACT.PERMISSION_SOURCE,
        reasonCode: "PERMISSION_SOURCE_UNRESOLVED",
        issueCode: "AUTHORISATION",
        priority: 30,
        evidenceTypes: [],
      },
    ]);

    const out = await nextDynamicQuestion({
      confirmed: CONFIRMED,
      provider: echoingProvider(),
    });

    if (out.status === "QUESTION_REQUIRED") {
      expect(out.targetFact).not.toBe(FACT.PERMISSION_SOURCE);
    }
  });
});
