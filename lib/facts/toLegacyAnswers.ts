import type {
  AllAnswers,
  BranchAnswers,
  ConfirmedPcn,
  CoreAnswers,
  ScenarioTag as LegacyScenarioTag,
  YesNoUnsure,
} from "@/types";
import { EMPTY_ANSWERS } from "@/types";
import { FACT } from "./facts";
import type { AnswerMap, AnswerValue } from "./types";
import { isGraceGroundSupportable } from "@/lib/appeals/graceSupport";

/**
 * Bridge the adaptive engine onto the existing deterministic pipeline.
 *
 * Situation tags (scenarios) are customer-reported circumstances used to
 * drive follow-up questions. They are NOT sufficient on their own to
 * invent affirmative branch facts that force appeal grounds.
 *
 * Only facts the customer actually established (or clear answers to
 * follow-ups) are written into the legacy shape for the rules engine.
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
    case "app":
      return "APP";
    case "machine":
      return "MACHINE";
    case "phone":
      return "PHONE";
    case "online":
      return "ONLINE";
    case "other":
      return "OTHER";
    default:
      return undefined;
  }
}

function legacyPermitType(
  v: AnswerValue | undefined,
): NonNullable<BranchAnswers["authorisation"]>["permit_type"] {
  switch (str(v)) {
    case "resident_permit":
      return "RESIDENT";
    case "employer":
      return "EMPLOYER";
    case "hotel_or_business":
      return "HOTEL";
    case "visitor_permit":
      return "VISITOR";
    case "landowner":
      return "OTHER";
    default:
      return "OTHER";
  }
}

export function toLegacyAnswers(
  adaptive: AnswerMap,
  confirmed?: ConfirmedPcn | null,
): AllAnswers {
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

  /* ---------------- Payment — from answered payment status, not tag alone ---------- */
  {
    const payStatus = str(adaptive[FACT.PAYMENT_MADE]);
    const method = legacyPaymentMethod(adaptive[FACT.PAYMENT_METHOD]);
    const evidence = yn(adaptive[FACT.PAYMENT_EVIDENCE]);
    const paid =
      payStatus === "YES" ||
      (payStatus === null && has("payment_made") && evidence === "YES");
    const attempted =
      payStatus === "ATTEMPTED_FAILED" ||
      (payStatus === null && has("payment_attempted_failed") && Boolean(method));

    if (paid || attempted || payStatus === "NO" || payStatus === "UNSURE") {
      branch.payment = {
        parking_payment_made: paid
          ? "YES"
          : payStatus === "NO"
            ? "NO"
            : payStatus === "UNSURE"
              ? "UNSURE"
              : undefined,
        payment_attempted: attempted ? "YES" : undefined,
        payment_completed: paid ? "YES" : attempted ? "NO" : undefined,
        payment_method: method,
        payment_evidence_uploaded: evidence,
        machine_problem:
          attempted && method === "MACHINE" ? "YES" : undefined,
        payment_system_problem:
          attempted && (method === "APP" || method === "ONLINE")
            ? "YES"
            : undefined,
      };
    }
  }

  /* ---------------- Keying — require an entered VRM or keying answer ---------- */
  {
    const entered = str(adaptive[FACT.VRM_ENTERED]);
    const keying = yn(adaptive[FACT.KEYING_ERROR]);
    if (entered || keying === "YES") {
      branch.keying = {
        vrm_error: "YES",
        vrm_error_type: "MINOR",
        payment_confirmed:
          str(adaptive[FACT.PAYMENT_MADE]) === "YES" ? "YES" : undefined,
        entered_vrm: entered ?? undefined,
      };
    }
  }

  /* ---------------- Consideration — only with an answered reason ---------- */
  {
    const reason = str(adaptive[FACT.INITIAL_PERIOD_REASON]);
    if (reason) {
      branch.consideration = {
        short_stay: "YES",
        consideration_reason: "OTHER",
        parking_took_place: "UNSURE",
      };
    }
  }

  /* ---------------- Grace / exit — only when facts support end-grace ---------- */
  {
    const exitReason = str(adaptive[FACT.EXIT_DELAY_REASON]);
    const departure = str(adaptive[FACT.DEPARTURE_DELAY]);
    const duration =
      num(adaptive[FACT.TOTAL_RECORDED_DURATION]) ??
      (typeof confirmed?.total_recorded_duration === "number"
        ? confirmed.total_recorded_duration
        : null);
    const overstay = num(adaptive["alleged_overstay_minutes"]);
    const support = isGraceGroundSupportable({
      totalRecordedDurationMinutes: duration,
      entryTime:
        str(adaptive[FACT.ENTRY_TIME]) ?? confirmed?.entry_time ?? null,
      exitTime: str(adaptive[FACT.EXIT_TIME]) ?? confirmed?.exit_time ?? null,
      exitDelayReason: exitReason ?? departure,
      allegedOverstayMinutes: overstay,
      gracePeriodApplicable: str(adaptive["grace_period_applicable"]),
    });
    if (support.ok && (exitReason || departure || overstay != null)) {
      branch.grace = {
        parking_period_completed: "YES",
        additional_exit_time_required: "YES",
        exit_reason: "OTHER",
        exit_delay: "OTHER",
        ...(typeof overstay === "number"
          ? { alleged_overstay_minutes: overstay }
          : {}),
      };
    }
  }

  /* ---------------- ANPR — from answered visit/continuity facts ---------- */
  {
    const visits = num(adaptive[FACT.VISIT_COUNT]);
    const continuous = str(adaptive[FACT.CONTINUOUS_PRESENCE]);
    const images = str(adaptive[FACT.ANPR_IMAGES_ON_NOTICE]);
    const leftSite = str(adaptive[FACT.VEHICLE_LEFT_SITE_EVIDENCE]);
    const timestamp = str(adaptive[FACT.TIMESTAMP_DISCREPANCY]);
    const hasAnprFacts =
      visits !== null ||
      continuous !== null ||
      leftSite !== null ||
      timestamp !== null ||
      images !== null;

    if (hasAnprFacts) {
      branch.anpr = {
        evidence_type: images === "OTHER" ? "OTHER" : "ANPR",
        customer_disputes_duration:
          timestamp === "YES" || continuous === "NO" ? "YES" : undefined,
        multiple_visits_same_day:
          (visits !== null && visits > 1) || continuous === "NO"
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
  }

  /* ---------------- Authorisation / permit — require supporting answers ---------- */
  {
    const source = str(adaptive[FACT.PERMISSION_SOURCE]);
    const held = yn(adaptive[FACT.PERMISSION_HELD]);
    const occupier = str(adaptive[FACT.OCCUPIER_STATUS]);
    const agreement = yn(adaptive[FACT.AGREEMENT_UPLOADED]);

    if (held === "YES" || source || occupier || agreement === "YES") {
      branch.authorisation = {
        parking_authorised: "YES",
        permit_held: held === "YES" || Boolean(source) ? "YES" : undefined,
        permit_type: source
          ? legacyPermitType(adaptive[FACT.PERMISSION_SOURCE])
          : occupier
            ? "RESIDENT"
            : undefined,
        permission_source: source ?? undefined,
        visitor_permission: source === "visitor_permit" ? "YES" : undefined,
      };
    }
  }

  /* ---------------- Signage — only from answered basis selections ---------- */
  {
    const basis = new Set(list(adaptive[FACT.SIGNAGE_ISSUE_BASIS]));
    if (basis.size > 0) {
      branch.signage = {
        entrance_sign_visible: basis.has("no_entrance_sign") ? "NO" : undefined,
        relevant_term_unclear: basis.has("term_not_prominent")
          ? "YES"
          : undefined,
        parking_charge_not_prominent: basis.has("charge_not_prominent")
          ? "YES"
          : undefined,
        conflicting_signage: basis.has("conflicting_signs") ? "YES" : undefined,
        sign_obscured: basis.has("obscured_or_damaged") ? "YES" : undefined,
      };
    }
  }

  /* ---------------- Landowner — only if expressly answered ---------- */
  // Do not invent landowner challenge from a free-text "other" alone.

  return { core, branch };
}
