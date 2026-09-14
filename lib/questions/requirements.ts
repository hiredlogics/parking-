import type { RouteFamily } from "@/types/caseState";
import { FACT, factStr } from "./facts";
import type { KnownFacts } from "./types";

/**
 * Fact-requirement map.
 *
 * @deprecated Phase 5 — relationships now live in
 * `issue_required_facts` / `issue_knowledge` (Admin config). This file
 * seeds the initial graph and remains as legacy fallback. Do not extend
 * for live behaviour; remove in Phase 6–7 after parity tests.
 *
 * This replaces the question bank as the definition of "what a case
 * still needs". Previously a fact counted as missing only if some
 * hard-coded question happened to ask it, which made the bank the
 * silent authority over the whole journey.
 *
 * Here the authority is the appeal route: each supported route declares
 * the facts that may be required to establish or evaluate it, why, and
 * which controlled KB module makes it material. The AI may phrase the
 * question however suits the case, but it may only ever target a fact
 * that appears in this map — so it cannot invent a legal requirement.
 *
 * This map contains NO customer-facing wording and NO question order.
 */

export type ReasonCode =
  // Triage and scope
  | "KEEPER_STATUS_UNRESOLVED"
  | "DRIVER_NOTIFICATION_STATUS_UNRESOLVED"
  | "JURISDICTION_UNRESOLVED"
  | "VEHICLE_STATUS_UNRESOLVED"
  | "NOTICE_ROUTE_UNRESOLVED"
  | "GROUNDS_UNIDENTIFIED"
  // Payment / keying
  | "PAYMENT_STATUS_UNRESOLVED"
  | "PAYMENT_METHOD_UNRESOLVED"
  | "PAYMENT_EVIDENCE_UNRESOLVED"
  | "VRM_ENTRY_UNRESOLVED"
  // Breakdown
  | "BREAKDOWN_STATUS_UNRESOLVED"
  | "BREAKDOWN_NATURE_UNRESOLVED"
  | "BREAKDOWN_EVIDENCE_UNRESOLVED"
  // Residential
  | "OCCUPIER_STATUS_UNRESOLVED"
  | "AGREEMENT_EVIDENCE_UNRESOLVED"
  | "AGREEMENT_TERMS_UNRESOLVED"
  | "BAY_ALLOCATION_UNRESOLVED"
  // Permit / authorisation
  | "PERMISSION_STATUS_UNRESOLVED"
  | "PERMISSION_SOURCE_UNRESOLVED"
  // ANPR / duration
  | "ANPR_PRESENCE_UNRESOLVED"
  | "VISIT_COUNT_UNRESOLVED"
  | "CONSIDERATION_PERIOD_UNRESOLVED"
  | "GRACE_PERIOD_UNRESOLVED"
  // Other routes
  | "EQUALITY_NEED_UNRESOLVED"
  | "HOSPITAL_ATTENDANCE_UNRESOLVED"
  | "ACTIVITY_TYPE_UNRESOLVED"
  | "CHARGING_SESSION_UNRESOLVED"
  | "BARRIER_FAILURE_UNRESOLVED"
  | "SIGNAGE_BASIS_UNRESOLVED";

export const ALL_REASON_CODES: readonly ReasonCode[] = [
  "KEEPER_STATUS_UNRESOLVED",
  "DRIVER_NOTIFICATION_STATUS_UNRESOLVED",
  "JURISDICTION_UNRESOLVED",
  "VEHICLE_STATUS_UNRESOLVED",
  "NOTICE_ROUTE_UNRESOLVED",
  "GROUNDS_UNIDENTIFIED",
  "PAYMENT_STATUS_UNRESOLVED",
  "PAYMENT_METHOD_UNRESOLVED",
  "PAYMENT_EVIDENCE_UNRESOLVED",
  "VRM_ENTRY_UNRESOLVED",
  "BREAKDOWN_STATUS_UNRESOLVED",
  "BREAKDOWN_NATURE_UNRESOLVED",
  "BREAKDOWN_EVIDENCE_UNRESOLVED",
  "OCCUPIER_STATUS_UNRESOLVED",
  "AGREEMENT_EVIDENCE_UNRESOLVED",
  "AGREEMENT_TERMS_UNRESOLVED",
  "BAY_ALLOCATION_UNRESOLVED",
  "PERMISSION_STATUS_UNRESOLVED",
  "PERMISSION_SOURCE_UNRESOLVED",
  "ANPR_PRESENCE_UNRESOLVED",
  "VISIT_COUNT_UNRESOLVED",
  "CONSIDERATION_PERIOD_UNRESOLVED",
  "GRACE_PERIOD_UNRESOLVED",
  "EQUALITY_NEED_UNRESOLVED",
  "HOSPITAL_ATTENDANCE_UNRESOLVED",
  "ACTIVITY_TYPE_UNRESOLVED",
  "CHARGING_SESSION_UNRESOLVED",
  "BARRIER_FAILURE_UNRESOLVED",
  "SIGNAGE_BASIS_UNRESOLVED",
] as const;

