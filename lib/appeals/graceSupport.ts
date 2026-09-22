/**
 * Whether an end-of-parking grace argument is factually supportable.
 *
 * Grace is a short allowance after a permitted period ends (typically
 * around 10 minutes). A multi-hour ANPR stay without a quantified short
 * overstay is not a grace case — even if the customer selected that
 * situation category.
 */

export interface GraceSupportInput {
  /** Total recorded stay in minutes (from the notice), if known. */
  totalRecordedDurationMinutes?: number | null;
  entryTime?: string | null;
  exitTime?: string | null;
  /** Customer account of why exit was delayed. */
  exitDelayReason?: string | null;
  /** Explicit overstay after permitted end, if known. */
  allegedOverstayMinutes?: number | null;
  /** Deterministic flag that grace applies. */
  gracePeriodApplicable?: string | null;
}

export interface GraceSupportResult {
  ok: boolean;
  reason: string;
}

/** Standard Code-style end grace used as an upper bound when assessing soft grace. */
export const STANDARD_GRACE_MINUTES = 10;

/** Stays longer than this without a quantified short overstay are not grace cases. */
export const LONG_STAY_WITHOUT_OVERSTAY_MINUTES = 90;

function parseClockToMinutes(raw: string): number | null {
  const s = raw.trim();
  // HH:MM or H:MM (optional am/pm)
  const m12 = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(s);
  if (m12) {
    let h = Number(m12[1]);
    const min = Number(m12[2]);
    const ap = m12[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  // ISO datetime — take time portion
  const iso = /T(\d{2}):(\d{2})/.exec(s);
  if (iso) return Number(iso[1]) * 60 + Number(iso[2]);
  return null;
}

/** Best-effort duration from total field or entry/exit clocks. */
export function resolveRecordedDurationMinutes(input: {
  totalRecordedDurationMinutes?: number | null;
  entryTime?: string | null;
  exitTime?: string | null;
}): number | null {
  if (
    typeof input.totalRecordedDurationMinutes === "number" &&
    Number.isFinite(input.totalRecordedDurationMinutes) &&
    input.totalRecordedDurationMinutes >= 0
  ) {
    return input.totalRecordedDurationMinutes;
  }
  if (!input.entryTime || !input.exitTime) return null;
  const a = parseClockToMinutes(String(input.entryTime));
  const b = parseClockToMinutes(String(input.exitTime));
  if (a == null || b == null) return null;
  let diff = b - a;
  if (diff < 0) diff += 24 * 60; // crossed midnight
  return diff;
}

/**
 * True only when facts support arguing end-of-parking grace.
 * Customer situation tags are deliberately ignored here.
 */
export function isGraceGroundSupportable(
  input: GraceSupportInput,
): GraceSupportResult {
  const overstay = input.allegedOverstayMinutes;
  if (typeof overstay === "number" && Number.isFinite(overstay)) {
    if (overstay < 0) {
      return { ok: false, reason: "Negative overstay figure." };
    }
    if (overstay > STANDARD_GRACE_MINUTES) {
      return {
        ok: false,
        reason: `Overstay ${overstay} min exceeds standard end grace.`,
      };
    }
    // Short quantified overstay — grace can be argued.
    return { ok: true, reason: `Overstay ${overstay} min within grace window.` };
  }

  if (input.gracePeriodApplicable === "YES") {
    const delay = input.exitDelayReason?.trim();
    if (delay) {
      return { ok: true, reason: "Grace marked applicable with exit-delay account." };
    }
  }

  const duration = resolveRecordedDurationMinutes(input);
  const delay = input.exitDelayReason?.trim();

  // Long continuous recording without a short overstay figure is not grace.
  if (
    duration != null &&
    duration > LONG_STAY_WITHOUT_OVERSTAY_MINUTES
  ) {
    return {
      ok: false,
      reason: `Recorded stay ${duration} min is a long stay, not an end-of-parking grace case.`,
    };
  }

  // Soft grace needs an exit-delay account AND a short (or unknown) stay.
  if (!delay) {
    return { ok: false, reason: "No exit-delay facts established." };
  }

  if (duration != null && duration > STANDARD_GRACE_MINUTES * 3) {
    // e.g. >30 min total with only a free-text delay and no overstay figure
    return {
      ok: false,
      reason: `Recorded stay ${duration} min without a short quantified overstay — grace not supported.`,
    };
  }

  return {
    ok: true,
    reason: "Exit-delay account with no contradicting long-stay duration.",
  };
}
