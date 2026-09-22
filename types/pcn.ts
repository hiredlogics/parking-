/**
 * PCN Data Variables per Master Developer Pack, Part 3.
 * Values here are populated by extraction and confirmed by the customer
 * before they may be used in the deterministic rules engine.
 */

/** Notice route vocabulary — uppercase per pack. */
export type NoticeRoute = "POSTAL" | "WINDSCREEN" | "UNKNOWN";

export type CaseStage = "INITIAL_OPERATOR_APPEAL";

/** Raw extraction output from a DocumentExtractionProvider. */
export interface ExtractedPcn {
  operator_name?: string;
  pcn_number?: string;
  vrm?: string;
  /** Vehicle make (e.g. Ford, VW). Optional — only some notices print this. */
  vehicle_make?: string;
  parking_location?: string;
  /** ISO date (YYYY-MM-DD) */
  parking_event_date?: string;
  /** ISO date (YYYY-MM-DD) */
  notice_issue_date?: string;
  /** ISO date (YYYY-MM-DD) — where known */
  notice_received_date?: string;
  notice_route?: NoticeRoute;
  /** ANPR entry time (ISO or HH:MM) if present on the notice. */
  entry_time?: string;
  /** ANPR exit time (ISO or HH:MM) if present on the notice. */
  exit_time?: string;
  /** Calculated site duration in minutes. */
  total_recorded_duration?: number;
  /** PCN amount in pounds. */
  charge_amount?: number;
  /** Operator's stated reason for the charge / contravention. */
  alleged_breach?: string;
  /** Fixed for this build. */
  case_stage?: CaseStage;
}

export type ExtractionConfidence = Partial<Record<keyof ExtractedPcn, number>>;

export interface ExtractionResult {
  raw: ExtractedPcn;
  confidence: ExtractionConfidence;
  providerId: string;
  extractedAt: string;
  warnings: string[];
  /**
   * Document triage — type, stage, sender vs operator, service suitability.
   * Set after extraction. When WRONG_STAGE_REDIRECT, the appeal journey
   * must stop before questioning/payment.
   */
  triage?: import("./triage").DocumentTriageResult;
}

export interface ConfirmedPcn extends ExtractedPcn {
  confirmedAt: string;
}
