/**
 * UK customer-facing date formatting.
 *
 * Real AI output rendered dates as "2026-07-12" in letter prose,
 * because the drafting prompt tells the model to use the supplied
 * values exactly — and the supplied value was the ISO string. The model
 * obeyed correctly; the input was wrong.
 *
 * PRESENTATION ONLY. The canonical ISO value is what PoFA timing, Code
 * applicability and effective-date filtering use, and none of that goes
 * anywhere near this module. Formatting a date for a letter must never
 * change the date the law is applied to.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * "2026-07-12" → "12 July 2026".
 *
 * Returns the input unchanged when it is not a plain ISO date, so a
 * value we do not understand is never silently reshaped.
 */
export function formatUkDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const trimmed = String(iso).trim();

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/.exec(trimmed);
  if (!m) return trimmed;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return trimmed;

  // Reject impossible calendar dates rather than rendering them.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return trimmed;
  }

  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/** "14:07" → "2:07pm". Times in prose read better than 24-hour. */
export function formatUkTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!m) return trimmed;

  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return trimmed;

  const suffix = hour < 12 ? "am" : "pm";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m[2]}${suffix}`;
}

/** Minutes → "2 hours 47 minutes", for durations in prose. */
export function formatDuration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole} minute${whole === 1 ? "" : "s"}`;
  const h = Math.floor(whole / 60);
  const mm = whole % 60;
  const hours = `${h} hour${h === 1 ? "" : "s"}`;
  return mm === 0 ? hours : `${hours} ${mm} minute${mm === 1 ? "" : "s"}`;
}

/** Fact keys whose values are dates, for the drafting context. */
export const DATE_FACT_KEYS = new Set([
  "parking_event_date",
  "notice_issue_date",
  "notice_received_date",
  "notice_given_date",
  "deadline",
]);

/** Fact keys whose values are clock times. */
export const TIME_FACT_KEYS = new Set(["entry_time", "exit_time"]);
