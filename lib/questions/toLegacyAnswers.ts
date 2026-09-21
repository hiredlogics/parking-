import type {
  AllAnswers,
  BranchAnswers,
  CoreAnswers,
  ScenarioTag as LegacyScenarioTag,
  YesNoUnsure,
} from "@/types";
import { EMPTY_ANSWERS } from "@/types";
import { FACT } from "./facts";
import type { AnswerMap, AnswerValue } from "./types";

/**
 * Bridge the adaptive engine onto the existing deterministic pipeline.
 *
 * V2 Part 14 demotes the rules engine from "primary legal selector" to
 * "guardrails and hard checks" — it does not delete it. So the adaptive
 * answers are mapped onto the legacy `AllAnswers` shape, keeping
 * `/appeal/review`, the rules engine and the keeper-safe validator fully
 * operational while the customer experience becomes one-question-at-a-time.
 *
 * Only facts the customer actually established are written. Nothing is
 * inferred or invented here.
 */

const LEGACY_TAGS: LegacyScenarioTag[] = [
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
  "signage_issue",
  "landowner_authority_challenge",
  "other_grounds",
  "no_ntk_received",
  "postal_ntk_timing_issue",
];
const LEGACY_TAG_SET = new Set<string>(LEGACY_TAGS);

const str = (v: AnswerValue | undefined): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v : null;
const list = (v: AnswerValue | undefined): string[] =>
  Array.isArray(v) ? v : [];
const num = (v: AnswerValue | undefined): number | null =>
  typeof v === "number" && !Number.isNaN(v) ? v : null;

const yn = (v: AnswerValue | undefined): YesNoUnsure | undefined => {
  const s = str(v);
  return s === "YES" || s === "NO" || s === "UNSURE" ? s : undefined;
};

/** Map the adaptive payment method vocabulary onto the legacy enum. */
function legacyPaymentMethod(
  v: AnswerValue | undefined,
): NonNullable<BranchAnswers["payment"]>["payment_method"] {
  switch (str(v)) {
    case "app": return "APP";
    case "machine": return "MACHINE";
    case "phone": return "PHONE";
    case "online": return "ONLINE";
    case "other": return "OTHER";
    default: return undefined;
  }
}

function legacyPermitType(
  v: AnswerValue | undefined,
): NonNullable<BranchAnswers["authorisation"]>["permit_type"] {
  switch (str(v)) {
    case "resident_permit": return "RESIDENT";
    case "employer": return "EMPLOYER";
    case "hotel_or_business": return "HOTEL";
    case "visitor_permit": return "VISITOR";
    case "landowner": return "OTHER";
    default: return "OTHER";
  }
}

