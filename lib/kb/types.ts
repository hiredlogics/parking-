/**
 * Controlled Legal Knowledge Base types.
 *
 * Source of truth: Private Parking Appeal Automation MASTER Developer
 * Pack V2 (Part 8), AI Legal Knowledge Base V2 (§1–19) and Legal
 * Authority & Source Register V1 (§1–17).
 *
 * Governance rules encoded here:
 *   KB-GOV-01  every module has stable ID, version, effective date
 *   KB-GOV-02  legislation/Code propositions maintained separately
 *              from drafting language
 *   KB-GOV-03  AI may combine/rewrite supported propositions but may
 *              not create a new legal proposition
 *   KB-GOV-05  applicability resolved by event date / notice route /
 *              operator ATA / transition before drafting
 *   KB-GOV-06  case law is not quoted unless separately verified AND
 *              enabled by an administrator
 */

import type { RouteFamily } from "@/types/caseState";

/** Legal Authority & Source Register §16 — source status flags. */
export type SourceStatus =
  | "BINDING_LEGISLATION"
  | "BINDING_APPELLATE_CASE"
  | "PERSUASIVE_CASE"
  | "INDUSTRY_CODE_CURRENT"
  | "INDUSTRY_CODE_HISTORIC"
  | "GOVERNMENT_PROPOSAL"
  | "WITHDRAWN"
  | "REGULATOR_GUIDANCE"
  | "OPEN_INVESTIGATION";

/**
 * Statuses that must NEVER be described as current binding law.
 * Enforced by the validator (Source Register §17).
 */
export const NON_BINDING_STATUSES: readonly SourceStatus[] = [
  "WITHDRAWN",
  "GOVERNMENT_PROPOSAL",
  "OPEN_INVESTIGATION",
] as const;

/** Legal Authority & Source Register §1 — authority hierarchy. */
export type AuthorityLevel =
  | "PRIMARY_LEGISLATION"
  | "BINDING_APPELLATE_CASE"
  | "PERSUASIVE_AUTHORITY"
  | "INDUSTRY_CODE"
  | "GOVERNMENT_CONSULTATION"
  | "REGULATOR_GUIDANCE";

export type Jurisdiction =
  | "ENGLAND_WALES"
  | "SCOTLAND"
  | "UK"
  | "NOT_APPLICABLE";

export interface LegalSource {
  sourceId: string;
  title: string;
  jurisdiction: Jurisdiction;
  authorityLevel: AuthorityLevel;
  status: SourceStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  sourceReference: string | null;
  sourceUrl: string | null;
  lastReviewedAt: string | null;
  /**
   * KB-GOV-06 — direct quotation is disabled unless an administrator
   * has verified the authority and explicitly enabled it.
   */
  quotationEnabled: boolean;
  notes: string | null;
}

/** Industry Code version record — Source Register §4. */
export interface CodeVersion {
  id: string;
  codeName: string;
  version: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  /** e.g. "TRANSITION", "CURRENT", "HISTORIC" */
  transitionStatus: string;
  /** Which ATA the version applies to: BPA, IPC, ALL. */
  ataApplicability: string;
  publishedAt: string | null;
  sourceUrl: string | null;
  notes: string | null;
}

export type KbModuleStatus = "ACTIVE" | "REVIEW" | "DISABLED";

/**
 * A controlled knowledge module. These are NOT paragraphs to paste —
 * the AI uses them to identify issues, ask targeted questions and draft
 * from verified case facts.
 */
export interface KbModule {
  moduleId: string;
  topic: string;
  routeFamily: RouteFamily | "GOVERNANCE";
  /** Facts required before the module may be relied upon. */
  useWhen: string[];
  /** Exclusions / incompatible facts. */
  doNotUseWhen: string[];
  legalBasis: string | null;
  coreProposition: string;
  /** "AI MUST CHECK"列 from the KB tables. */
  aiMustCheck: string[];
  evidenceNeeded: string[];
  draftingNotes: string | null;
  version: number;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: KbModuleStatus;
  sourceIds: string[];
  /** Drafting blocks this module is permitted to draw on. */
  blockIds: string[];
  lastLegalReview: string | null;
  changeNotes: string | null;
}

