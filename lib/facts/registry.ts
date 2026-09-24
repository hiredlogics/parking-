/**
 * The fact vocabulary: what each material fact is allowed to be set to.
 *
 * This is the machine-readable answer contract, extracted mechanically
 * from the question bank rather than retyped, and it exists so the
 * vocabulary outlives the question engine. Before this file, the only
 * statement of "what values does `occupier_status` accept" was the
 * options list of the bank question that happened to ask it — so
 * deleting the bank would have stranded every consumer that validates a
 * fact value, and no AI fact producer could be constrained to the real
 * value space.
 *
 * Mirrored into `case_facts_registry` by the admin config seed, and read
 * live via lib/config/factRegistry.ts, which falls back to this constant
 * when there is no database. Code is the floor; admin rows may widen a
 * vocabulary but the floor is always available.
 *
 * ONE DELIBERATE WIDENING: `scenarios` carries all 20 tags from
 * SCENARIO_TAGS, not the 8 the bank offered as options. The other 12
 * are keyed on by live module gates in lib/retrieval/gates.ts and by
 * bank `askWhen` predicates, but were never selectable by a customer —
 * so those modules and follow-up questions were unreachable through the
 * journey. Narrowing the registry to the bank's options would have
 * frozen that gap in place.
 */

export type FactValueType =
  | "STRING"
  | "ENUM"
  | "MULTI_ENUM"
  | "BOOLEAN"
  | "NUMBER"
  | "DATE"
  | "TIME";

/** Where a value for this fact is expected to come from. */
export type FactRegistrySource = "NOTICE" | "ANSWER" | "DOCUMENT" | "COMPUTED";

export interface FactRegistryEntry {
  factKey: string;
  label: string;
  valueType: FactValueType;
  /** Empty when the fact is free-form: a registration mark, a date, a count. */
  allowedValues: readonly string[];
  /**
   * Why the fact is material, taken from the route requirement map.
   * Guidance for whoever or whatever asks — never the wording itself.
   */
  guidance: string | null;
  source: FactRegistrySource;
}

