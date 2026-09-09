import type { QuestionDef } from "./types";
import { FACT, factBool, factStr } from "./facts";

/**
 * Controlled question bank.
 *
 * MASTER Developer Pack V2 Part 4: infer from the notice first, then ask
 * only what is materially necessary. Target journey is normally 3–6
 * factual questions after confirmation — not a fixed number and not a
 * long form.
 *
 * NON-NEGOTIABLE KEEPER RULE: no question may ask who was driving,
 * whether the customer was driving, or invite a driver admission. Every
 * question below refers to the vehicle, the keeper, the appellant or a
 * past formal identification event. Enforced by keeperGuard.ts.
 */

const yesNoUnsure = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "UNSURE", label: "I'm not sure" },
];

export const QUESTION_BANK: QuestionDef[] = [
  /* ==================== TRIAGE ==================== */
  {
    questionId: "Q-KEEPER-01",
    type: "single_choice",
    label: "Are you the registered keeper of the vehicle named on the V5C?",
    helpText:
      "The registered keeper is the person or company recorded at DVLA for the vehicle.",
    required: true,
    options: yesNoUnsure,
    serves: "TRIAGE",
    establishesFacts: [FACT.REGISTERED_KEEPER],
    askWhen: () => true,
    priority: 10,
    supportsModules: ["KB-POFA-01"],
  },
  {
    questionId: "Q-DRIVER-ID-01",
    type: "single_choice",
    // Keeper-safe: asks about a past formal identification event, never
    // who was driving.
    label:
      "Has the parking company already been given the driver's full name and serviceable address?",
    helpText:
      "We only need to know whether that information has already been formally provided. We will never ask you who was driving.",
    required: true,
    options: yesNoUnsure,
    serves: "TRIAGE",
    establishesFacts: [FACT.DRIVER_IDENTIFIED],
    askWhen: (f) => factStr(f, FACT.REGISTERED_KEEPER) !== null,
    priority: 20,
    supportsModules: ["KB-POFA-01", "KB-POFA-05"],
  },
  {
    questionId: "Q-SCOPE-JURISDICTION",
    type: "single_choice",
    label: "Where is the car park located?",
    helpText: "Different rules apply in different parts of the UK.",
    required: true,
    options: [
      { value: "ENGLAND_WALES", label: "England or Wales" },
      { value: "SCOTLAND", label: "Scotland" },
      { value: "NORTHERN_IRELAND", label: "Northern Ireland" },
      { value: "UNSURE", label: "I'm not sure" },
    ],
    serves: "SCOPE",
    establishesFacts: [FACT.JURISDICTION],
    askWhen: () => true,
    priority: 5,
    supportsModules: ["KB-POFA-01"],
  },
  {
    questionId: "Q-SCOPE-HIRE",
    type: "single_choice",
    label:
      "At the time of the parking event, was the vehicle hired, leased or registered to a company?",
    helpText:
      "Hire and company vehicles follow a different statutory route, so we handle them separately.",
    required: true,
    options: [
      { value: "PRIVATE", label: "No — privately owned" },
      { value: "HIRE", label: "Yes — hired or rented" },
      { value: "LEASE", label: "Yes — leased" },
      { value: "COMPANY", label: "Yes — a company vehicle" },
      { value: "UNSURE", label: "I'm not sure" },
    ],
    serves: "SCOPE",
    establishesFacts: [FACT.VEHICLE_HIRE_STATUS],
    askWhen: () => true,
    priority: 6,
  },
  {
    questionId: "Q-NOTICE-ROUTE",
    type: "single_choice",
    label: "How did you first receive the parking notice?",
    helpText:
      "We ask only because it was not clear from the document you uploaded.",
    required: true,
    options: [
      { value: "POSTAL", label: "By post" },
      { value: "WINDSCREEN", label: "It was placed on the vehicle" },
      { value: "UNKNOWN", label: "I'm not sure" },
    ],
    serves: "TRIAGE",
    // Skipped automatically when extraction already established the route.
    establishesFacts: [FACT.NOTICE_ROUTE],
    askWhen: () => true,
    priority: 30,
    supportsModules: ["KB-POFA-02", "KB-POFA-03"],
  },
  {
    questionId: "Q-WHAT-HAPPENED",
    type: "multi_choice",
    label: "Which of these describe what actually happened?",
    helpText:
      "Choose everything that applies. This tells us which points are worth making — pick nothing if none apply.",
    required: false,
    options: [
      { value: "payment_made", label: "A payment was made for the parking" },
      { value: "payment_attempted_failed", label: "A payment was attempted but did not complete" },
      { value: "vrm_error", label: "A vehicle registration was entered incorrectly" },
      { value: "breakdown_immobilised", label: "The vehicle broke down or could not be moved" },
      { value: "resident_parking_rights", label: "The vehicle was parked at the appellant's home under a lease or tenancy" },
      { value: "authorised_or_permit", label: "A permit or permission to park was in place" },
      { value: "short_stay_consideration", label: "The vehicle was only briefly on site" },
      { value: "grace_or_exit", label: "The vehicle was delayed leaving after the parking ended" },
      { value: "multiple_visits_same_day", label: "The vehicle attended more than once that day" },
      { value: "anpr_disputed", label: "The camera times relied on are disputed" },
      { value: "accessibility_additional_time", label: "Extra time was needed for a disability-related reason" },
      { value: "hospital_attendance", label: "The visit was connected with hospital or medical attendance" },
      { value: "loading_or_dropoff", label: "The vehicle was loading, unloading or dropping someone off" },
      { value: "ev_charging", label: "The vehicle was charging" },
      { value: "barrier_or_access_failure", label: "A barrier or entry/exit system failed" },
      { value: "signage_issue", label: "The signs were unclear, hidden or contradictory" },
      { value: "no_ntk_received", label: "No Notice to Keeper has been received" },
      { value: "postal_ntk_timing_issue", label: "The postal Notice to Keeper arrived late" },
    ],
    serves: "TRIAGE",
    establishesFacts: [FACT.SCENARIOS],
    askWhen: (f) => factStr(f, FACT.REGISTERED_KEEPER) !== null,
    priority: 40,
  },

  /* ==================== PAYMENT ==================== */
  {
    questionId: "Q-PAY-METHOD",
    type: "single_choice",
    label: "How was the payment made?",
    required: true,
    options: [
      { value: "machine", label: "Pay machine on site" },
      { value: "app", label: "Parking app" },
      { value: "online", label: "Online" },
      { value: "phone", label: "By phone" },
      { value: "other", label: "Another way" },
    ],
    serves: "PAYMENT",
    establishesFacts: [FACT.PAYMENT_METHOD],
    askWhen: (f) =>
      f.tags.has("payment_made") || f.tags.has("payment_attempted_failed"),
    priority: 100,
    supportsModules: ["KB-PAY-01", "KB-PAY-02", "KB-PAY-03"],
  },
  {
    questionId: "Q-PAY-EVIDENCE",
    type: "single_choice",
    label: "Do you have a receipt, bank record or app confirmation for that payment?",
    helpText:
      "You can upload it at the next step. We will only refer to evidence that you actually provide.",
    required: true,
    options: yesNoUnsure,
    serves: "PAYMENT",
    establishesFacts: [FACT.PAYMENT_EVIDENCE],
    askWhen: (f) =>
      f.tags.has("payment_made") || f.tags.has("payment_attempted_failed"),
    priority: 110,
    supportsModules: ["KB-PAY-01"],
  },

  /* ==================== KEYING ==================== */
  {
    questionId: "Q-KEY-ENTERED",
    type: "short_text",
    label: "Which vehicle registration was entered when paying?",
    helpText:
      "Enter it exactly as it was typed, even if it was wrong. This lets the operator match the transaction.",
    required: true,
    placeholder: "e.g. AB12 CDE",
    serves: "KEYING",
    establishesFacts: [FACT.VRM_ENTERED],
    askWhen: (f) => f.tags.has("vrm_error"),
    priority: 120,
    supportsModules: ["KB-KEY-01", "KB-KEY-02"],
  },

  /* ==================== BREAKDOWN ==================== */
  {
    questionId: "Q-BREAK-NATURE",
    type: "single_choice",
    label: "What stopped the vehicle being moved?",
    required: true,
    options: [
      { value: "mechanical_failure", label: "Mechanical failure — it would not start or drive" },
      { value: "flat_battery", label: "Flat battery" },
      { value: "puncture", label: "Puncture or tyre damage" },
      { value: "collision_damage", label: "Damage after a collision" },
      { value: "other", label: "Something else" },
    ],
    serves: "BREAKDOWN",
    establishesFacts: [FACT.BREAKDOWN_NATURE],
    askWhen: (f) => f.tags.has("breakdown_immobilised"),
    priority: 90,
    supportsModules: ["KB-BREAK-01", "KB-BREAK-02"],
  },
  {
    questionId: "Q-BREAK-PREVENTED",
    type: "single_choice",
    label:
      "Did that prevent the vehicle from being moved safely or lawfully during the period on the notice?",
    helpText:
      "This matters because a genuine inability to move the vehicle is treated very differently from ordinary delay.",
    required: true,
    options: yesNoUnsure,
    serves: "BREAKDOWN",
    establishesFacts: [FACT.BREAKDOWN_PREVENTED_DEPARTURE],
    askWhen: (f) => f.tags.has("breakdown_immobilised"),
    priority: 91,
    supportsModules: ["KB-BREAK-01", "KB-BREAK-02"],
  },
  {
    questionId: "Q-BREAK-EVIDENCE",
    type: "multi_choice",
    label: "What evidence of the breakdown can you provide?",
    helpText: "Select any you have. You can upload them at the next step.",
    required: false,
    options: [
      { value: "recovery_report", label: "Recovery or breakdown attendance report" },
      { value: "garage_invoice", label: "Garage or repair invoice" },
      { value: "roadside_record", label: "Roadside repair record" },
      { value: "photos", label: "Photographs" },
      { value: "call_logs", label: "Call logs or messages" },
      { value: "none", label: "None of these" },
    ],
    serves: "BREAKDOWN",
    establishesFacts: [FACT.BREAKDOWN_EVIDENCE],
    askWhen: (f) => f.tags.has("breakdown_immobilised"),
    priority: 92,
    supportsModules: ["KB-BREAK-01", "KB-BREAK-03"],
  },

  /* ==================== RESIDENTIAL ==================== */
  {
    questionId: "Q-RES-STATUS",
    type: "single_choice",
    label: "What is the appellant's connection to the address?",
    required: true,
    options: [
      { value: "leaseholder", label: "Leaseholder" },
      { value: "tenant", label: "Tenant" },
      { value: "owner_occupier", label: "Owner-occupier" },
      { value: "visitor", label: "Visitor to a resident" },
      { value: "other", label: "Other" },
    ],
    serves: "RESIDENTIAL",
    establishesFacts: [FACT.OCCUPIER_STATUS],
    askWhen: (f) => f.tags.has("resident_parking_rights"),
    priority: 80,
    supportsModules: ["KB-RES-01"],
  },
  {
    questionId: "Q-RES-AGREEMENT",
    type: "single_choice",
    label:
      "Can you provide the lease, tenancy agreement or parking grant covering that space?",
    helpText:
      "We can only rely on parking rights that the document actually contains, so the wording matters.",
    required: true,
    options: yesNoUnsure,
    serves: "RESIDENTIAL",
    establishesFacts: [FACT.AGREEMENT_UPLOADED],
    askWhen: (f) => f.tags.has("resident_parking_rights"),
    priority: 81,
    supportsModules: ["KB-RES-01", "KB-RES-02"],
  },
  {
    questionId: "Q-RES-PERMIT-CLAUSE",
    type: "single_choice",
    label:
      "Does that agreement mention permits, parking regulations, or a right for the landlord to introduce parking controls?",
    helpText:
      "If it does, we must address that wording directly rather than ignore it.",
    required: true,
    options: yesNoUnsure,
    serves: "RESIDENTIAL",
    establishesFacts: [FACT.AGREEMENT_PERMIT_CLAUSE],
    askWhen: (f) =>
      f.tags.has("resident_parking_rights") &&
      factStr(f, FACT.AGREEMENT_UPLOADED) === "YES",
    priority: 82,
    supportsModules: ["KB-RES-06"],
  },
  {
    questionId: "Q-RES-BAY",
    type: "short_text",
    label:
      "If the agreement identifies a specific parking space, what is its number or reference?",
    required: false,
    placeholder: "e.g. Bay 14",
    serves: "RESIDENTIAL",
    establishesFacts: [FACT.BAY_REFERENCE],
    askWhen: (f) =>
      f.tags.has("resident_parking_rights") &&
      factStr(f, FACT.AGREEMENT_UPLOADED) === "YES",
    priority: 83,
    supportsModules: ["KB-RES-03"],
  },

  /* ==================== PERMIT / AUTHORISATION ==================== */
  {
    questionId: "Q-AUTH-SOURCE",
    type: "single_choice",
    label: "Where did the permission to park come from?",
    required: true,
    options: [
      { value: "resident_permit", label: "A resident permit" },
      { value: "employer", label: "An employer" },
      { value: "hotel_or_business", label: "A hotel or business being visited" },
      { value: "landowner", label: "The landowner or managing agent" },
      { value: "visitor_permit", label: "A visitor permit or registration" },
      { value: "other", label: "Another source" },
    ],
    serves: "AUTHORIZATION",
    establishesFacts: [FACT.PERMISSION_SOURCE],
    askWhen: (f) => f.tags.has("authorised_or_permit"),
    priority: 105,
    supportsModules: ["KB-AUTH-01", "KB-AUTH-02", "KB-AUTH-03"],
  },

  /* ==================== ANPR / DURATION ==================== */
  {
    questionId: "Q-ANPR-VISITS",
    type: "number",
    label: "How many separate times did the vehicle enter the site that day?",
    helpText:
      "If the vehicle came and went more than once, the operator may have joined the first entry to the last exit.",
    required: true,
    min: 1,
    max: 20,
    serves: "ANPR",
    establishesFacts: [FACT.VISIT_COUNT],
    askWhen: (f) => f.tags.has("multiple_visits_same_day"),
    priority: 95,
    supportsModules: ["KB-ANPR-01", "KB-ANPR-02"],
  },
  {
    questionId: "Q-ANPR-DISPUTE",
    type: "long_text",
    label: "What specifically is wrong with the times or images relied on?",
    helpText:
      "Please be specific — we can only challenge a discrepancy that actually appears in the evidence.",
    required: true,
    placeholder:
      "e.g. the exit photograph is timestamped 14:32 but the vehicle had left before 14:00",
    serves: "ANPR",
    establishesFacts: [FACT.CONTINUOUS_PRESENCE],
    askWhen: (f) => f.tags.has("anpr_disputed"),
    priority: 96,
    supportsModules: ["KB-ANPR-03", "KB-TIME-01"],
  },

  /* ==================== CONSIDERATION / GRACE ==================== */
  {
    questionId: "Q-CON-INITIAL",
    type: "long_text",
    label:
      "What happened during the first few minutes on site, before any parking began?",
    helpText:
      "For example finding a space, reading the signs, queueing, or trying to pay.",
    required: true,
    placeholder:
      "e.g. the vehicle circled the car park looking for a space and then left without parking",
    serves: "CONSIDERATION",
    establishesFacts: [FACT.INITIAL_PERIOD_REASON],
    askWhen: (f) => f.tags.has("short_stay_consideration"),
    priority: 130,
    supportsModules: ["KB-CON-01", "KB-CON-02"],
  },
  {
    questionId: "Q-GRACE-EXIT",
    type: "long_text",
    label: "What delayed the vehicle leaving after the parking period ended?",
    required: true,
    placeholder: "e.g. a queue at the exit barrier",
    serves: "GRACE",
    establishesFacts: [FACT.EXIT_DELAY_REASON],
    askWhen: (f) => f.tags.has("grace_or_exit"),
    priority: 131,
    supportsModules: ["KB-GRACE-01", "KB-GRACE-02"],
  },

  /* ==================== EQUALITY ==================== */
  {
    questionId: "Q-EQ-TIME",
    type: "long_text",
    label:
      "Why was additional time needed, and how did that affect what the operator is alleging?",
    helpText:
      "Please describe only what is needed to explain the extra time. Do not include medical detail you would rather not share.",
    required: true,
    placeholder:
      "e.g. additional time was required to transfer to a wheelchair before reaching the payment machine",
    serves: "EQUALITY",
    establishesFacts: [FACT.ADDITIONAL_TIME_NEEDED],
    askWhen: (f) => f.tags.has("accessibility_additional_time"),
    priority: 85,
    supportsModules: ["KB-EQ-01", "KB-EQ-02", "KB-EQ-03"],
  },

  /* ==================== HOSPITAL ==================== */
  {
    questionId: "Q-HOSP-ATTENDANCE",
    type: "single_choice",
    label: "Was the visit a booked appointment or an emergency?",
    required: true,
    options: [
      { value: "appointment", label: "A booked appointment" },
      { value: "emergency", label: "An emergency or urgent attendance" },
      { value: "visiting", label: "Visiting a patient" },
      { value: "other", label: "Something else" },
    ],
    serves: "HOSPITAL",
    establishesFacts: [FACT.HOSPITAL_ATTENDANCE],
    askWhen: (f) => f.tags.has("hospital_attendance"),
    priority: 86,
    supportsModules: ["KB-HOSP-01", "KB-HOSP-02"],
  },

  /* ==================== LOADING / DROP-OFF ==================== */
  {
    questionId: "Q-ACT-TYPE",
    type: "single_choice",
    label: "What was the vehicle doing while it was stopped?",
    required: true,
    options: [
      { value: "loading", label: "Loading or unloading goods" },
      { value: "dropoff", label: "Dropping off or collecting a passenger" },
      { value: "collection", label: "Collecting an order or checking in" },
      { value: "other", label: "Something else" },
    ],
    serves: "LOADING",
    establishesFacts: [FACT.ACTIVITY_TYPE],
    askWhen: (f) => f.tags.has("loading_or_dropoff"),
    priority: 125,
    supportsModules: ["KB-ACT-01", "KB-ACT-02", "KB-ACT-03"],
  },

  /* ==================== EV / INFRASTRUCTURE ==================== */
  {
    questionId: "Q-EV-SESSION",
    type: "single_choice",
    label: "Do you have a record of the charging session?",
    helpText: "For example the charging app history or a receipt.",
    required: true,
    options: yesNoUnsure,
    serves: "EV_CHARGING",
    establishesFacts: [FACT.CHARGING_SESSION],
    askWhen: (f) => f.tags.has("ev_charging"),
    priority: 126,
    supportsModules: ["KB-EVCH-01"],
  },
  {
    questionId: "Q-INFRA-BARRIER",
    type: "long_text",
    label: "What happened with the barrier or access system?",
    required: true,
    placeholder: "e.g. the exit barrier would not raise for around 20 minutes",
    serves: "INFRASTRUCTURE",
    establishesFacts: [FACT.BARRIER_FAILURE],
    askWhen: (f) => f.tags.has("barrier_or_access_failure"),
    priority: 127,
    supportsModules: ["KB-INFRA-01"],
  },

  /* ==================== SIGNAGE ==================== */
  {
    questionId: "Q-SIGN-BASIS",
    type: "multi_choice",
    label: "What was the problem with the signs?",
    helpText:
      "We can only raise a signage point that the evidence supports, so please choose what genuinely applied.",
    required: true,
    options: [
      { value: "no_entrance_sign", label: "No clear sign on the way in" },
      { value: "term_not_prominent", label: "The specific restriction was not prominent" },
      { value: "charge_not_prominent", label: "The charge amount was not prominent" },
      { value: "conflicting_signs", label: "Different signs said different things" },
      { value: "obscured_or_damaged", label: "The sign was obscured, damaged or unlit" },
    ],
    serves: "SIGNAGE",
    establishesFacts: [FACT.SIGNAGE_ISSUE_BASIS],
    askWhen: (f) => f.tags.has("signage_issue"),
    priority: 140,
    supportsModules: ["KB-SIGN-01", "KB-SIGN-02", "KB-SIGN-03", "KB-SIGN-04"],
  },
];

/**
 * Route families that a tag opens up.
 *
 * Now owned by the requirement map — it is case-analysis data, not
 * question data. Re-exported here so existing importers keep working.
 */
export { ROUTE_TRIGGERS as TAG_ROUTES } from "./requirements";

/** Keep referenced helpers used by askWhen predicates exported for tests. */
export { factBool, factStr };
