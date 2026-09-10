import type { RouteFamily } from "@/types/caseState";

/**
 * Structured sufficiency result.
 *
 * Question count NEVER appears here, and nothing in the live path reads
 * one. Readiness means the material factual uncertainty for the
 * strongest viable route has been resolved — which may take one
 * question or seven.
 *
 * The four statuses are distinct on purpose. NO_VIABLE_ROUTE in
 * particular must never collapse into SUFFICIENT_INFORMATION: "nothing
 * left to ask" and "something to argue" are different claims.
 */
export type SufficiencyStatusCode =
  | "QUESTION_REQUIRED"
  | "SUFFICIENT_INFORMATION"
  | "MANUAL_REVIEW"
  | "NO_VIABLE_ROUTE";

export type EvidenceStatus =
  | "NONE_REQUIRED"
  | "NONE_PROVIDED"
  | "PARTIAL"
  | "SUFFICIENT";

export interface SufficiencyReport {
  status: SufficiencyStatusCode;
  primary_route: RouteFamily | null;
  secondary_routes: RouteFamily[];
  /** Facts that would materially change the analysis. Block progress. */
  unresolved_material_facts: string[];
  /** Useful supporting detail. Must NOT block progress. */
  unresolved_optional_facts: string[];
  evidence_status: EvidenceStatus;
  ready_for_next_stage: boolean;
  /** Customer-safe explanation when not ready. Never internal wording. */
  detail: string | null;
}

/**
 * Facts that are supporting detail rather than decisive.
 *
 * Mirrors the OPTIONAL_DETAIL set the gain scorer uses, so a fact
 * cannot be "optional" for ranking but "material" for readiness.
 */
export const OPTIONAL_FACTS = new Set<string>([
  "bay_reference",
  "payment_method",
  "breakdown_nature",
  "time_of_failure",
  "repair_carried_out",
  "visit_count",
  "actual_parking_period",
  "agreement_permit_clause",
]);

export function splitMaterialFacts(facts: string[]): {
  material: string[];
  optional: string[];
} {
  const material: string[] = [];
  const optional: string[] = [];
  for (const f of facts) {
    (OPTIONAL_FACTS.has(f) ? optional : material).push(f);
  }
  return { material, optional };
}

export function evidenceStatusFor(input: {
  uploadedCount: number;
  suggestionCount: number;
  routesNeedingEvidence: number;
}): EvidenceStatus {
  if (input.routesNeedingEvidence === 0 && input.suggestionCount === 0) {
    return input.uploadedCount > 0 ? "SUFFICIENT" : "NONE_REQUIRED";
  }
  if (input.uploadedCount === 0) return "NONE_PROVIDED";
  return input.suggestionCount > 0 ? "PARTIAL" : "SUFFICIENT";
}

export function emptyReport(
  status: SufficiencyStatusCode,
  detail: string | null = null,
): SufficiencyReport {
  return {
    status,
    primary_route: null,
    secondary_routes: [],
    unresolved_material_facts: [],
    unresolved_optional_facts: [],
    evidence_status: "NONE_PROVIDED",
    ready_for_next_stage: false,
    detail,
  };
}
