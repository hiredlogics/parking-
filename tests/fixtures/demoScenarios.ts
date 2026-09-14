import type { AllAnswers, ExtractedPcn } from "@/types";

/**
 * WORKED DEVELOPER EXAMPLES — Master Developer Pack, Part 11.
 *
 * Test-only fixtures, used as:
 *   - Deterministic inputs for the mock extraction provider
 *     (services/extraction/mockProvider.ts, EXTRACTION_PROVIDER=mock).
 *   - Integration tests that verify each example produces the paragraph
 *     IDs listed in the pack.
 */
export interface DemoScenario {
  id: string;
  /** Pack label. */
  label: string;
  description: string;
  hints: string[];
  pcn: ExtractedPcn;
  suggestedAnswers: AllAnswers;
  /** Pack-listed rule IDs that must fire. */
  expectedRuleIds: string[];
  /** Pack-listed paragraph IDs that must be included. */
  expectedParagraphIds: string[];
}

// A sensible baseline for the built-in demos.
const OPERATOR = "MetroPark Enforcement Ltd";

/** Example A — Payment + Minor Keying Error. */
const A: DemoScenario = {
  id: "payment_keying",
  label: "Example A — Payment + Minor Keying Error",
  description:
    "Payment made and evidence supplied; a minor keying error was made when entering the vehicle registration.",
  hints: ["payment", "keying", "typo", "example a", "a", "1"],
  pcn: {
    operator_name: OPERATOR,
    pcn_number: "MP/2026/000123",
    vrm: "AB12 CDE",
    parking_location: "Riverside Retail Park, Bristol",
    parking_event_date: "2026-07-14",
    notice_issue_date: "2026-07-16",
    notice_route: "WINDSCREEN",
    charge_amount: 100,
    alleged_breach: "Failure to make a valid payment",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  },
  suggestedAnswers: {
    core: {
      registered_keeper: "YES",
      driver_identified: "NO",
      notice_route: "WINDSCREEN",
      alleged_breach: "Failure to make a valid payment",
      evidence_available: "YES",
      scenarios: ["payment_made", "vrm_error"],
    },
    branch: {
      payment: {
        parking_payment_made: "YES",
        payment_method: "APP",
        payment_evidence_uploaded: "YES",
      },
      keying: {
        vrm_error: "YES",
        vrm_error_type: "MINOR",
        payment_confirmed: "YES",
        entered_vrm: "AB12 CDF",
      },
    },
  },
  expectedRuleIds: ["PP-R006", "PP-R008"],
  expectedParagraphIds: [
    "PP-PAY-001",
    "PP-PAY-002",
    "PP-KEY-001",
    "PP-KEY-002",
    "PP-KEY-004",
  ],
};

/** Example B — Multiple Visits / ANPR. */
const B: DemoScenario = {
  id: "anpr_multiple_visits",
  label: "Example B — Multiple Visits / ANPR",
  description:
    "ANPR relied upon; the vehicle attended more than once and independent evidence contradicts the alleged continuous stay.",
  hints: ["anpr", "multiple", "visits", "example b", "b", "2"],
  pcn: {
    operator_name: OPERATOR,
    pcn_number: "MP/2026/000554",
    vrm: "LP67 XYZ",
    parking_location: "Central Shopping Park, Leeds",
    parking_event_date: "2026-06-20",
    notice_issue_date: "2026-06-24",
    notice_received_date: "2026-06-27",
    notice_route: "POSTAL",
    entry_time: "2026-06-20T09:12:00Z",
    exit_time: "2026-06-20T16:47:00Z",
    total_recorded_duration: 455,
    charge_amount: 100,
    alleged_breach: "Overstaying maximum permitted stay",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  },
  suggestedAnswers: {
    core: {
      registered_keeper: "YES",
      driver_identified: "NO",
      notice_route: "POSTAL",
      alleged_breach: "Overstaying maximum permitted stay",
      evidence_available: "YES",
      scenarios: ["anpr_disputed", "multiple_visits_same_day"],
    },
    branch: {
      anpr: {
        evidence_type: "ANPR",
        customer_disputes_duration: "YES",
        multiple_visits_same_day: "YES",
        evidence_vehicle_elsewhere: "YES",
        external_evidence_contradicts_anpr: "YES",
      },
    },
  },
  expectedRuleIds: ["PP-R012", "PP-R013", "PP-R014"],
  expectedParagraphIds: [
    "PP-ANPR-001",
    "PP-ANPR-002",
    "PP-ANPR-003",
    "PP-ANPR-004",
    "PP-ANPR-005",
    "PP-ANPR-012",
  ],
};

/** Example C — Keeper + Confirmed Late Postal NTK. */
const C: DemoScenario = {
  id: "keeper_late_ntk",
  label: "Example C — Keeper + Confirmed Late Postal NTK",
  description:
    "Postal Notice to Keeper served late; Schedule 4 keeper liability cannot be established.",
  hints: ["keeper", "pofa", "late", "ntk", "example c", "c", "3"],
  pcn: {
    operator_name: OPERATOR,
    pcn_number: "MP/2026/099001",
    vrm: "SK21 WLM",
    parking_location: "Queen Street Car Park, Manchester",
    parking_event_date: "2026-05-02",
    notice_issue_date: "2026-05-20",
    notice_received_date: "2026-05-24",
    notice_route: "POSTAL",
    charge_amount: 100,
    alleged_breach: "Parking without payment",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  },
  suggestedAnswers: {
    core: {
      registered_keeper: "YES",
      driver_identified: "NO",
      notice_route: "POSTAL",
      alleged_breach: "Parking without payment",
      evidence_available: "NO",
      scenarios: ["postal_ntk_timing_issue"],
    },
    branch: {
      keeper: {
        registered_keeper: "YES",
        driver_identified: "NO",
        notice_route: "POSTAL",
        notice_to_keeper_received: "YES",
        parking_to_issue_days: 18,
        issue_to_receipt_days: 4,
        pofa_postal_timing_failure: true,
      },
    },
  },
  expectedRuleIds: ["PP-R001", "PP-R004", "PP-R005B"],
  expectedParagraphIds: [
    "PP-INTRO-001",
    "PP-INTRO-002",
    "PP-POFA-001",
    "PP-POFA-003",
    "PP-POFA-006",
    "PP-POFA-007",
  ],
};