export const FACT_REGISTRY: readonly FactRegistryEntry[] = [
  {
    factKey: "operator_name",
    label: "Operator name",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "pcn_number",
    label: "Pcn number",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "vrm",
    label: "Vrm",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "parking_location",
    label: "Parking location",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "parking_event_date",
    label: "Parking event date",
    valueType: "DATE",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "notice_issue_date",
    label: "Notice issue date",
    valueType: "DATE",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "notice_received_date",
    label: "Notice received date",
    valueType: "DATE",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "notice_route",
    label: "Notice route",
    valueType: "ENUM",
    allowedValues: [
      "POSTAL",
      "UNKNOWN",
      "WINDSCREEN",
    ],
    guidance:
      "Postal and windscreen notices are governed by different Schedule 4 paragraphs and different timing limits.",
    source: "NOTICE",
  },
  {
    factKey: "entry_time",
    label: "Entry time",
    valueType: "TIME",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "exit_time",
    label: "Exit time",
    valueType: "TIME",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "total_recorded_duration",
    label: "Total recorded duration",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "charge_amount",
    label: "Charge amount",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "alleged_breach",
    label: "Alleged breach",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "operator_ata",
    label: "Operator ata",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "NOTICE",
  },
  {
    factKey: "registered_keeper",
    label: "Registered keeper",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "The whole appeal is written on behalf of the registered keeper, so this must be settled before anything else.",
    source: "ANSWER",
  },
  {
    factKey: "driver_identified",
    label: "Driver identified",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "Whether the driver's details have ALREADY been formally provided to the operator decides if the keeper-liability route survives. This concerns a past notification event only — never who was driving.",
    source: "ANSWER",
  },
  {
    factKey: "scenarios",
    label: "Scenarios",
    valueType: "MULTI_ENUM",
    allowedValues: [
      "accessibility_additional_time",
      "anpr_disputed",
      "authorised_or_permit",
      "barrier_or_access_failure",
      "breakdown_immobilised",
      "ev_charging",
      "grace_or_exit",
      "hospital_attendance",
      "landowner_authority_challenge",
      "loading_or_dropoff",
      "multiple_visits_same_day",
      "no_ntk_received",
      "other_grounds",
      "payment_attempted_failed",
      "payment_made",
      "postal_ntk_timing_issue",
      "resident_parking_rights",
      "short_stay_consideration",
      "signage_issue",
      "vrm_error",
    ],
    guidance:
      "Nothing on the notice explains why the charge is disputed. Until something is known about what actually happened, no substantive route can be opened.",
    source: "ANSWER",
  },
  {
    factKey: "jurisdiction",
    label: "Jurisdiction",
    valueType: "ENUM",
    allowedValues: [
      "ENGLAND_WALES",
      "NORTHERN_IRELAND",
      "SCOTLAND",
      "UNSURE",
    ],
    guidance:
      "Schedule 4 keeper liability applies in England and Wales only, so the jurisdiction decides whether the automated route is available at all.",
    source: "ANSWER",
  },
  {
    factKey: "vehicle_hire_status",
    label: "Vehicle hire status",
    valueType: "ENUM",
    allowedValues: [
      "COMPANY",
      "HIRE",
      "LEASE",
      "PRIVATE",
      "UNSURE",
    ],
    guidance:
      "Hire, lease and company vehicles follow a different statutory route that is not automated.",
    source: "ANSWER",
  },
  {
    factKey: "hire_documents_received",
    label: "Hire documents with the notice",
    valueType: "ENUM",
    allowedValues: ["NO", "UNSURE", "YES"],
    guidance:
      "For a hire vehicle, Schedule 4 requires certain documents (for example the hire agreement and statement of liability) to accompany the notice. Tell us whether those documents were received with the notice — do not try to interpret the statute yourself.",
    source: "ANSWER",
  },
  {
    factKey: "notice_reverse_present",
    label: "Notice reverse / back page",
    valueType: "ENUM",
    allowedValues: ["NO", "UNSURE", "YES"],
    guidance:
      "Many Notices to Keeper carry mandatory wording on the reverse. Upload the back of the notice if you have not already.",
    source: "ANSWER",
  },
  {
    factKey: "pofa_content_defects",
    label: "Confirmed PoFA content defects",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "payment_made",
    label: "Payment made",
    valueType: "ENUM",
    allowedValues: [
      "ATTEMPTED_FAILED",
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "Whether a payment was made, a voucher/receipt was validated at the kiosk, or an attempt failed decides which payment modules apply.",
    source: "ANSWER",
  },
  {
    factKey: "payment_attempted",
    label: "Payment attempted",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "payment_method",
    label: "Payment method",
    valueType: "ENUM",
    allowedValues: [
      "app",
      "machine",
      "online",
      "other",
      "phone",
    ],
    guidance:
      "The method separates machine failure from app or online failure, which are different modules with different wording.",
    source: "ANSWER",
  },
  {
    factKey: "payment_evidence",
    label: "Payment evidence",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "A payment assertion may only be made where the keeper can actually produce a record of it.",
    source: "ANSWER",
  },
  {
    factKey: "machine_or_app_issue",
    label: "Machine or app issue",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "vrm_entered",
    label: "Vrm entered",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "The keying-error module needs the registration actually entered, so the operator can match the transaction.",
    source: "ANSWER",
  },
  {
    factKey: "keying_error",
    label: "Keying error",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "continuous_presence",
    label: "Continuous presence on site",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "ANPR cameras record a first entry and last exit. Tell us whether the vehicle was there continuously the whole time, or left and came back (including pick-up/drop-off or separate visits). We only use what you tell us — we do not assume a double visit.",
    source: "ANSWER",
  },
  {
    factKey: "visit_count",
    label: "Visit count",
    valueType: "NUMBER",
    allowedValues: [],
    guidance:
      "The number of separate visits is needed to show the charge treats two stays as one.",
    source: "ANSWER",
  },
  {
    factKey: "vehicle_left_site_evidence",
    label: "Vehicle left site evidence",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "Independent evidence that the vehicle left the site supports a double-visit or incorrect pairing challenge.",
    source: "ANSWER",
  },
  {
    factKey: "timestamp_discrepancy",
    label: "Timestamp discrepancy",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "A timestamp or pairing error on the notice must be confirmed before it is argued.",
    source: "ANSWER",
  },
  {
    factKey: "anpr_images_on_notice",
    label: "Anpr images on notice",
    valueType: "ENUM",
    allowedValues: [
      "ANPR",
      "OTHER",
      "UNSURE",
    ],
    guidance:
      "Whether the notice relies on entry/exit camera images frames how the duration challenge is put.",
    source: "ANSWER",
  },
  {
    factKey: "anpr_dispute_detail",
    label: "Anpr dispute detail",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "A short description of what is wrong with the times or images keeps the appeal specific.",
    source: "ANSWER",
  },
  {
    factKey: "initial_period_reason",
    label: "Initial period reason",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "The consideration period covers time spent deciding whether to accept the terms, so what happened on arrival is material.",
    source: "ANSWER",
  },
  {
    factKey: "exit_delay_reason",
    label: "Exit delay reason",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "The grace period covers a reasonable delay leaving after the parking ends, so the cause of the delay is material.",
    source: "ANSWER",
  },
  {
    factKey: "arrival_context",
    label: "Arrival context",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "terms_read",
    label: "Terms read",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "parking_accepted",
    label: "Parking accepted",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "permitted_period",
    label: "Permitted period",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "departure_delay",
    label: "Departure delay",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "actual_parking_period",
    label: "Actual parking period",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "permission_held",
    label: "Permit or parking authorisation",
    valueType: "ENUM",
    allowedValues: ["NO", "UNSURE", "YES"],
    guidance:
      "The notice says there was no permit. Tell us whether the vehicle or driver had any permit, parking entitlement, hospital/visitor pass, or other authorisation for that site — we work out the legal ground from your answer.",
    source: "ANSWER",
  },
  {
    factKey: "permission_source",
    label: "Permission source",
    valueType: "ENUM",
    allowedValues: [
      "employer",
      "hotel_or_business",
      "landowner",
      "other",
      "resident_permit",
      "visitor_permit",
    ],
    guidance:
      "Who granted permission determines whether it binds the operator.",
    source: "ANSWER",
  },
  {
    factKey: "visitor_authorisation",
    label: "Visitor authorisation",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "customer_authorisation",
    label: "Customer authorisation",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "authorisation_evidence",
    label: "Authorisation evidence",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "breakdown_occurred",
    label: "Breakdown occurred",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "breakdown_nature",
    label: "Breakdown nature",
    valueType: "ENUM",
    allowedValues: [
      "collision_damage",
      "flat_battery",
      "mechanical_failure",
      "other",
      "puncture",
    ],
    guidance:
      "The nature of the failure determines which breakdown module applies and what the appeal may assert.",
    source: "ANSWER",
  },
  {
    factKey: "breakdown_prevented_departure",
    label: "Breakdown prevented departure",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "A genuine inability to move the vehicle is treated very differently from ordinary delay, so this is the load-bearing fact for the route.",
    source: "ANSWER",
  },
  {
    factKey: "breakdown_evidence",
    label: "Breakdown evidence",
    valueType: "MULTI_ENUM",
    allowedValues: [
      "call_logs",
      "garage_invoice",
      "none",
      "photos",
      "recovery_report",
      "roadside_record",
    ],
    guidance:
      "The breakdown modules require supporting evidence; without it the ground cannot be asserted.",
    source: "ANSWER",
  },
  {
    factKey: "time_of_failure",
    label: "Time of failure",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "recovery_attendance",
    label: "Recovery attendance",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "repair_carried_out",
    label: "Repair carried out",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "occupier_status",
    label: "Occupier status",
    valueType: "ENUM",
    allowedValues: [
      "leaseholder",
      "other",
      "owner_occupier",
      "tenant",
      "visitor",
    ],
    guidance:
      "A leaseholder, tenant and visitor have materially different parking rights, and the module chosen depends on which applies.",
    source: "ANSWER",
  },
  {
    factKey: "agreement_uploaded",
    label: "Agreement uploaded",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "Residential parking rights may only be asserted from the agreement's actual wording, so the document must be available.",
    source: "ANSWER",
  },
  {
    factKey: "agreement_permit_clause",
    label: "Agreement permit clause",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "If the agreement lets the landlord impose parking controls, that wording must be addressed rather than ignored.",
    source: "ANSWER",
  },
  {
    factKey: "bay_allocated",
    label: "Bay allocated",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "bay_reference",
    label: "Bay reference",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "An allocated space strengthens the residential route, but only where the agreement identifies it.",
    source: "ANSWER",
  },
  {
    factKey: "communal_space",
    label: "Communal space",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "third_party_operator_clause",
    label: "Third party operator clause",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "parking_right_evidence",
    label: "Parking right evidence",
    valueType: "STRING",
    allowedValues: [],
    guidance: null,
    source: "ANSWER",
  },
  {
    factKey: "signage_issue_basis",
    label: "Signage issue basis",
    valueType: "MULTI_ENUM",
    allowedValues: [
      "charge_not_prominent",
      "conflicting_signs",
      "no_entrance_sign",
      "obscured_or_damaged",
      "term_not_prominent",
    ],
    guidance:
      "A signage challenge must rest on a specific defect, not a general complaint, or it weakens the appeal.",
    source: "ANSWER",
  },
  {
    factKey: "additional_time_needed",
    label: "Additional time needed",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "A reasonable-adjustment argument requires that additional time was actually needed for a disability-related reason.",
    source: "ANSWER",
  },
  {
    factKey: "hospital_attendance",
    label: "Hospital attendance",
    valueType: "ENUM",
    allowedValues: [
      "appointment",
      "emergency",
      "other",
      "visiting",
    ],
    guidance:
      "Hospital and medical attendance engages specific concessions, so the nature of the attendance is material.",
    source: "ANSWER",
  },
  {
    factKey: "activity_type",
    label: "Activity type",
    valueType: "ENUM",
    allowedValues: [
      "collection",
      "dropoff",
      "loading",
      "other",
    ],
    guidance:
      "Loading and unloading is treated differently from parking, so what the vehicle was doing is material.",
    source: "ANSWER",
  },
  {
    factKey: "charging_session",
    label: "Charging session",
    valueType: "ENUM",
    allowedValues: [
      "NO",
      "UNSURE",
      "YES",
    ],
    guidance:
      "An active charging session engages the EV bay terms rather than the general parking terms.",
    source: "ANSWER",
  },
  {
    factKey: "barrier_failure",
    label: "Barrier failure",
    valueType: "STRING",
    allowedValues: [],
    guidance:
      "A barrier or entry system failure can make compliance impossible, which defeats the alleged breach.",
    source: "ANSWER",
  },
] as const;

const BY_KEY = new Map(FACT_REGISTRY.map((e) => [e.factKey, e]));

export function factRegistryEntry(
  factKey: string,
): FactRegistryEntry | undefined {
  return BY_KEY.get(factKey);
}

/**
 * The values this fact accepts, or null when it is free-form.
 *
 * Returns a copy: a caller must not be able to widen the shared
 * vocabulary in place.
 */
export function factRegistryValues(factKey: string): string[] | null {
  const entry = BY_KEY.get(factKey);
  if (!entry || entry.allowedValues.length === 0) return null;
  return [...entry.allowedValues];
}