export type RequirementScope = RouteFamily | "TRIAGE" | "SCOPE";

export interface FactRequirement {
  /** A key from the FACT registry. Nothing else may be targeted. */
  fact: string;
  reasonCode: ReasonCode;
  route: RequirementScope;
  /** Lower is asked first. */
  priority: number;
  /** Why this fact is material. Supplied to the AI and stored for audit. */
  rationale: string;
  /** Controlled KB modules that make this fact material. */
  kbModules: string[];
  /**
   * Required only when this holds. Absent means always required for an
   * open route. This is what stops the "payment_made = false, keep
   * asking about receipts" failure.
   */
  when?: (f: KnownFacts) => boolean;
  /**
   * Already answered by something else, so it must not be asked. Used
   * where a triage selection implies the fact.
   */
  impliedBy?: (f: KnownFacts) => boolean;

  /**
   * The case cannot proceed without this fact actually established.
   *
   * Non-critical facts are treated as settled once asked, because a
   * keeper may legitimately not know a bay number and must not be
   * asked twice. That rule is wrong for a fact the whole appeal turns
   * on: leaving `scenarios` empty used to complete questioning and land
   * the case in review with nothing to argue. A critical fact left
   * unresolved routes to review with an explanation instead.
   */
  critical?: boolean;
}

const tag = (f: KnownFacts, t: string) => f.tags.has(t);
const is = (f: KnownFacts, key: string, ...values: string[]) =>
  values.includes(factStr(f, key) ?? "");

/** A payment route is only worth pursuing if a payment actually happened. */
const paymentOccurred = (f: KnownFacts) =>
  is(f, FACT.PAYMENT_MADE, "YES", "ATTEMPTED_FAILED") ||
  tag(f, "payment_made") ||
  tag(f, "payment_attempted_failed");

/* =========================== Triage and scope =========================== */

export const TRIAGE_REQUIREMENTS: FactRequirement[] = [
  {
    fact: FACT.JURISDICTION,
    reasonCode: "JURISDICTION_UNRESOLVED",
    route: "SCOPE",
    priority: 5,
    rationale:
      "Schedule 4 keeper liability applies in England and Wales only, so the jurisdiction decides whether the automated route is available at all.",
    kbModules: ["KB-POFA-01"],
  },
  {
    fact: FACT.VEHICLE_HIRE_STATUS,
    reasonCode: "VEHICLE_STATUS_UNRESOLVED",
    route: "SCOPE",
    priority: 6,
    rationale:
      "Hire, lease and company vehicles follow a different statutory route that is not automated.",
    kbModules: ["KB-POFA-01"],
  },
  {
    fact: FACT.REGISTERED_KEEPER,
    reasonCode: "KEEPER_STATUS_UNRESOLVED",
    route: "TRIAGE",
    priority: 10,
    rationale:
      "The whole appeal is written on behalf of the registered keeper, so this must be settled before anything else.",
    kbModules: ["KB-POFA-01"],
    critical: true,
  },
  {
    fact: FACT.DRIVER_IDENTIFIED,
    reasonCode: "DRIVER_NOTIFICATION_STATUS_UNRESOLVED",
    route: "TRIAGE",
    priority: 20,
    rationale:
      "Whether the driver's details have ALREADY been formally provided to the operator decides if the keeper-liability route survives. This concerns a past notification event only — never who was driving.",
    kbModules: ["KB-POFA-01", "KB-POFA-05"],
    when: (f) => factStr(f, FACT.REGISTERED_KEEPER) !== null,
  },
  {
    fact: FACT.NOTICE_ROUTE,
    reasonCode: "NOTICE_ROUTE_UNRESOLVED",
    route: "POFA",
    priority: 30,
    rationale:
      "Postal and windscreen notices are governed by different Schedule 4 paragraphs and different timing limits.",
    kbModules: ["KB-POFA-02", "KB-POFA-03"],
  },
  {
    fact: FACT.SCENARIOS,
    reasonCode: "GROUNDS_UNIDENTIFIED",
    route: "TRIAGE",
    priority: 40,
    rationale:
      "Nothing on the notice explains why the charge is disputed. Until something is known about what actually happened, no substantive route can be opened.",
    kbModules: [],
    when: (f) => factStr(f, FACT.REGISTERED_KEEPER) !== null,
    /*
     * NOT critical any more.
     *
     * It was, while scenario tags were the only way to open a route —
     * leaving it empty dead-ended the case. Routes now open from the
     * operator's allegation, established facts and uploaded evidence
     * too, so this question is a useful shortcut rather than a
     * prerequisite. The dead-end guard moved to "no viable route was
     * identified at all", which is the condition that actually matters.
     */
  },
];