/** Example D — Paid Parking + Short Exit Period. */
const D: DemoScenario = {
  id: "paid_short_exit",
  label: "Example D — Paid Parking + Short Exit Period",
  description:
    "Paid session completed; alleged 8-minute overstay falls within the standard 10-minute end grace period.",
  hints: ["paid", "short exit", "grace", "example d", "d", "4"],
  pcn: {
    operator_name: OPERATOR,
    pcn_number: "MP/2026/000456",
    vrm: "MK18 EEP",
    parking_location: "Central Retail Park, Milton Keynes",
    parking_event_date: "2026-07-01",
    notice_issue_date: "2026-07-05",
    notice_route: "WINDSCREEN",
    total_recorded_duration: 218,
    charge_amount: 100,
    alleged_breach: "Overstay of paid time",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  },
  suggestedAnswers: {
    core: {
      registered_keeper: "YES",
      driver_identified: "NO",
      notice_route: "WINDSCREEN",
      alleged_breach: "Overstay of paid time",
      evidence_available: "NO",
      scenarios: ["grace_or_exit"],
    },
    branch: {
      grace: {
        parking_period_completed: "YES",
        grace_period_applicable: "YES",
        alleged_overstay_minutes: 8,
        standard_10_minute_grace: "APPLICABLE",
      },
    },
  },
  expectedRuleIds: ["PP-R011", "PP-R011A"],
  expectedParagraphIds: ["PP-GRACE-001", "PP-GRACE-005", "PP-GRACE-006"],
};

/**
 * Additional demo cases (not in Part 11) — kept to exercise signage and
 * authorisation routes end-to-end. Their `expectedRuleIds` /
 * `expectedParagraphIds` are used by integration tests to guard against
 * regressions in the rules table.
 */
const E_SIGNAGE: DemoScenario = {
  id: "signage",
  label: "Signage — entrance not visible + specific term unclear",
  description:
    "No prominent entrance signage; the alleged term is inserted verbatim into PP-SIGN-012.",
  hints: ["signage", "sign", "5"],
  pcn: {
    operator_name: OPERATOR,
    pcn_number: "MP/2026/040088",
    vrm: "GK69 TRR",
    parking_location: "Old Mill Yard, Sheffield",
    parking_event_date: "2026-04-11",
    notice_issue_date: "2026-04-13",
    notice_route: "WINDSCREEN",
    charge_amount: 100,
    alleged_breach: "Unauthorised parking after 6pm",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  },
  suggestedAnswers: {
    core: {
      registered_keeper: "YES",
      driver_identified: "NO",
      notice_route: "WINDSCREEN",
      alleged_breach: "Unauthorised parking after 6pm",
      evidence_available: "YES",
      scenarios: ["signage_issue"],
    },
    branch: {
      signage: {
        entrance_sign_visible: "NO",
        relevant_term_unclear: "YES",
        signage_photos_uploaded: "YES",
      },
    },
  },
  expectedRuleIds: ["PP-R023", "PP-R024", "PP-R025"],
  expectedParagraphIds: [
    "PP-SIGN-001",
    "PP-SIGN-002",
    "PP-SIGN-003",
    "PP-SIGN-004",
    "PP-SIGN-012",
    "PP-SIGN-013",
  ],
};

const F_PERMIT: DemoScenario = {
  id: "permit",
  label: "Permit / authorisation — valid resident permit",
  description:
    "Resident permit in force; permission_source = the landlord (used verbatim in PP-AUTH-003).",
  hints: ["permit", "authorisation", "6"],
  pcn: {
    operator_name: OPERATOR,
    pcn_number: "MP/2026/077123",
    vrm: "NW20 RES",
    parking_location: "Beech Grove Residents Car Park, London",
    parking_event_date: "2026-03-08",
    notice_issue_date: "2026-03-10",
    notice_route: "WINDSCREEN",
    charge_amount: 60,
    alleged_breach: "No valid permit displayed",
    case_stage: "INITIAL_OPERATOR_APPEAL",
  },
  suggestedAnswers: {
    core: {
      registered_keeper: "YES",
      driver_identified: "NO",
      notice_route: "WINDSCREEN",
      alleged_breach: "No valid permit displayed",
      evidence_available: "YES",
      scenarios: ["authorised_or_permit"],
    },
    branch: {
      authorisation: {
        parking_authorised: "YES",
        permit_held: "YES",
        permit_type: "RESIDENT",
        permission_granted: "YES",
        permission_source: "the landlord",
        authorisation_evidence_uploaded: "YES",
      },
    },
  },
  expectedRuleIds: ["PP-R018", "PP-R019", "PP-R020"],
  expectedParagraphIds: [
    "PP-AUTH-001",
    "PP-AUTH-002",
    "PP-AUTH-003",
    "PP-AUTH-010",
  ],
};

export const DEMO_SCENARIOS: DemoScenario[] = [A, B, C, D, E_SIGNAGE, F_PERMIT];

export function findDemoScenarioByHint(hint: string | undefined | null): DemoScenario | undefined {
  if (!hint) return undefined;
  const lc = hint.toLowerCase();
  return DEMO_SCENARIOS.find((s) => s.hints.some((h) => lc.includes(h)));
}
