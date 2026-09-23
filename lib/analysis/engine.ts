import type { ConfirmedPcn } from "@/types";
import { deriveKnownFacts, FACT, factStr } from "@/lib/facts/facts";
import { missingMaterialFacts } from "@/lib/facts/missing";
import { detectOutOfScope } from "@/lib/facts/scope";
import { resolveCodeVersion } from "@/lib/kb/seed/codeVersions";
import type { AnswerMap, FactSource } from "@/lib/facts/types";
import { analysePofa, type PofaConfig } from "./pofa";
import { assessRoutes } from "./routes";
import { computeProhibitedClaims } from "./prohibited";
import type { IssueAnalysis, VerifiedFact } from "./types";

export const ANALYSIS_VERSION = "analysis-v1";

/**
 * Issue analysis (MASTER Developer Pack V2 Part 5).
 *
 * "After enough facts have been collected, run structured issue
 *  analysis. Do not immediately draft the appeal."
 *
 * Deterministic by design: the rules and validators are the guardrails
 * (V2 Part 14), so route identification and PoFA arithmetic happen in
 * code. The AI drafting layer consumes this output and may not add legal
 * propositions of its own.
 */

export interface AnalysisInput {
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  /** Evidence types available on the case. */
  evidenceTypes?: string[];
  /** Evidence identifiers for the audit record. */
  evidenceRefs?: string[];
  /** Content defects positively confirmed by an operator/admin. */
  confirmedContentDefects?: string[];
  /** Admin-configured PoFA thresholds; omit to use the statutory defaults. */
  pofaConfig?: Partial<PofaConfig>;
  /**
   * Provenance override for specific answer keys — e.g. a value filled
   * by lib/rules/factDefaults.ts must carry "system_default", not the
   * "answer" provenance a genuine customer answer gets. See
   * deriveKnownFacts for why this can never be inferred after the fact.
   */
  answerProvenance?: Partial<Record<string, FactSource>>;
}

/**
 * Derive the fact view for a case. Exposed so the retrieval layer can
 * apply the same `use_when` gating without recomputing from scratch.
 */
export function factsForCase(input: AnalysisInput) {
  return deriveKnownFacts({
    confirmed: input.confirmed,
    answers: input.answers,
    evidenceTypes: input.evidenceTypes,
    answerProvenance: input.answerProvenance,
  });
}

export function analyseCase(input: AnalysisInput): IssueAnalysis {
  const facts = factsForCase(input);
  const evidence = new Set(input.evidenceTypes ?? []);

  // ---- Scope first: never analyse a case we cannot automate ----
  const scope = detectOutOfScope(facts);

  // ---- PoFA checklist ----
  const pofa = analysePofa({
    facts,
    confirmedContentDefects: input.confirmedContentDefects,
    config: input.pofaConfig,
  });

  // ---- Applicable industry Code version (KB-GOV-05) ----
  const ata = factStr(facts, FACT.OPERATOR_ATA) ?? "ALL";
  const code = resolveCodeVersion(
    factStr(facts, FACT.PARKING_EVENT_DATE),
    ata,
  );

  // ---- Routes ----
  const assessments = assessRoutes({ facts, pofa, evidence });
  const primaryRoute = assessments[0]?.route ?? null;
  const secondaryRoutes = assessments.slice(1).map((a) => a.route);

  // ---- Verified facts with provenance ----
  // Provenance is carried from deriveKnownFacts, never re-guessed here —
  // a fact's origin must be recorded at the point it is set, or an
  // AI-derived or system-default value could end up indistinguishable
  // from a genuine notice fact or customer answer (see FactSource).
  const verifiedFacts: VerifiedFact[] = Object.entries(facts.values)
    .filter(([k]) => !k.startsWith("__asked:"))
    .map(([field, value]) => ({
      field,
      value,
      source: facts.provenance[field] ?? "answer",
    }));

  if (code) {
    verifiedFacts.push({
      field: "applicable_code_version",
      value: `${code.codeName} v${code.version}`,
      source: "computed",
    });
  }
  if (pofa.paragraph) {
    verifiedFacts.push({
      field: "pofa_paragraph",
      value: pofa.paragraph,
      source: "computed",
    });
  }

  // ---- Missing material facts ----
  // Derived from the route requirement map, so this reflects what the
  // case genuinely needs rather than what a fixed question list covers.
  const missing = new Set<string>(missingMaterialFacts(facts));
  for (const u of pofa.unresolved) missing.add(u);
  if (!code) missing.add("applicable_code_version");

  // ---- Prohibited claims ----
  const prohibitedClaims = computeProhibitedClaims({ facts, pofa, evidence });

  // ---- Manual review triggers (V2 §35) ----
  let manualReview: IssueAnalysis["manualReview"] = null;
  if (scope) {
    manualReview = { reason: scope.reason, detail: scope.detail };
  } else if (assessments.length === 0) {
    manualReview = {
      reason: "NO_SUPPORTED_ROUTE",
      detail:
        "No appeal route is supported by the confirmed facts. A person should review this case rather than the system generating an unsupported appeal.",
    };
  } else if (!code) {
    manualReview = {
      reason: "CODE_VERSION_UNRESOLVED",
      detail:
        "The applicable industry Code version could not be resolved from the parking event date, so Code-based grounds cannot be applied safely.",
    };
  }

  return {
    primaryRoute,
    secondaryRoutes,
    assessments,
    verifiedFacts,
    missingFacts: [...missing].sort(),
    evidenceRefs: input.evidenceRefs ?? [],
    prohibitedClaims,
    codeVersion: code ? `${code.codeName} v${code.version}` : null,
    codeVersionId: code?.id ?? null,
    pofa,
    driverStatus:
      factStr(facts, FACT.DRIVER_IDENTIFIED) === "YES"
        ? "FORMALLY_IDENTIFIED"
        : "UNIDENTIFIED",
    manualReview,
    analysisVersion: ANALYSIS_VERSION,
  };
}