/* ============================ Route families ============================ */

export const ROUTE_REQUIREMENTS: Partial<Record<RouteFamily, FactRequirement[]>> = {
  PAYMENT: [
    {
      fact: FACT.PAYMENT_MADE,
      reasonCode: "PAYMENT_STATUS_UNRESOLVED",
      route: "PAYMENT",
      priority: 100,
      rationale:
        "Whether a payment was made or attempted decides between the payment-made, failed-machine and digital-failure modules.",
      kbModules: ["KB-PAY-01", "KB-PAY-02", "KB-PAY-03"],
      impliedBy: (f) => tag(f, "payment_made") || tag(f, "payment_attempted_failed"),
    },
    {
      fact: FACT.PAYMENT_METHOD,
      reasonCode: "PAYMENT_METHOD_UNRESOLVED",
      route: "PAYMENT",
      priority: 101,
      rationale:
        "The method separates machine failure from app or online failure, which are different modules with different wording.",
      kbModules: ["KB-PAY-01", "KB-PAY-02", "KB-PAY-03"],
      // Never asked when no payment occurred.
      when: paymentOccurred,
    },
    {
      fact: FACT.PAYMENT_EVIDENCE,
      reasonCode: "PAYMENT_EVIDENCE_UNRESOLVED",
      route: "PAYMENT",
      priority: 102,
      rationale:
        "A payment assertion may only be made where the keeper can actually produce a record of it.",
      kbModules: ["KB-PAY-01"],
      when: paymentOccurred,
    },
  ],

  KEYING: [
    {
      fact: FACT.VRM_ENTERED,
      reasonCode: "VRM_ENTRY_UNRESOLVED",
      route: "KEYING",
      priority: 110,
      rationale:
        "The keying-error module needs the registration actually entered, so the operator can match the transaction.",
      kbModules: ["KB-KEY-01", "KB-KEY-02"],
      when: (f) => tag(f, "vrm_error"),
    },
  ],

  BREAKDOWN: [
    {
      fact: FACT.BREAKDOWN_PREVENTED_DEPARTURE,
      reasonCode: "BREAKDOWN_STATUS_UNRESOLVED",
      route: "BREAKDOWN",
      priority: 90,
      rationale:
        "A genuine inability to move the vehicle is treated very differently from ordinary delay, so this is the load-bearing fact for the route.",
      kbModules: ["KB-BREAK-01", "KB-BREAK-02"],
    },
    {
      fact: FACT.BREAKDOWN_NATURE,
      reasonCode: "BREAKDOWN_NATURE_UNRESOLVED",
      route: "BREAKDOWN",
      priority: 91,
      rationale:
        "The nature of the failure determines which breakdown module applies and what the appeal may assert.",
      kbModules: ["KB-BREAK-01", "KB-BREAK-02"],
      when: (f) => !is(f, FACT.BREAKDOWN_PREVENTED_DEPARTURE, "NO"),
    },
    {
      fact: FACT.BREAKDOWN_EVIDENCE,
      reasonCode: "BREAKDOWN_EVIDENCE_UNRESOLVED",
      route: "BREAKDOWN",
      priority: 92,
      rationale:
        "The breakdown modules require supporting evidence; without it the ground cannot be asserted.",
      kbModules: ["KB-BREAK-01", "KB-BREAK-03"],
      when: (f) => !is(f, FACT.BREAKDOWN_PREVENTED_DEPARTURE, "NO"),
    },
  ],

  RESIDENTIAL: [
    {
      fact: FACT.OCCUPIER_STATUS,
      reasonCode: "OCCUPIER_STATUS_UNRESOLVED",
      route: "RESIDENTIAL",
      priority: 80,
      rationale:
        "A leaseholder, tenant and visitor have materially different parking rights, and the module chosen depends on which applies.",
      kbModules: ["KB-RES-01"],
    },
    {
      fact: FACT.AGREEMENT_UPLOADED,
      reasonCode: "AGREEMENT_EVIDENCE_UNRESOLVED",
      route: "RESIDENTIAL",
      priority: 81,
      rationale:
        "Residential parking rights may only be asserted from the agreement's actual wording, so the document must be available.",
      kbModules: ["KB-RES-01", "KB-RES-02"],
    },
    {
      fact: FACT.AGREEMENT_PERMIT_CLAUSE,
      reasonCode: "AGREEMENT_TERMS_UNRESOLVED",
      route: "RESIDENTIAL",
      priority: 82,
      rationale:
        "If the agreement lets the landlord impose parking controls, that wording must be addressed rather than ignored.",
      kbModules: ["KB-RES-06"],
      when: (f) => is(f, FACT.AGREEMENT_UPLOADED, "YES"),
    },
    {
      fact: FACT.BAY_REFERENCE,
      reasonCode: "BAY_ALLOCATION_UNRESOLVED",
      route: "RESIDENTIAL",
      priority: 83,
      rationale:
        "An allocated space strengthens the residential route, but only where the agreement identifies it.",
      kbModules: ["KB-RES-03"],
      when: (f) => is(f, FACT.AGREEMENT_UPLOADED, "YES"),
    },
  ],

  AUTHORIZATION: [
    {
      fact: FACT.PERMISSION_HELD,
      reasonCode: "PERMISSION_STATUS_UNRESOLVED",
      route: "AUTHORIZATION",
      priority: 85,
      rationale:
        "Permission to park defeats the alleged breach outright, so whether it existed is the primary fact.",
      kbModules: ["KB-AUTH-01"],
    },
    {
      fact: FACT.PERMISSION_SOURCE,
      reasonCode: "PERMISSION_SOURCE_UNRESOLVED",
      route: "AUTHORIZATION",
      priority: 86,
      rationale:
        "Who granted permission determines whether it binds the operator.",
      kbModules: ["KB-AUTH-01", "KB-AUTH-02"],
      when: (f) => is(f, FACT.PERMISSION_HELD, "YES"),
    },
  ],

  PERMIT: [
    {
      fact: FACT.PERMISSION_HELD,
      reasonCode: "PERMISSION_STATUS_UNRESOLVED",
      route: "PERMIT",
      priority: 87,
      rationale: "A valid permit defeats the alleged breach.",
      kbModules: ["KB-PERMIT-01"],
    },
  ],

  ANPR: [
    {
      fact: FACT.CONTINUOUS_PRESENCE,
      reasonCode: "ANPR_PRESENCE_UNRESOLVED",
      route: "ANPR",
      priority: 105,
      rationale:
        "Camera systems record a first-in and last-out pair. If the vehicle left and returned, the recorded duration is not a single stay.",
      kbModules: ["KB-ANPR-01", "KB-ANPR-02"],
    },
    {
      fact: FACT.VISIT_COUNT,
      reasonCode: "VISIT_COUNT_UNRESOLVED",
      route: "ANPR",
      priority: 106,
      rationale:
        "The number of separate visits is needed to show the charge treats two stays as one.",
      kbModules: ["KB-ANPR-02"],
      when: (f) => is(f, FACT.CONTINUOUS_PRESENCE, "NO"),
    },
  ],

  CONSIDERATION: [
    {
      fact: FACT.INITIAL_PERIOD_REASON,
      reasonCode: "CONSIDERATION_PERIOD_UNRESOLVED",
      route: "CONSIDERATION",
      priority: 120,
      rationale:
        "The consideration period covers time spent deciding whether to accept the terms, so what happened on arrival is material.",
      kbModules: ["KB-CONS-01"],
    },
  ],

  GRACE: [
    {
      fact: FACT.EXIT_DELAY_REASON,
      reasonCode: "GRACE_PERIOD_UNRESOLVED",
      route: "GRACE",
      priority: 121,
      rationale:
        "The grace period covers a reasonable delay leaving after the parking ends, so the cause of the delay is material.",
      kbModules: ["KB-GRACE-01"],
    },
  ],

  EQUALITY: [
    {
      fact: FACT.ADDITIONAL_TIME_NEEDED,
      reasonCode: "EQUALITY_NEED_UNRESOLVED",
      route: "EQUALITY",
      priority: 70,
      rationale:
        "A reasonable-adjustment argument requires that additional time was actually needed for a disability-related reason.",
      kbModules: ["KB-EQ-01", "KB-EQ-02"],
    },
  ],

  HOSPITAL: [
    {
      fact: FACT.HOSPITAL_ATTENDANCE,
      reasonCode: "HOSPITAL_ATTENDANCE_UNRESOLVED",
      route: "HOSPITAL",
      priority: 75,
      rationale:
        "Hospital and medical attendance engages specific concessions, so the nature of the attendance is material.",
      kbModules: ["KB-HOSP-01"],
    },
  ],

  LOADING: [
    {
      fact: FACT.ACTIVITY_TYPE,
      reasonCode: "ACTIVITY_TYPE_UNRESOLVED",
      route: "LOADING",
      priority: 115,
      rationale:
        "Loading and unloading is treated differently from parking, so what the vehicle was doing is material.",
      kbModules: ["KB-LOAD-01"],
    },
  ],

  DROP_OFF: [
    {
      fact: FACT.ACTIVITY_TYPE,
      reasonCode: "ACTIVITY_TYPE_UNRESOLVED",
      route: "DROP_OFF",
      priority: 116,
      rationale:
        "A drop-off is not parking, so what the vehicle was doing is material.",
      kbModules: ["KB-DROP-01"],
    },
  ],

  EV_CHARGING: [
    {
      fact: FACT.CHARGING_SESSION,
      reasonCode: "CHARGING_SESSION_UNRESOLVED",
      route: "EV_CHARGING",
      priority: 112,
      rationale:
        "An active charging session engages the EV bay terms rather than the general parking terms.",
      kbModules: ["KB-EV-01"],
    },
  ],

  INFRASTRUCTURE: [
    {
      fact: FACT.BARRIER_FAILURE,
      reasonCode: "BARRIER_FAILURE_UNRESOLVED",
      route: "INFRASTRUCTURE",
      priority: 108,
      rationale:
        "A barrier or entry system failure can make compliance impossible, which defeats the alleged breach.",
      kbModules: ["KB-INFRA-01"],
    },
  ],

  SIGNAGE: [
    {
      fact: FACT.SIGNAGE_ISSUE_BASIS,
      reasonCode: "SIGNAGE_BASIS_UNRESOLVED",
      route: "SIGNAGE",
      priority: 140,
      rationale:
        "A signage challenge must rest on a specific defect, not a general complaint, or it weakens the appeal.",
      kbModules: ["KB-SIGN-01", "KB-SIGN-02", "KB-SIGN-03", "KB-SIGN-04"],
      when: (f) => tag(f, "signage_issue"),
    },
  ],
};

