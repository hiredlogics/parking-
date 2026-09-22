import type { RouteFamily } from "@/types/caseState";
import { FACT, factNum, factStr } from "@/lib/questions/facts";
import type { KnownFacts } from "@/lib/questions/types";
import { pofaCanLead } from "./pofa";
import type { PofaAnalysis, RouteAssessment } from "./types";
import { isGraceGroundSupportable } from "@/lib/appeals/graceSupport";

/**
 * Route detection and priority.
 *
 * @deprecated Phase 5 — issue activation is driven by Admin
 * `issues` / `issue_knowledge` via `lib/engine/issueEngine`. This
 * ranking still feeds draft assembly until generation is fully
 * config-driven. Do not extend for questioning; remove in Phase 6–7.
 *
 * MASTER Developer Pack V2 Part 5 (AI issue-spotting hierarchy),
 * KB §16 (drafting priority and suppression) and KB Appendix B (ground
 * selection matrix).
 *
 * Two firm instructions shape this module:
 *   - "Strong primary grounds should not be diluted by generic secondary
 *      arguments." (Part 5)
 *   - "Do not stack every possible ground. Omit weak, contradictory or
 *      unsupported modules." (KB §16 rule 5)
 *
 * So routes are ranked, not merely collected, and unsupported candidates
 * are dropped rather than demoted.
 */

/** Base ranks. Lower leads. Refined per Appendix B below. */
export const BASE_RANK: Record<RouteFamily, number> = {
  POFA: 10,
  RESIDENTIAL: 12,
  BREAKDOWN: 20,
  PAYMENT: 22,
  KEYING: 24,
  EQUALITY: 26,
  HOSPITAL: 28,
  AUTHORIZATION: 30,
  PERMIT: 32,
  ANPR: 34,
  INFRASTRUCTURE: 36,
  EV_CHARGING: 38,
  LOADING: 40,
  DROP_OFF: 42,
  CONSIDERATION: 50,
  GRACE: 52,
  SIGNAGE: 60,
  LANDOWNER: 90,
};

/**
 * Relative strength of a route, 0–1, where 1 is the strongest.
 *
 * Derived from the same Appendix B ranking the analysis layer uses, so
 * question selection and drafting priority cannot disagree. V2 Part 5:
 * "Strong primary grounds should not be diluted by generic secondary
 * arguments" — that applies to what we ASK about, not only what we
 * write.
 */
export function routeStrength(route: RouteFamily): number {
  const rank = BASE_RANK[route];
  if (rank === undefined) return 0;
  // Ranks run 10 (strongest) to 90 (weakest).
  return Math.max(0, Math.min(1, (100 - rank) / 90));
}

export interface RouteInput {
  facts: KnownFacts;
  pofa: PofaAnalysis;
  evidence: Set<string>;
}

interface Candidate {
  route: RouteFamily;
  rank: number;
  basis: string[];
  evidenceBacked: boolean;
}

