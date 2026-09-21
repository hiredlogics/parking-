/**
 * Customer answers.
 *
 * Variable names mirror the Master Developer Pack (Parts 4 and 5) as
 * closely as TypeScript allows. The rules engine (rules/rules.ts) reads
 * only these values and never contains legal reasoning of its own.
 */

export type YesNoUnsure = "YES" | "NO" | "UNSURE";

/** Core question set — Part 4. */
export type CoreAnswers = {
  /** CQ01 — registered_keeper */
  registered_keeper?: YesNoUnsure;
  /** CQ02 — driver_identified (has the driver been formally identified to the operator?) */
  driver_identified?: YesNoUnsure;
  /** CQ03 — notice_route */
  notice_route?: "POSTAL" | "WINDSCREEN" | "UNKNOWN";
  /** CQ04 — alleged_breach (operator's own words) */
  alleged_breach?: string;
  /** CQ05 — scenario tags: opens branch questions (multi-select) */
  scenarios: ScenarioTag[];
  /** CQ06 — evidence_available */
  evidence_available?: YesNoUnsure;
};

/**
 * CQ05 scenario tags. These are keeper-safe, non-driver-identifying
 * descriptions. Each opens the corresponding branch section.
 */
export type ScenarioTag =
  | "payment_made"
  | "payment_attempted_failed"
  | "vrm_error"
  | "short_stay_consideration"
  | "grace_or_exit"
  | "anpr_disputed"
  | "multiple_visits_same_day"
  | "authorised_or_permit"
  | "resident_parking_rights"
  | "breakdown_immobilised"
  | "signage_issue"
  | "landowner_authority_challenge"
  | "other_grounds"
  | "no_ntk_received"
  | "postal_ntk_timing_issue";

/** Branch answers — Part 5. Every field is optional; missing = not asked. */
export interface BranchAnswers {
  /** A. Keeper / PoFA */
  keeper?: {
    /** KQ01 mirrors CQ01. */
    registered_keeper?: YesNoUnsure;
    /** KQ02 mirrors CQ02. */
    driver_identified?: YesNoUnsure;
    /** KQ03 mirrors CQ03 (uppercase). */
    notice_route?: "POSTAL" | "WINDSCREEN" | "UNKNOWN";
    /** KQ04 */
    notice_to_keeper_received?: YesNoUnsure;
    /** KQ05a — days between parking event and notice issue */
    parking_to_issue_days?: number;
    /** KQ05b — days between issue and receipt (postal). */
    issue_to_receipt_days?: number;
    /** Flag set when the pack's postal timing failure test resolves to TRUE. */
    pofa_postal_timing_failure?: boolean;
    /** Late NTK following a windscreen notice. */
    pofa_windscreen_ntk_timing_failure?: boolean;
    /** Any specific Schedule 4 content defect confirmed. */
    pofa_content_defect?:
      | "VEHICLE_LAND_PERIOD"
      | "WARNING"
      | "CREDITOR"
      | "AMOUNT"
      | "INVITATION"
      | "NONE";
  };

  /** B. Payment */
  payment?: {
    /** PAYQ01 */
    parking_payment_made?: YesNoUnsure;
    /** PAYQ02 */
    payment_method?: "APP" | "MACHINE" | "PHONE" | "ONLINE" | "OTHER";
    /** PAYQ03 */
    payment_evidence_uploaded?: YesNoUnsure;
    /** PAYQ04 factors */
    payment_attempted?: YesNoUnsure;
    machine_problem?: YesNoUnsure;
    payment_system_problem?: YesNoUnsure;
    payment_completed?: YesNoUnsure;
  };

  /** C. Keying error */
  keying?: {
    /** KEYQ01 */
    vrm_error?: YesNoUnsure;
    /** KEYQ02 */
    vrm_error_type?: "MINOR" | "OTHER_VEHICLE" | "OTHER";
    /** KEYQ03 */
    payment_confirmed?: YesNoUnsure;
    /** Value entered on the payment record when known. */
    entered_vrm?: string;
  };

  /** D. Consideration */
  consideration?: {
    /** CONQ01 */
    short_stay?: YesNoUnsure;
    /** CONQ02 */
    consideration_reason?:
      | "READING_TERMS"
      | "FINDING_SPACE"
      | "ATTEMPTING_PAYMENT"
      | "OTHER";
    /** CONQ03 */
    terms_rejected?: YesNoUnsure;
    vehicle_left?: YesNoUnsure;
    /** CONQ04 */
    parking_took_place?: YesNoUnsure;
  };