/**
 * Scenario tags that open a route family.
 *
 * Data, not questions — the question bank re-exports this for its own
 * use so there is a single definition.
 */
export const ROUTE_TRIGGERS: Record<string, RouteFamily[]> = {
  payment_made: ["PAYMENT"],
  payment_attempted_failed: ["PAYMENT"],
  vrm_error: ["KEYING", "PAYMENT"],
  breakdown_immobilised: ["BREAKDOWN"],
  resident_parking_rights: ["RESIDENTIAL"],
  authorised_or_permit: ["AUTHORIZATION", "PERMIT"],
  short_stay_consideration: ["CONSIDERATION"],
  grace_or_exit: ["GRACE"],
  multiple_visits_same_day: ["ANPR"],
  anpr_disputed: ["ANPR"],
  accessibility_additional_time: ["EQUALITY"],
  hospital_attendance: ["HOSPITAL"],
  loading_or_dropoff: ["LOADING", "DROP_OFF"],
  ev_charging: ["EV_CHARGING"],
  barrier_or_access_failure: ["INFRASTRUCTURE"],
  signage_issue: ["SIGNAGE"],
  landowner_authority_challenge: ["LANDOWNER"],
  no_ntk_received: ["POFA"],
  postal_ntk_timing_issue: ["POFA"],
};

/** Route families currently in play, from the facts alone. */
export function openRoutes(f: KnownFacts): RouteFamily[] {
  const out = new Set<RouteFamily>();
  for (const t of f.tags) {
    for (const r of ROUTE_TRIGGERS[t] ?? []) out.add(r);
  }
  // The keeper/PoFA analysis is always in play on an unidentified-driver
  // keeper route, whether or not a tag says so.
  if (
    is(f, FACT.REGISTERED_KEEPER, "YES") &&
    is(f, FACT.DRIVER_IDENTIFIED, "NO", "UNSURE")
  ) {
    out.add("POFA");
  }
  return [...out].sort();
}

/** Every requirement declared anywhere. Used for validation lookups. */
export function allRequirements(): FactRequirement[] {
  return [
    ...TRIAGE_REQUIREMENTS,
    ...Object.values(ROUTE_REQUIREMENTS).flatMap((r) => r ?? []),
  ];
}

/** Is this fact permitted to be asked at all? */
export function isPermittedFact(fact: string): boolean {
  return allRequirements().some((r) => r.fact === fact);
}

export function requirementsForFact(fact: string): FactRequirement[] {
  return allRequirements().filter((r) => r.fact === fact);
}
