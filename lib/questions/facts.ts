import type { ConfirmedPcn } from "@/types";
import type { AnswerMap, AnswerValue, KnownFacts } from "./types";

/**
 * Material fact keys.
 *
 * Facts established by confirmed document extraction must never be
 * re-asked (MASTER Developer Pack V2 Part 4). Everything the engine
 * reasons about is addressed by one of these keys.
 */
export const FACT = {
  // --- From the notice (confirmed extraction) ---
  OPERATOR_NAME: "operator_name",
  PCN_NUMBER: "pcn_number",
  VRM: "vrm",
  PARKING_LOCATION: "parking_location",
  PARKING_EVENT_DATE: "parking_event_date",
  NOTICE_ISSUE_DATE: "notice_issue_date",
  NOTICE_RECEIVED_DATE: "notice_received_date",
  NOTICE_ROUTE: "notice_route",
  ENTRY_TIME: "entry_time",
  EXIT_TIME: "exit_time",
  TOTAL_RECORDED_DURATION: "total_recorded_duration",
  CHARGE_AMOUNT: "charge_amount",
  ALLEGED_BREACH: "alleged_breach",
  OPERATOR_ATA: "operator_ata",

  // --- Triage ---
  REGISTERED_KEEPER: "registered_keeper",
  DRIVER_IDENTIFIED: "driver_identified",
  SCENARIOS: "scenarios",

  // --- Scope gates ---
  JURISDICTION: "jurisdiction",
  VEHICLE_HIRE_STATUS: "vehicle_hire_status",

  // --- Payment / keying ---
  PAYMENT_MADE: "payment_made",
  PAYMENT_ATTEMPTED: "payment_attempted",
  PAYMENT_METHOD: "payment_method",
  PAYMENT_EVIDENCE: "payment_evidence",
  MACHINE_OR_APP_ISSUE: "machine_or_app_issue",
  VRM_ENTERED: "vrm_entered",
  KEYING_ERROR: "keying_error",

  // --- ANPR / duration ---
  CONTINUOUS_PRESENCE: "continuous_presence",
  VISIT_COUNT: "visit_count",
  VEHICLE_LEFT_SITE_EVIDENCE: "vehicle_left_site_evidence",
  TIMESTAMP_DISCREPANCY: "timestamp_discrepancy",

  // --- Consideration / grace ---
  INITIAL_PERIOD_REASON: "initial_period_reason",
  EXIT_DELAY_REASON: "exit_delay_reason",
  ARRIVAL_CONTEXT: "arrival_context",
  TERMS_READ: "terms_read",
  PARKING_ACCEPTED: "parking_accepted",
  PERMITTED_PERIOD: "permitted_period",
  DEPARTURE_DELAY: "departure_delay",
  ACTUAL_PARKING_PERIOD: "actual_parking_period",

  // --- Permit / authorisation ---
  PERMISSION_HELD: "permission_held",
  PERMISSION_SOURCE: "permission_source",
  VISITOR_AUTHORISATION: "visitor_authorisation",
  CUSTOMER_AUTHORISATION: "customer_authorisation",
  AUTHORISATION_EVIDENCE: "authorisation_evidence",

  // --- Breakdown ---
  BREAKDOWN_OCCURRED: "breakdown_occurred",
  BREAKDOWN_NATURE: "breakdown_nature",
  BREAKDOWN_PREVENTED_DEPARTURE: "breakdown_prevented_departure",
  BREAKDOWN_EVIDENCE: "breakdown_evidence",
  TIME_OF_FAILURE: "time_of_failure",
  RECOVERY_ATTENDANCE: "recovery_attendance",
  REPAIR_CARRIED_OUT: "repair_carried_out",

  // --- Residential ---
  OCCUPIER_STATUS: "occupier_status",
  AGREEMENT_UPLOADED: "agreement_uploaded",
  AGREEMENT_PERMIT_CLAUSE: "agreement_permit_clause",
  BAY_ALLOCATED: "bay_allocated",
  BAY_REFERENCE: "bay_reference",
  COMMUNAL_SPACE: "communal_space",
  THIRD_PARTY_OPERATOR_CLAUSE: "third_party_operator_clause",
  PARKING_RIGHT_EVIDENCE: "parking_right_evidence",

  // --- Signage ---
  SIGNAGE_ISSUE_BASIS: "signage_issue_basis",

  // --- Equality ---
  ADDITIONAL_TIME_NEEDED: "additional_time_needed",

  // --- Hospital ---
  HOSPITAL_ATTENDANCE: "hospital_attendance",

  // --- Activity ---
  ACTIVITY_TYPE: "activity_type",

  // --- EV / infrastructure ---
  CHARGING_SESSION: "charging_session",
  BARRIER_FAILURE: "barrier_failure",
} as const;

