/**
 * England & Wales public / bank holidays for PoFA working-day counting.
 *
 * Schedule 4 postal deemed service uses the second working day after
 * posting. Working days exclude weekends and England/Wales bank holidays
 * (not Scotland/NI variants).
 *
 * Easter is computed (Anonymous Gregorian algorithm). Fixed and
 * relative Mondays follow the standard England/Wales calendar; Boxing
 * Day / New Year substitutes apply when the holiday falls on a weekend.
 */

function utc(y: number, m0: number, d: number): Date {
  return new Date(Date.UTC(y, m0, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

/** First Monday on or after the given UTC date. */
function firstMondayOnOrAfter(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun … 6 Sat
  const delta = day === 1 ? 0 : (8 - day) % 7;
  return addDays(d, delta);
}

/** Last Monday of month (m0 = 0-based month). */
function lastMondayOfMonth(year: number, m0: number): Date {
  const last = utc(year, m0 + 1, 0); // last day of month
  const day = last.getUTCDay();
  const delta = day === 1 ? 0 : day === 0 ? 6 : day - 1;
  return addDays(last, -delta);
}

/** Easter Sunday (Gregorian / Anonymous algorithm), UTC midnight. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Mar, 4=Apr
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(year, month - 1, day);
}

/**
 * Observed date when a fixed holiday falls on a weekend (England/Wales
 * substitute rules: Sat/Sun → following Monday).
 */
function observedFixed(year: number, m0: number, day: number): Date {
  const d = utc(year, m0, day);
  const wd = d.getUTCDay();
  if (wd === 0) return addDays(d, 1); // Sunday → Monday
  if (wd === 6) return addDays(d, 2); // Saturday → Monday
  return d;
}

/** All England/Wales bank holiday dates for a calendar year (ISO). */
export function englandWalesBankHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const dates = [
    observedFixed(year, 0, 1), // New Year's Day
    addDays(easter, -2), // Good Friday
    addDays(easter, 1), // Easter Monday
    firstMondayOnOrAfter(utc(year, 4, 1)), // Early May
    lastMondayOfMonth(year, 4), // Spring (May)
    lastMondayOfMonth(year, 7), // Summer (August)
    observedFixed(year, 11, 25), // Christmas Day
    observedFixed(year, 11, 26), // Boxing Day
  ];
  return new Set(dates.map(iso));
}

const cache = new Map<number, Set<string>>();

export function isEnglandWalesBankHoliday(d: Date): boolean {
  const y = d.getUTCFullYear();
  let set = cache.get(y);
  if (!set) {
    set = englandWalesBankHolidays(y);
    cache.set(y, set);
  }
  return set.has(iso(d));
}

/** True if Mon–Fri and not an England/Wales bank holiday. */
export function isEnglandWalesWorkingDay(d: Date): boolean {
  const day = d.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !isEnglandWalesBankHoliday(d);
}