  /** E. Grace / Exit */
  grace?: {
    /** GRQ01 */
    parking_period_completed?: YesNoUnsure;
    /** GRQ02 */
    additional_exit_time_required?: YesNoUnsure;
    exit_reason?: "RETURN_TO_VEHICLE" | "ACCESSIBILITY" | "OTHER";
    /** GRQ03 */
    exit_delay?: "CONGESTION" | "OTHER";
    /** GRQ04 */
    grace_period_applicable?: YesNoUnsure;
    alleged_overstay_minutes?: number;
    standard_10_minute_grace?: "APPLICABLE" | "NOT_APPLICABLE" | "UNKNOWN";
  };

  /** F. ANPR */
  anpr?: {
    /** ANPRQ01 */
    evidence_type?: "ANPR" | "OTHER";
    /** ANPRQ02 */
    customer_disputes_duration?: YesNoUnsure;
    /** ANPRQ03 */
    multiple_visits_same_day?: YesNoUnsure;
    /** ANPRQ04 */
    evidence_vehicle_elsewhere?: YesNoUnsure;
    /** ANPRQ05 */
    timestamp_discrepancy_detected?: YesNoUnsure;
    vrm_image_unclear?: YesNoUnsure;
    vrm_reading_disputed?: YesNoUnsure;
    /** External evidence contradicting ANPR record. */
    external_evidence_contradicts_anpr?: YesNoUnsure;
    /** Suspected pair-mismatch across multiple visits. */
    incorrect_pairing_suspected?: YesNoUnsure;
    /** Suspected missing intermediate capture. */
    missing_capture_suspected?: YesNoUnsure;
  };

  /** G. Permit / Authorisation */
  authorisation?: {
    /** AUTHQ01 */
    parking_authorised?: YesNoUnsure;
    /** AUTHQ02 */
    permit_held?: YesNoUnsure;
    permit_type?:
      | "PHYSICAL"
      | "DIGITAL"
      | "VISITOR"
      | "RESIDENT"
      | "BUSINESS"
      | "EMPLOYER"
      | "HOTEL"
      | "OTHER";
    permission_source?: string;
    parking_type?: string;
    permission_granted?: YesNoUnsure;
    visitor_permission?: YesNoUnsure;
    customer_only_location?: YesNoUnsure;
    genuine_customer?: YesNoUnsure;
    /** AUTHQ03 */
    permit_display_or_registration_issue?: YesNoUnsure;
    digital_permit_issue?: YesNoUnsure;
    visitor_registration_error?: YesNoUnsure;
    /** AUTHQ04 */
    authorisation_evidence_uploaded?: YesNoUnsure;
    customer_evidence_uploaded?: YesNoUnsure;
  };

  /** H. Signage */
  signage?: {
    /** SIGNQ01 */
    entrance_sign_visible?: YesNoUnsure;
    /** SIGNQ02 */
    sign_difficult_to_read?: YesNoUnsure;
    relevant_term_unclear?: YesNoUnsure;
    /** SIGNQ03 factors */
    parking_charge_not_prominent?: YesNoUnsure;
    dense_wording?: YesNoUnsure;
    sign_obscured?: YesNoUnsure;
    sign_damaged?: YesNoUnsure;
    poor_lighting?: YesNoUnsure;
    /** SIGNQ04 */
    conflicting_signage?: YesNoUnsure;
    /** SIGNQ05 */
    signage_photos_uploaded?: YesNoUnsure;
  };

  /** I. Landowner Authority */
  landowner?: {
    /** LANDQ01 */
    operator_landowner?: YesNoUnsure;
    /** LANDQ02 */
    landowner_contract_received?: YesNoUnsure;
    contract_location_discrepancy?: YesNoUnsure;
    contract_does_not_cover_event_date?: YesNoUnsure;
    contract_expiry_established?: YesNoUnsure;
    contract_redactions_prevent_verification?: YesNoUnsure;
    granting_party_authority_questioned?: YesNoUnsure;
  };
}

export type AllAnswers = {
  core: CoreAnswers;
  branch: BranchAnswers;
};

export const EMPTY_ANSWERS: AllAnswers = {
  core: { scenarios: [] },
  branch: {},
};