/** Scenario tags — describe the vehicle/event, never the driver. */
export const SCENARIO_TAGS = [
  "payment_made",
  "payment_attempted_failed",
  "vrm_error",
  "short_stay_consideration",
  "grace_or_exit",
  "anpr_disputed",
  "multiple_visits_same_day",
  "authorised_or_permit",
  "resident_parking_rights",
  "breakdown_immobilised",
  "accessibility_additional_time",
  "hospital_attendance",
  "loading_or_dropoff",
  "ev_charging",
  "barrier_or_access_failure",
  "signage_issue",
  "landowner_authority_challenge",
  "no_ntk_received",
  "postal_ntk_timing_issue",
] as const;

export type ScenarioTag = (typeof SCENARIO_TAGS)[number];

function isEstablished(v: AnswerValue | undefined): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true; // booleans and numbers, including false / 0
}

/**
 * Flatten confirmed extraction + answers into the derived fact view the
 * engine reasons about.
 *
 * Only CONFIRMED extraction is admitted — unconfirmed AI output must
 * never be treated as established fact.
 */
export function deriveKnownFacts(input: {
  confirmed?: ConfirmedPcn | null;
  answers?: AnswerMap;
  evidenceTypes?: string[];
}): KnownFacts {
  const values: Record<string, AnswerValue> = {};

  const c = input.confirmed;
  if (c) {
    const fromNotice: Array<[string, AnswerValue | undefined]> = [
      [FACT.OPERATOR_NAME, c.operator_name ?? null],
      [FACT.PCN_NUMBER, c.pcn_number ?? null],
      [FACT.VRM, c.vrm ?? null],
      [FACT.PARKING_LOCATION, c.parking_location ?? null],
      [FACT.PARKING_EVENT_DATE, c.parking_event_date ?? null],
      [FACT.NOTICE_ISSUE_DATE, c.notice_issue_date ?? null],
      [FACT.NOTICE_RECEIVED_DATE, c.notice_received_date ?? null],
      // "UNKNOWN" is not an established notice route.
      [
        FACT.NOTICE_ROUTE,
        c.notice_route && c.notice_route !== "UNKNOWN" ? c.notice_route : null,
      ],
      [FACT.ENTRY_TIME, c.entry_time ?? null],
      [FACT.EXIT_TIME, c.exit_time ?? null],
      [FACT.TOTAL_RECORDED_DURATION, c.total_recorded_duration ?? null],
      [FACT.CHARGE_AMOUNT, c.charge_amount ?? null],
      [FACT.ALLEGED_BREACH, c.alleged_breach ?? null],
    ];
    for (const [k, v] of fromNotice) {
      if (isEstablished(v)) values[k] = v as AnswerValue;
    }
  }

  // Answers override / add to notice facts.
  for (const [k, v] of Object.entries(input.answers ?? {})) {
    if (isEstablished(v)) values[k] = v;
  }

  const known = new Set(Object.keys(values));
  const rawTags = values[FACT.SCENARIOS];
  const tags = new Set<string>(Array.isArray(rawTags) ? rawTags : []);
  const evidence = new Set<string>(input.evidenceTypes ?? []);

  return { values, known, tags, evidence };
}

/** Read a fact with a typed default. */
export function factStr(f: KnownFacts, key: string): string | null {
  const v = f.values[key];
  return typeof v === "string" ? v : null;
}
export function factBool(f: KnownFacts, key: string): boolean | null {
  const v = f.values[key];
  return typeof v === "boolean" ? v : null;
}
export function factNum(f: KnownFacts, key: string): number | null {
  const v = f.values[key];
  return typeof v === "number" ? v : null;
}
