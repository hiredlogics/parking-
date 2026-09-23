import { BASE_RANK } from "@/lib/analysis/routes";
import { groundableFactKeys } from "./schema";
import type { GroundsJudgeProvider, JudgeGround, JudgeInput, JudgeVerdict } from "./types";

/**
 * Deterministic stand-in for the real judge.
 *
 * It is not a simulation of model behaviour and does not try to be. It
 * exists so the wiring — enforcement, route derivation, the ceiling,
 * persistence, the checklist — is exercised on every test run without a
 * network call, and so `GROUNDS_PROVIDER=mock` gives a reproducible
 * pipeline in CI.
 *
 * Its policy is deliberately boring and stated here so no test reads
 * meaning into it:
 *
 *   - every eligible module applies
 *   - confidence is derived from BASE_RANK, so ordering is stable
 *   - previously-refused modules are always rejected
 *
 * That last one means override admission is NOT covered by this
 * provider. It is covered by calling enforceJudgeVerdict with a
 * hand-built verdict, which is the honest way to test an enforcement
 * rule anyway.
 */
export class MockGroundsJudgeProvider implements GroundsJudgeProvider {
  readonly id = "mock-judge-v1";
  readonly displayName = "Mock Grounds Judge";

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const keys = groundableFactKeys(input.facts);
    const grounds: JudgeGround[] = [];

    for (const m of input.eligible) {
      const rank =
        m.routeFamily === "GOVERNANCE" ? 99 : (BASE_RANK[m.routeFamily] ?? 99);
      grounds.push({
        moduleId: m.moduleId,
        applies: true,
        // Lower BASE_RANK (stronger route) → higher confidence.
        confidence: Math.max(0.05, Math.min(0.99, 1 - rank / 100)),
        groundingFactKeys: keys.slice(0, 2),
        reasoning: `Mock judge: ${m.moduleId} is eligible for route ${m.routeFamily}.`,
      });
    }

    for (const m of input.overridable) {
      grounds.push({
        moduleId: m.moduleId,
        applies: false,
        confidence: 0,
        groundingFactKeys: [],
        reasoning:
          "Mock judge does not overturn a mechanical refusal; see MockGroundsJudgeProvider.",
      });
    }

    return {
      caseUnderstanding: `Mock judge: registered-keeper appeal, PoFA route ${input.analysis.pofa.route}, ${input.eligible.length} eligible ground(s).`,
      grounds,
      providerId: this.id,
      model: null,
    };
  }
}
