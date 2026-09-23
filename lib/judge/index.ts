import type { KbModule } from "@/lib/kb/types";
import type { KnownFacts } from "@/lib/facts/types";
import type { IssueAnalysis } from "@/lib/analysis/types";
import {
  JUDGE_OVERRIDABLE_CODES,
  type RetrievalResult,
} from "@/lib/retrieval/engine";
import { MockGroundsJudgeProvider } from "./mockProvider";
import { OpenAIGroundsJudgeProvider } from "./openaiProvider";
import { enforceJudgeVerdict, judgeFailureDecision } from "./select";
import type {
  GroundsJudgeProvider,
  JudgeDecision,
  JudgeInput,
} from "./types";

export type GroundsMode = "deterministic" | "llm" | "shadow";

/**
 * Which grounds authority is in force.
 *
 *   deterministic  the judge does not run. Retrieval's eligible set is
 *                  the letter's content, exactly as before.
 *   shadow         the judge runs and its decision is recorded, but the
 *                  deterministic result is what gets drafted. This is
 *                  how agreement is measured before handing over.
 *   llm            the judge's selection is what gets drafted.
 *
 * Follows the EXTRACTION_PROVIDER / DRAFTING_PROVIDER convention
 * already in the codebase. This is not feature-flag debt: two
 * implementations both need permanent coverage, and rollback is one env
 * var rather than a deploy.
 */
export function groundsMode(): GroundsMode {
  const raw = (process.env.GROUNDS_PROVIDER ?? "").toLowerCase();
  if (raw === "llm") return "llm";
  if (raw === "shadow") return "shadow";
  return "deterministic";
}

let cached: GroundsJudgeProvider | null = null;

/**
 * Judge factory.
 *
 *   GROUNDS_JUDGE=mock → mock (tests, CI)
 *   otherwise          → OpenAI, if a key is configured
 *
 * With no API key this returns null and the caller stays on the
 * deterministic path. There is no weaker fallback on purpose: a
 * half-working judge that silently selects nothing is the failure mode
 * this whole phase exists to prevent.
 */
export function getGroundsJudgeProvider(): GroundsJudgeProvider | null {
  const explicit = (process.env.GROUNDS_JUDGE ?? "").toLowerCase();
  if (explicit === "off" || explicit === "none") return null;
  if (cached) return cached;

  if (explicit === "mock") {
    cached = new MockGroundsJudgeProvider();
    return cached;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }

  cached = new OpenAIGroundsJudgeProvider({ apiKey });
  return cached;
}

/** Reset the cached provider — for tests that swap env vars. */
export function resetGroundsJudgeProvider(): void {
  cached = null;
}

/**
 * Split retrieval's trace into the judge's two candidate pools.
 *
 * `overridable` is the interesting one: modules the fact gate or the
 * route filter refused, both of which are computed from the same
 * answer-starved facts the judge exists to compensate for. Everything
 * else retrieval refused stays refused and is never offered.
 */
export function judgeCandidates(input: {
  retrieval: RetrievalResult;
  allModules: KbModule[];
}): { eligible: KbModule[]; overridable: KbModule[] } {
  const byId = new Map(input.allModules.map((m) => [m.moduleId, m]));
  const overridableCodes = new Set<string>(JUDGE_OVERRIDABLE_CODES);
  const eligibleIds = new Set(input.retrieval.modules.map((m) => m.moduleId));

  const overridable: KbModule[] = [];
  for (const t of input.retrieval.trace) {
    if (t.eligible || eligibleIds.has(t.moduleId)) continue;
    if (!overridableCodes.has(t.code)) continue;
    const m = byId.get(t.moduleId);
    // A governance module is a system rule, never drafting context.
    if (!m || m.routeFamily === "GOVERNANCE") continue;
    overridable.push(m);
  }

  return { eligible: input.retrieval.modules, overridable };
}

export interface JudgeGroundsInput {
  analysis: IssueAnalysis;
  facts: KnownFacts;
  retrieval: RetrievalResult;
  /** The full catalog retrieval was run against. */
  allModules: KbModule[];
  caseId?: string | null;
  /** Override the provider — tests and the shadow comparator. */
  provider?: GroundsJudgeProvider | null;
}

/**
 * Run the judge and enforce its verdict.
 *
 * Returns null only when no judge is configured at all, which the caller
 * must read as "stay deterministic". Every other outcome — including
 * every failure — returns a decision, because a recorded failure is
 * auditable and an absent one is not.
 */
export async function judgeGrounds(
  input: JudgeGroundsInput,
): Promise<JudgeDecision | null> {
  const provider =
    input.provider !== undefined ? input.provider : getGroundsJudgeProvider();
  if (!provider) return null;

  const { eligible, overridable } = judgeCandidates({
    retrieval: input.retrieval,
    allModules: input.allModules,
  });

  const judgeInput: JudgeInput = {
    analysis: input.analysis,
    facts: input.facts,
    eligible,
    overridable,
    trace: input.retrieval.trace,
    caseId: input.caseId ?? null,
  };

  let verdict;
  try {
    verdict = await provider.judge(judgeInput);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A parse/shape problem is a different operational signal from the
    // network being down, and the two get different labels so a spike in
    // either is diagnosable without reading letters.
    const schemaish =
      /json|schema|empty response|grounds array/i.test(message);
    return judgeFailureDecision({
      failure: schemaish ? "JUDGE_SCHEMA_INVALID" : "JUDGE_TRANSPORT_FAILED",
      providerId: provider.id,
      detail: message,
    });
  }

  return enforceJudgeVerdict({
    verdict,
    facts: input.facts,
    eligible,
    allModules: input.allModules,
    trace: input.retrieval.trace,
  });
}

export { enforceJudgeVerdict, judgeFailureDecision } from "./select";
export { MockGroundsJudgeProvider } from "./mockProvider";
export * from "./types";