export type DraftingBlockStatus = "ACTIVE" | "REVIEW" | "DISABLED";

/**
 * Appendix A drafting building block. Controlled wording the AI may
 * paraphrase, merge and reorder — never concatenate mechanically, and
 * only when the owning module's prerequisites are satisfied.
 */
export interface DraftingBlock {
  blockId: string;
  title: string;
  routeFamily: RouteFamily | "INTRO" | "CLOSING";
  text: string;
  /** Template variables present in the text, e.g. {{vrm}}. */
  variables: string[];
  status: DraftingBlockStatus;
  version: number;
  /** True when listed in V2 Appendix A; false = inherited V1 only. */
  inV2Appendix: boolean;
  usageNotes: string | null;
}

/**
 * KB §18 — recommended internal retrieval output produced before
 * drafting. Never exposed to the customer.
 */
export type PofaRoute =
  | "POSTAL"
  | "WINDSCREEN"
  | "NOT_APPLICABLE"
  | "UNRESOLVED";

export interface RetrievalOutput {
  primaryRoute: RouteFamily | null;
  secondaryRoutes: RouteFamily[];
  moduleIds: string[];
  verifiedFacts: { field: string; value: unknown; sourceRef: string }[];
  missingFacts: string[];
  evidenceRefs: string[];
  prohibitedClaims: string[];
  codeVersion: string | null;
  pofaRoute: PofaRoute;
  driverStatus: "UNIDENTIFIED" | "FORMALLY_IDENTIFIED";
}

/**
 * Validator identifiers.
 *
 * VAL-DRIVER..VAL-CONFLICT are the eleven mandatory validators from AI
 * Legal Knowledge Base V2 §17. VAL-REPETITION covers the "Repetition"
 * check that MASTER Developer Pack V2 Part 10 requires but which has no
 * corresponding KB §17 code ("Same point repeated under multiple
 * grounds").
 */
export type ValidatorCode =
  | "VAL-DRIVER"
  | "VAL-FACT"
  | "VAL-EVIDENCE"
  | "VAL-POFA"
  | "VAL-CODE"
  | "VAL-RES"
  | "VAL-BREAK"
  | "VAL-EQ"
  | "VAL-ANPR"
  | "VAL-STAGE"
  | "VAL-CONFLICT"
  | "VAL-REPETITION"
  | "VAL-UNSUPPORTED";

export const ALL_VALIDATOR_CODES: readonly ValidatorCode[] = [
  "VAL-DRIVER",
  "VAL-FACT",
  "VAL-EVIDENCE",
  "VAL-POFA",
  "VAL-CODE",
  "VAL-RES",
  "VAL-BREAK",
  "VAL-EQ",
  "VAL-ANPR",
  "VAL-STAGE",
  "VAL-CONFLICT",
  "VAL-REPETITION",
  "VAL-UNSUPPORTED",
] as const;

export type ValidationSeverity = "BLOCKING" | "WARNING";

export interface ValidationIssue {
  code: ValidatorCode;
  severity: ValidationSeverity;
  message: string;
  excerpt?: string;
}

export interface ValidationResult {
  status: "PASS" | "FAIL";
  issues: ValidationIssue[];
  validatorVersion: string;
}

/**
 * KB §16 — drafting priority order. Lower number = drafted earlier.
 * 1 dispositive keeper-liability / contractual-rights point
 * 2 strongest fact-specific ground
 * 3 Code / evidence / signage issues
 * 4 landowner authority (concise at initial stage)
 */
export const DRAFTING_PRIORITY: Record<RouteFamily, number> = {
  POFA: 1,
  RESIDENTIAL: 1,
  PAYMENT: 2,
  KEYING: 2,
  BREAKDOWN: 2,
  ANPR: 2,
  AUTHORIZATION: 2,
  PERMIT: 2,
  EQUALITY: 2,
  HOSPITAL: 2,
  LOADING: 2,
  DROP_OFF: 2,
  EV_CHARGING: 2,
  INFRASTRUCTURE: 2,
  CONSIDERATION: 3,
  GRACE: 3,
  SIGNAGE: 3,
  LANDOWNER: 4,
};
