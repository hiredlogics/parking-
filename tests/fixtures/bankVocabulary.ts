/**
 * The question bank's fact vocabulary, frozen.
 *
 * `lib/questions/bank.ts` was the only statement of what values a fact
 * accepts, via `answerContract.canonicalValuesFor`. The vocabulary was
 * extracted into `lib/facts/registry.ts` and the bank was then deleted
 * with the rest of the question engine.
 *
 * This file is a mechanical dump of what the bank said, taken from the
 * last commit in which it existed, so that "the registry still matches
 * the vocabulary the lawyers signed off on" stays an assertion rather
 * than a claim about a file nobody can read any more. It is DATA, not a
 * source of truth: a deliberate change to the registry's vocabulary
 * updates this fixture in the same commit, with the reason in the
 * message.
 *
 * `values: null` means the bank imposed no fixed vocabulary on that
 * fact (free text, a date, an amount).
 *
 * Generated from lib/questions/bank.ts @ ddceb6c.
 */

export interface FrozenVocabEntry {
  values: string[] | null;
  enumerated: boolean;
}

export const FROZEN_BANK_VOCABULARY: Readonly<
  Record<string, FrozenVocabEntry>
> = {
  "activity_type": {
    "enumerated": true,
    "values": [
      "collection",
      "dropoff",
      "loading",
      "other"
    ]
  },
  "actual_parking_period": {
    "enumerated": false,
    "values": null
  },
  "additional_time_needed": {
    "enumerated": false,
    "values": null
  },
  "agreement_permit_clause": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "agreement_uploaded": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "alleged_breach": {
    "enumerated": false,
    "values": null
  },
  "anpr_dispute_detail": {
    "enumerated": false,
    "values": null
  },
  "anpr_images_on_notice": {
    "enumerated": true,
    "values": [
      "ANPR",
      "OTHER",
      "UNSURE"
    ]
  },
  "arrival_context": {
    "enumerated": false,
    "values": null
  },
  "authorisation_evidence": {
    "enumerated": false,
    "values": null
  },
  "barrier_failure": {
    "enumerated": false,
    "values": null
  },
  "bay_allocated": {
    "enumerated": false,
    "values": null
  },
  "bay_reference": {
    "enumerated": false,
    "values": null
  },
  "breakdown_evidence": {
    "enumerated": true,
    "values": [
      "call_logs",
      "garage_invoice",
      "none",
      "photos",
      "recovery_report",
      "roadside_record"
    ]
  },
  "breakdown_nature": {
    "enumerated": true,
    "values": [
      "collision_damage",
      "flat_battery",
      "mechanical_failure",
      "other",
      "puncture"
    ]
  },
  "breakdown_occurred": {
    "enumerated": false,
    "values": null
  },
  "breakdown_prevented_departure": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "charge_amount": {
    "enumerated": false,
    "values": null
  },
  "charging_session": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "communal_space": {
    "enumerated": false,
    "values": null
  },
  "continuous_presence": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "customer_authorisation": {
    "enumerated": false,
    "values": null
  },
  "departure_delay": {
    "enumerated": false,
    "values": null
  },
  "driver_identified": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "entry_time": {
    "enumerated": false,
    "values": null
  },
  "exit_delay_reason": {
    "enumerated": false,
    "values": null
  },
  "exit_time": {
    "enumerated": false,
    "values": null
  },
  "hospital_attendance": {
    "enumerated": true,
    "values": [
      "appointment",
      "emergency",
      "other",
      "visiting"
    ]
  },
  "initial_period_reason": {
    "enumerated": false,
    "values": null
  },
  "jurisdiction": {
    "enumerated": true,
    "values": [
      "ENGLAND_WALES",
      "NORTHERN_IRELAND",
      "SCOTLAND",
      "UNSURE"
    ]
  },
  "keying_error": {
    "enumerated": false,
    "values": null
  },
  "machine_or_app_issue": {
    "enumerated": false,
    "values": null
  },
  "notice_issue_date": {
    "enumerated": false,
    "values": null
  },
  "notice_received_date": {
    "enumerated": false,
    "values": null
  },
  "notice_route": {
    "enumerated": true,
    "values": [
      "POSTAL",
      "UNKNOWN",
      "WINDSCREEN"
    ]
  },
  "occupier_status": {
    "enumerated": true,
    "values": [
      "leaseholder",
      "other",
      "owner_occupier",
      "tenant",
      "visitor"
    ]
  },
  "operator_ata": {
    "enumerated": false,
    "values": null
  },
  "operator_name": {
    "enumerated": false,
    "values": null
  },
  "parking_accepted": {
    "enumerated": false,
    "values": null
  },
  "parking_event_date": {
    "enumerated": false,
    "values": null
  },
  "parking_location": {
    "enumerated": false,
    "values": null
  },
  "parking_right_evidence": {
    "enumerated": false,
    "values": null
  },
  "payment_attempted": {
    "enumerated": false,
    "values": null
  },
  "payment_evidence": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "payment_made": {
    "enumerated": true,
    "values": [
      "ATTEMPTED_FAILED",
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "payment_method": {
    "enumerated": true,
    "values": [
      "app",
      "machine",
      "online",
      "other",
      "phone"
    ]
  },
  "pcn_number": {
    "enumerated": false,
    "values": null
  },
  "permission_held": {
    "enumerated": false,
    "values": null
  },
  "permission_source": {
    "enumerated": true,
    "values": [
      "employer",
      "hotel_or_business",
      "landowner",
      "other",
      "resident_permit",
      "visitor_permit"
    ]
  },
  "permitted_period": {
    "enumerated": false,
    "values": null
  },
  "recovery_attendance": {
    "enumerated": false,
    "values": null
  },
  "registered_keeper": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "repair_carried_out": {
    "enumerated": false,
    "values": null
  },
  "scenarios": {
    "enumerated": true,
    "values": [
      "authorised_or_permit",
      "breakdown_immobilised",
      "grace_or_exit",
      "other_grounds",
      "payment_made",
      "resident_parking_rights",
      "signage_issue",
      "vrm_error"
    ]
  },
  "signage_issue_basis": {
    "enumerated": true,
    "values": [
      "charge_not_prominent",
      "conflicting_signs",
      "no_entrance_sign",
      "obscured_or_damaged",
      "term_not_prominent"
    ]
  },
  "terms_read": {
    "enumerated": false,
    "values": null
  },
  "third_party_operator_clause": {
    "enumerated": false,
    "values": null
  },
  "time_of_failure": {
    "enumerated": false,
    "values": null
  },
  "timestamp_discrepancy": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "total_recorded_duration": {
    "enumerated": false,
    "values": null
  },
  "vehicle_hire_status": {
    "enumerated": true,
    "values": [
      "COMPANY",
      "HIRE",
      "LEASE",
      "PRIVATE",
      "UNSURE"
    ]
  },
  "vehicle_left_site_evidence": {
    "enumerated": true,
    "values": [
      "NO",
      "UNSURE",
      "YES"
    ]
  },
  "visit_count": {
    "enumerated": false,
    "values": null
  },
  "visitor_authorisation": {
    "enumerated": false,
    "values": null
  },
  "vrm": {
    "enumerated": false,
    "values": null
  },
  "vrm_entered": {
    "enumerated": false,
    "values": null
  }
} as const;
