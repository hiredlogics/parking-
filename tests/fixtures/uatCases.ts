/**
 * The real UAT fixture set — one confirmed notice + answer set per
 * supported issue type, plus one intentionally-unsupported case
 * (UAT-11). Originally private to tests/unit/retrievalDeterminism.test.ts;
 * shared here so tests/integration/pipelineAccuracy.test.ts can drive
 * the SAME inputs all the way through drafting and validation rather
 * than risking a second, silently-drifting fixture set.
 */
import type { ConfirmedPcn } from "@/types";
import { FACT } from "@/lib/facts/facts";
import type { AnswerMap } from "@/lib/facts/types";

export const BASE = {
  operator_name: "CitySquare Parking Management",
  pcn_number: "CSP-120726-73104",
  vrm: "KT19 RPL",
  parking_location: "Harbour Point, Bristol",
  parking_event_date: "2026-07-12",
  notice_issue_date: "2026-07-18",
  notice_received_date: "2026-07-22",
  notice_route: "POSTAL",
  charge_amount: 100,
  confirmedAt: "2026-07-23T00:00:00.000Z",
};

export const TRIAGE: AnswerMap = {
  [FACT.JURISDICTION]: "ENGLAND_WALES",
  [FACT.VEHICLE_HIRE_STATUS]: "PRIVATE",
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
};

export interface UatFixture {
  id: string;
  confirmed: ConfirmedPcn;
  answers: AnswerMap;
  evidenceTypes: string[];
}

/** The same eleven fixtures the real UAT harness uses. */
export const UAT_FIXTURES: UatFixture[] = [
  {
    id: "UAT-1",
    confirmed: { ...BASE, alleged_breach: "Failure to make a valid payment" } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["payment_made", "vrm_error"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "machine",
      [FACT.PAYMENT_EVIDENCE]: "YES",
      [FACT.VRM_ENTERED]: "KT19 RPI",
      [FACT.KEYING_ERROR]: "YES",
    },
    evidenceTypes: ["payment_receipt"],
  },
  {
    id: "UAT-2",
    confirmed: {
      ...BASE, alleged_breach: "Overstaying maximum permitted stay",
      entry_time: "10:02", exit_time: "12:49", total_recorded_duration: 167,
    } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["breakdown_immobilised"],
      [FACT.BREAKDOWN_OCCURRED]: "YES",
      [FACT.BREAKDOWN_PREVENTED_DEPARTURE]: "YES",
      [FACT.BREAKDOWN_NATURE]: "mechanical_failure",
      [FACT.BREAKDOWN_EVIDENCE]: ["recovery_report"],
      [FACT.RECOVERY_ATTENDANCE]: "YES",
    },
    evidenceTypes: ["breakdown_evidence"],
  },
  {
    id: "UAT-3",
    confirmed: { ...BASE, alleged_breach: "No valid permit displayed" } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["resident_parking_rights"],
      [FACT.OCCUPIER_STATUS]: "tenant",
      [FACT.AGREEMENT_UPLOADED]: "YES",
      [FACT.AGREEMENT_PERMIT_CLAUSE]: "NO",
      [FACT.BAY_REFERENCE]: "Bay 14",
    },
    evidenceTypes: ["authorisation_evidence"],
  },
  {
    id: "UAT-4",
    confirmed: {
      ...BASE, alleged_breach: "Parking without payment",
      parking_event_date: "2026-05-01",
      notice_issue_date: "2026-07-01",
      notice_received_date: "2026-07-05",
    } as ConfirmedPcn,
    answers: { ...TRIAGE, [FACT.SCENARIOS]: ["postal_ntk_timing_issue"] },
    evidenceTypes: [],
  },
  {
    id: "UAT-5",
    confirmed: {
      ...BASE, alleged_breach: "Overstay of paid time",
      entry_time: "09:14", exit_time: "17:22", total_recorded_duration: 488,
    } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["multiple_visits_same_day", "anpr_disputed"],
      [FACT.CONTINUOUS_PRESENCE]: "NO",
      [FACT.VISIT_COUNT]: 2,
    },
    evidenceTypes: ["anpr_evidence"],
  },
  {
    id: "UAT-6",
    confirmed: {
      ...BASE, alleged_breach: "Parking without payment",
      entry_time: "14:00", exit_time: "14:07", total_recorded_duration: 7,
    } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["short_stay_consideration"],
      [FACT.INITIAL_PERIOD_REASON]: "no_spaces_available",
      [FACT.PARKING_ACCEPTED]: "NO",
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-7",
    confirmed: {
      ...BASE, alleged_breach: "Overstaying maximum permitted stay",
      entry_time: "11:00", exit_time: "13:09", total_recorded_duration: 129,
    } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["grace_or_exit"],
      [FACT.EXIT_DELAY_REASON]: "queue_at_exit_barrier",
      [FACT.DEPARTURE_DELAY]: "YES",
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-8",
    confirmed: { ...BASE, alleged_breach: "Unauthorised parking after 6pm" } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["authorised_or_permit"],
      [FACT.PERMISSION_HELD]: "YES",
      [FACT.PERMISSION_SOURCE]: "landowner",
      [FACT.AUTHORISATION_EVIDENCE]: "YES",
    },
    evidenceTypes: ["permit"],
  },
  {
    id: "UAT-9",
    confirmed: {
      ...BASE, alleged_breach: "Overstaying maximum permitted stay",
      total_recorded_duration: 95,
    } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["accessibility_additional_time"],
      [FACT.ADDITIONAL_TIME_NEEDED]: "YES",
    },
    evidenceTypes: [],
  },
  {
    id: "UAT-10",
    confirmed: {
      ...BASE, alleged_breach: "Failure to make a valid payment",
      parking_event_date: "2026-05-01",
      notice_issue_date: "2026-07-01",
      notice_received_date: "2026-07-05",
      entry_time: "08:40", exit_time: "16:05",
    } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["payment_made", "multiple_visits_same_day", "postal_ntk_timing_issue"],
      [FACT.PAYMENT_MADE]: "YES",
      [FACT.PAYMENT_METHOD]: "app",
      [FACT.PAYMENT_EVIDENCE]: "YES",
      [FACT.CONTINUOUS_PRESENCE]: "NO",
      [FACT.VISIT_COUNT]: 2,
    },
    evidenceTypes: ["payment_receipt", "anpr_evidence"],
  },
  {
    id: "UAT-11",
    confirmed: { ...BASE, alleged_breach: "No valid permit displayed" } as ConfirmedPcn,
    answers: {
      ...TRIAGE,
      [FACT.SCENARIOS]: ["resident_parking_rights"],
      [FACT.OCCUPIER_STATUS]: "tenant",
      [FACT.AGREEMENT_UPLOADED]: "NO",
    },
    evidenceTypes: [],
  },
];

export const byUatId = (id: string): UatFixture => {
  const f = UAT_FIXTURES.find((x) => x.id === id);
  if (!f) throw new Error(`unknown UAT fixture: ${id}`);
  return f;
};