export function toLegacyAnswers(adaptive: AnswerMap): AllAnswers {
  const core: CoreAnswers = { ...EMPTY_ANSWERS.core, scenarios: [] };
  const branch: BranchAnswers = {};

  /* ---------------- Core ---------------- */
  core.registered_keeper = yn(adaptive[FACT.REGISTERED_KEEPER]);
  core.driver_identified = yn(adaptive[FACT.DRIVER_IDENTIFIED]);

  const route = str(adaptive[FACT.NOTICE_ROUTE]);
  if (route === "POSTAL" || route === "WINDSCREEN" || route === "UNKNOWN") {
    core.notice_route = route;
  }
  const breach = str(adaptive[FACT.ALLEGED_BREACH]);
  if (breach) core.alleged_breach = breach;

  const tags = list(adaptive[FACT.SCENARIOS]);
  core.scenarios = tags.filter((t): t is LegacyScenarioTag =>
    LEGACY_TAG_SET.has(t),
  );

  const has = (t: string) => tags.includes(t);

  /* ---------------- Keeper / PoFA ---------------- */
  if (
    (core.registered_keeper === "YES" && core.driver_identified === "NO") ||
    has("no_ntk_received") ||
    has("postal_ntk_timing_issue") ||
    core.notice_route === "POSTAL"
  ) {
    branch.keeper = {
      registered_keeper: core.registered_keeper,
      driver_identified: core.driver_identified,
      notice_route: core.notice_route,
      notice_to_keeper_received: has("no_ntk_received") ? "NO" : undefined,
    };
  }

  /* ---------------- Payment ---------------- */
  if (has("payment_made") || has("payment_attempted_failed")) {
    const method = legacyPaymentMethod(adaptive[FACT.PAYMENT_METHOD]);
    branch.payment = {
      parking_payment_made: has("payment_made") ? "YES" : undefined,
      payment_attempted: has("payment_attempted_failed") ? "YES" : undefined,
      payment_completed: has("payment_made")
        ? "YES"
        : has("payment_attempted_failed")
          ? "NO"
          : undefined,
      payment_method: method,
      payment_evidence_uploaded: yn(adaptive[FACT.PAYMENT_EVIDENCE]),
      machine_problem:
        has("payment_attempted_failed") && method === "MACHINE" ? "YES" : undefined,
      payment_system_problem:
        has("payment_attempted_failed") && (method === "APP" || method === "ONLINE")
          ? "YES"
          : undefined,
    };
  }

  /* ---------------- Keying ---------------- */
  if (has("vrm_error")) {
    const entered = str(adaptive[FACT.VRM_ENTERED]);
    branch.keying = {
      vrm_error: "YES",
      vrm_error_type: "MINOR",
      payment_confirmed: has("payment_made") ? "YES" : undefined,
      entered_vrm: entered ?? undefined,
    };
  }

  /* ---------------- Consideration ---------------- */
  if (has("short_stay_consideration")) {
    branch.consideration = {
      short_stay: "YES",
      consideration_reason: "OTHER",
      parking_took_place: "UNSURE",
    };
  }

  /* ---------------- Grace / exit ---------------- */
  if (has("grace_or_exit")) {
    branch.grace = {
      parking_period_completed: "YES",
      additional_exit_time_required: "YES",
      exit_reason: has("accessibility_additional_time")
        ? "ACCESSIBILITY"
        : "OTHER",
      exit_delay: has("barrier_or_access_failure") ? "CONGESTION" : "OTHER",
    };
  }

  /* ---------------- ANPR ---------------- */
  if (has("anpr_disputed") || has("multiple_visits_same_day")) {
    const visits = num(adaptive[FACT.VISIT_COUNT]);
    const continuous = str(adaptive[FACT.CONTINUOUS_PRESENCE]);
    const images = str(adaptive[FACT.ANPR_IMAGES_ON_NOTICE]);
    const leftSite = str(adaptive[FACT.VEHICLE_LEFT_SITE_EVIDENCE]);
    const timestamp = str(adaptive[FACT.TIMESTAMP_DISCREPANCY]);
    branch.anpr = {
      evidence_type: images === "OTHER" ? "OTHER" : "ANPR",
      customer_disputes_duration:
        has("anpr_disputed") || timestamp === "YES" || continuous === "NO"
          ? "YES"
          : undefined,
      multiple_visits_same_day:
        has("multiple_visits_same_day") ||
        (visits !== null && visits > 1) ||
        continuous === "NO"
          ? "YES"
          : undefined,
      incorrect_pairing_suspected:
        (visits !== null && visits > 1) || continuous === "NO"
          ? "YES"
          : undefined,
      evidence_vehicle_elsewhere: leftSite === "YES" ? "YES" : undefined,
      timestamp_discrepancy_detected:
        timestamp === "YES" ? "YES" : timestamp === "NO" ? "NO" : undefined,
    };
  }

  /* ---------------- Authorisation / permit ---------------- */
  if (has("authorised_or_permit") || has("resident_parking_rights")) {
    const source = str(adaptive[FACT.PERMISSION_SOURCE]);
    branch.authorisation = {
      parking_authorised: "YES",
      permit_held: has("authorised_or_permit") ? "YES" : undefined,
      permit_type: has("authorised_or_permit")
        ? legacyPermitType(adaptive[FACT.PERMISSION_SOURCE])
        : has("resident_parking_rights")
          ? "RESIDENT"
          : undefined,
      permission_source: source ?? undefined,
      visitor_permission: source === "visitor_permit" ? "YES" : undefined,
    };
  }

  /* ---------------- Signage ---------------- */
  if (has("signage_issue")) {
    const basis = new Set(list(adaptive[FACT.SIGNAGE_ISSUE_BASIS]));
    branch.signage = {
      entrance_sign_visible: basis.has("no_entrance_sign") ? "NO" : undefined,
      relevant_term_unclear: basis.has("term_not_prominent") ? "YES" : undefined,
      parking_charge_not_prominent: basis.has("charge_not_prominent")
        ? "YES"
        : undefined,
      conflicting_signage: basis.has("conflicting_signs") ? "YES" : undefined,
      sign_obscured: basis.has("obscured_or_damaged") ? "YES" : undefined,
    };
  }

  /* ---------------- Landowner ---------------- */
  if (has("landowner_authority_challenge")) {
    branch.landowner = { operator_landowner: "UNSURE" };
  }

  return { core, branch };
}