export function assessRoutes(input: RouteInput): RouteAssessment[] {
  const f = input.facts;
  const out = new Map<RouteFamily, Candidate>();

  const add = (
    route: RouteFamily,
    basis: string,
    opts: { rank?: number; evidenceBacked?: boolean } = {},
  ) => {
    const existing = out.get(route);
    if (existing) {
      existing.basis.push(basis);
      if (opts.rank !== undefined) existing.rank = Math.min(existing.rank, opts.rank);
      if (opts.evidenceBacked) existing.evidenceBacked = true;
      return;
    }
    out.set(route, {
      route,
      rank: opts.rank ?? BASE_RANK[route],
      basis: [basis],
      evidenceBacked: opts.evidenceBacked ?? false,
    });
  };

  const driverUnidentified = factStr(f, FACT.DRIVER_IDENTIFIED) === "NO";

  /* ---------- PoFA — only when a defect is actually established ---------- */
  // Appendix B: "Keeper + valid PoFA defect → PoFA keeper-liability point
  // can lead; do not add invented defects."
  if (pofaCanLead(input.pofa, driverUnidentified)) {
    add(
      "POFA",
      input.pofa.timingStatus === "FAILED"
        ? `Established paragraph ${input.pofa.paragraph} timing failure (${input.pofa.daysLate} day(s) late).`
        : "Confirmed Schedule 4 content defect.",
      { rank: 10, evidenceBacked: true },
    );
  } else if (input.pofa.applicable && driverUnidentified) {
    // The keeper-liability threshold point (KB-POFA-01) is still
    // available, but it is NOT dispositive without an established
    // defect. KB §16 priority 1 requires a *confirmed* dispositive
    // keeper-liability point to lead, so an unconfirmed threshold point
    // sits with the framing/Code tier and must not displace a strong
    // fact-specific ground such as payment or keying.
    add(
      "POFA",
      "Registered keeper with unidentified driver — keeper liability must be established, but no specific Schedule 4 defect is alleged.",
      { rank: 55 },
    );
  }

  /* ---------- Residential (V2 Part 7) ---------- */
  if (f.tags.has("resident_parking_rights")) {
    const uploaded = factStr(f, FACT.AGREEMENT_UPLOADED) === "YES";
    if (uploaded) {
      // Appendix B: "Resident + lease uploaded → read lease first;
      // residential rights/primacy before permit-display."
      add(
        "RESIDENTIAL",
        "Occupier relies on an uploaded lease, tenancy or parking grant — the instrument is the starting point.",
        { rank: 12, evidenceBacked: true },
      );
    } else {
      // KB-RES-01: do not assert primacy merely because the appellant is
      // a resident. Without the instrument this is a weak ground.
      add(
        "RESIDENTIAL",
        "Resident status asserted but no agreement provided — the underlying right cannot be analysed.",
        { rank: 46 },
      );
    }
  }

  /* ---------- Breakdown (V2 Part 6) ---------- */
  if (f.tags.has("breakdown_immobilised")) {
    const prevented = factStr(f, FACT.BREAKDOWN_PREVENTED_DEPARTURE) === "YES";
    const ev = Array.isArray(f.values[FACT.BREAKDOWN_EVIDENCE])
      ? (f.values[FACT.BREAKDOWN_EVIDENCE] as string[]).filter((e) => e !== "none")
      : [];
    if (prevented) {
      // Appendix B: "Breakdown evidence present → BREAKDOWN current-Code
      // route first; frustration/impossibility second if facts support."
      add(
        "BREAKDOWN",
        ev.length > 0
          ? "Genuine immobilisation prevented departure, supported by contemporaneous evidence."
          : "Genuine immobilisation prevented departure, but no supporting evidence is available.",
        { rank: ev.length > 0 ? 14 : 25, evidenceBacked: ev.length > 0 },
      );
    } else {
      // KB-BREAK-02: otherwise assess as ordinary delay, not breakdown.
      add(
        "BREAKDOWN",
        "A mechanical issue is reported but it is not established that departure or compliance was prevented.",
        { rank: 48 },
      );
    }
  }

  /* ---------- Payment / keying ---------- */
  const paid =
    f.tags.has("payment_made") ||
    factStr(f, FACT.PAYMENT_MADE) === "YES";
  const attempted =
    f.tags.has("payment_attempted_failed") ||
    factStr(f, FACT.PAYMENT_MADE) === "ATTEMPTED_FAILED";
  if (paid || attempted) {
    const evOk = factStr(f, FACT.PAYMENT_EVIDENCE) === "YES";
    // Only treat as a strong payment ground when status or evidence supports it.
    if (factStr(f, FACT.PAYMENT_MADE) || evOk || f.evidence.has("payment_receipt")) {
      add(
        "PAYMENT",
        paid
          ? "A payment was made for the parking event; the operator must reconcile its transaction records."
          : "A genuine payment attempt was prevented by the payment mechanism provided.",
        { rank: paid ? 22 : 27, evidenceBacked: evOk },
      );
    }
  }
  if (
    f.tags.has("vrm_error") &&
    (factStr(f, FACT.VRM_ENTERED) !== null ||
      factStr(f, FACT.KEYING_ERROR) === "YES")
  ) {
    add(
      "KEYING",
      "A registration-entry error accompanied a payment — transaction matching and the keying-error requirements apply.",
      { rank: paid ? 20 : 30, evidenceBacked: factStr(f, FACT.VRM_ENTERED) !== null },
    );
  }

  /* ---------- ANPR / duration ---------- */
  const visits = factNum(f, FACT.VISIT_COUNT);
  if (f.tags.has("multiple_visits_same_day") || (visits !== null && visits > 1)) {
    // Appendix B: "ANPR + two visits → multiple-visit/full-sequence route
    // before generic camera maintenance."
    add(
      "ANPR",
      `The vehicle attended on more than one occasion${visits ? ` (${visits} visits)` : ""} — the complete capture sequence must be reviewed rather than a first-entry/last-exit pairing.`,
      { rank: 24, evidenceBacked: true },
    );
  }
  if (f.tags.has("anpr_disputed")) {
    const detail = factStr(f, FACT.CONTINUOUS_PRESENCE);
    add(
      "ANPR",
      detail
        ? "A specific discrepancy in the times or images relied upon has been identified."
        : "Camera evidence is disputed but no specific discrepancy has been identified.",
      { rank: detail ? 26 : 44, evidenceBacked: Boolean(detail) },
    );
  }

  /* ---------- Consideration / grace ----------
   * Situation tags only hint. Grace opens only when end-of-parking
   * facts are supportable (short overstay / exit delay — not a long stay).
   */
  {
    const initialReason = factStr(f, FACT.INITIAL_PERIOD_REASON);
    if (initialReason) {
      add(
        "CONSIDERATION",
        "Time was required on entry before any parking terms could reasonably be accepted.",
        { rank: 50, evidenceBacked: true },
      );
    }

    const exitReason = factStr(f, FACT.EXIT_DELAY_REASON);
    const departure = factStr(f, FACT.DEPARTURE_DELAY);
    const duration = factNum(f, FACT.TOTAL_RECORDED_DURATION);
    const overstayRaw = f.values["alleged_overstay_minutes"];
    const overstay =
      typeof overstayRaw === "number" ? overstayRaw : null;
    const graceOk = isGraceGroundSupportable({
      totalRecordedDurationMinutes: duration,
      entryTime: factStr(f, FACT.ENTRY_TIME),
      exitTime: factStr(f, FACT.EXIT_TIME),
      exitDelayReason: exitReason ?? departure,
      allegedOverstayMinutes: overstay,
      gracePeriodApplicable: factStr(f, "grace_period_applicable"),
    });

    if (graceOk.ok) {
      add("GRACE", graceOk.reason, {
        rank: 52,
        evidenceBacked: Boolean(exitReason || departure || overstay != null),
      });
    }
  }

  /* ---------- Authorisation / permit ---------- */
  {
    const source = factStr(f, FACT.PERMISSION_SOURCE);
    const held = factStr(f, FACT.PERMISSION_HELD) === "YES";
    const occupier = factStr(f, FACT.OCCUPIER_STATUS);
    if (held || source || occupier) {
      add(
        "AUTHORIZATION",
        source
          ? `Permission to park derived from: ${source}. The underlying authorisation is analysed before any display or registration mismatch.`
          : "Permission to park is supported by the customer's account; the underlying authorisation must be analysed.",
        { rank: 30, evidenceBacked: Boolean(source) || held },
      );
      if (held || source) {
        add("PERMIT", "A permit or whitelist entitlement is relied upon.", {
          rank: 32,
        });
      }
    }
  }

  /* ---------- Equality ---------- */
  if (f.tags.has("accessibility_additional_time")) {
    const why = factStr(f, FACT.ADDITIONAL_TIME_NEEDED);
    add(
      "EQUALITY",
      why
        ? "Disability-related circumstances required additional time, with an explanation of how that relates to the allegation."
        : "Additional time is asserted on disability-related grounds but the connection to the allegation is not established.",
      { rank: why ? 26 : 55, evidenceBacked: Boolean(why) },
    );
  }

  /* ---------- Hospital ---------- */
  if (f.tags.has("hospital_attendance")) {
    const kind = factStr(f, FACT.HOSPITAL_ATTENDANCE);
    // Appendix B: "Hospital emergency → hospital/emergency/Code route;
    // Equality Act only if relevant facts exist."
    add(
      "HOSPITAL",
      `Parking connected with hospital or medical attendance${kind ? ` (${kind})` : ""}.`,
      { rank: kind === "emergency" ? 18 : 28, evidenceBacked: Boolean(kind) },
    );
  }

  /* ---------- Activity / EV / infrastructure ---------- */
  if (f.tags.has("loading_or_dropoff")) {
    const kind = factStr(f, FACT.ACTIVITY_TYPE);
    if (kind === "dropoff") {
      add("DROP_OFF", "The vehicle stopped briefly to drop off or collect a passenger.", {
        rank: 42,
      });
    } else {
      add("LOADING", `Non-parking activity: ${kind ?? "loading or unloading"}.`, {
        rank: 40,
      });
    }
  }
  if (f.tags.has("ev_charging")) {
    add(
      "EV_CHARGING",
      "The vehicle was engaged in a genuine charging session; charging terms are analysed separately from parking terms.",
      { rank: 38, evidenceBacked: factStr(f, FACT.CHARGING_SESSION) === "YES" },
    );
  }
  if (f.tags.has("barrier_or_access_failure")) {
    add(
      "INFRASTRUCTURE",
      "Entry, exit or compliance was affected by site infrastructure rather than a voluntary decision to remain.",
      { rank: 36, evidenceBacked: factStr(f, FACT.BARRIER_FAILURE) !== null },
    );
  }

  /* ---------- Signage ---------- */
  if (f.tags.has("signage_issue")) {
    const basis = Array.isArray(f.values[FACT.SIGNAGE_ISSUE_BASIS])
      ? (f.values[FACT.SIGNAGE_ISSUE_BASIS] as string[])
      : [];
    add(
      "SIGNAGE",
      basis.length > 0
        ? `Specific signage issues identified: ${basis.join(", ")}.`
        : "A signage issue is asserted without a specific factual basis.",
      { rank: 60, evidenceBacked: basis.length > 0 },
    );
  }

  /* ---------- Landowner authority — concise at initial stage ---------- */
  if (f.tags.has("landowner_authority_challenge")) {
    add(
      "LANDOWNER",
      "A proportionate request that the operator establish its authority for the site and material date.",
      { rank: 90 },
    );
  }

  /* ---------- Suppression (KB §16 rule 5) ---------- */
  // Drop generic signage where a strong, evidence-backed primary ground
  // already leads: Appendix B puts payment/keying and multiple-visit
  // routes ahead of generic signage, and rule 5 forbids stacking.
  const strongLead = [...out.values()].some((c) => c.rank <= 24 && c.evidenceBacked);
  if (strongLead) {
    const signage = out.get("SIGNAGE");
    if (signage && !signage.evidenceBacked) out.delete("SIGNAGE");
    const landowner = out.get("LANDOWNER");
    if (landowner && !landowner.evidenceBacked) out.delete("LANDOWNER");
  }

  // Residential rights supersede a generic permit argument (Appendix B).
  const residential = out.get("RESIDENTIAL");
  if (residential && residential.evidenceBacked) {
    out.delete("PERMIT");
  }

  return [...out.values()]
    .sort((a, b) => a.rank - b.rank || a.route.localeCompare(b.route))
    .map((c) => ({
      route: c.route,
      rank: c.rank,
      basis: c.basis,
      moduleIds: [],
      evidenceBacked: c.evidenceBacked,
    }));
}
