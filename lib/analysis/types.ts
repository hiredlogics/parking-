import type { RouteFamily } from "@/types/caseState";
import type { PofaRoute } from "@/lib/kb/types";
import type { FactSource } from "@/lib/facts/types";

/**
 * Issue analysis contract.
 *
 * Source: MASTER Developer Pack V2 Part 5 (AI issue-spotting hierarchy),
 * AI Legal Knowledge Base V2 §16 and §18, Legal Authority & Source
 * Register V1 §3 (PoFA developer checklist).
 *
 * This output is INTERNAL. It must never be exposed to the customer or
 * the operator (KB §16 rule 7).
 */

export type PofaTimingStatus =
  | "COMPLIANT"
  | "FAILED"
  | "UNRESOLVED"
  | "NOT_APPLICABLE";

/**
 * Result of the Schedule 4 checklist. Nothing here may be asserted in a
 * draft unless `timingStatus === "FAILED"` or a content defect has been
 * positively confirmed — never from OCR uncertainty (KB-POFA-04).
 */
export interface PofaAnalysis {
  /** Which Schedule 4 route the notice falls under. */
  route: PofaRoute;
  /** Statutory paragraph engaged, where resolved. */
  paragraph: "8" | "9" | null;
  timingStatus: PofaTimingStatus;
  /** Deadline by which the notice had to be given, ISO date. */
  deadline: string | null;
  /** Date the notice is treated as given (deemed delivery applied). */
  noticeGivenDate: string | null;
  /** Days by which the deadline was missed, when FAILED. */
  daysLate: number | null;
  /** Whether Schedule 4 can apply at all (jurisdiction / vehicle type). */
  applicable: boolean;
  /** Human-readable reasoning for the audit record. */
  reasons: string[];
  /** Facts the analysis could not resolve. */
  unresolved: string[];
  /** Content defects positively established from the notice. */
  confirmedContentDefects: string[];
}

export interface VerifiedFact {
  field: string;
  value: unknown;
  /** Where the fact came from — see FactSource for what each origin permits. */
  source: FactSource;
}

export interface RouteAssessment {
  route: RouteFamily;
  /** Lower leads. Derived from V2 Part 5 + KB §16 + Appendix B. */
  rank: number;
  /** Why this route is in play. */
  basis: string[];
  /** Modules eligible to support it. */
  moduleIds: string[];
  /** True when supporting evidence is actually available. */
  evidenceBacked: boolean;
}

export interface IssueAnalysis {
  primaryRoute: RouteFamily | null;
  secondaryRoutes: RouteFamily[];
  /** Full ordered assessment, for admin/audit. */
  assessments: RouteAssessment[];
  verifiedFacts: VerifiedFact[];
  missingFacts: string[];
  evidenceRefs: string[];
  /** Claims the drafting layer is forbidden from making. */
  prohibitedClaims: string[];
  codeVersion: string | null;
  codeVersionId: string | null;
  pofa: PofaAnalysis;
  driverStatus: "UNIDENTIFIED" | "FORMALLY_IDENTIFIED";
  /** Set when the case must not be drafted automatically. */
  manualReview: { reason: string; detail: string } | null;
  analysisVersion: string;
}
