import { FACT, factStr } from "@/lib/questions/facts";
import type { KnownFacts } from "@/lib/questions/types";
import type { PofaAnalysis, PofaTimingStatus } from "./types";

/**
 * Protection of Freedoms Act 2012 Schedule 4 checklist.
 *
 * Legal Authority & Source Register V1 §3 is explicit:
 *
 *   "The application must not use a generic 'non-compliant with PoFA'
 *    paragraph. It must first classify the statutory route and test only
 *    the requirements relevant to that route."
 *
 * and KB-POFA-02:
 *
 *   "Do not allege a timing failure until the correct statutory
 *    calculation is confirmed."
 *
 * So this module returns FAILED only when the arithmetic clearly
 * establishes it. Anything missing, ambiguous or close to the boundary
 * returns UNRESOLVED, which the drafting layer must treat as "no defect
 * established".
 *
 * Routes implemented:
 *   paragraph 9 — postal Notice to Keeper with no prior Notice to Driver.
 *                 Relevant period: 14 days beginning with the day after
 *                 the parking period ended.
 *   paragraph 8 — Notice to Keeper following a Notice to Driver.
 *                 Relevant period: 28 days beginning with the day after
 *                 the Notice to Driver was given.
 *
 * Postal notices are treated as given on the second working day after
 * posting. Because bank holidays vary by year and nation, working days
 * here count Monday–Friday only; a result inside BOUNDARY_TOLERANCE_DAYS
 * of the deadline is therefore reported UNRESOLVED rather than FAILED so
 * a bank holiday can never turn a compliant notice into an alleged
 * defect.
 */

/** Days of slack within which we refuse to allege a failure. */
export const BOUNDARY_TOLERANCE_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  // Normalise to UTC midnight so day arithmetic is stable.
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

/** Add n working days (Mon–Fri) to a date. */
export function addWorkingDays(d: Date, n: number): Date {
  let out = d;
  let remaining = n;
  while (remaining > 0) {
    out = addDays(out, 1);
    const day = out.getUTCDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return out;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

export interface PofaInput {
  facts: KnownFacts;
  /** Content defects an operator/admin has positively confirmed. */
  confirmedContentDefects?: string[];
}

const NOT_APPLICABLE = (reasons: string[]): PofaAnalysis => ({
  route: "NOT_APPLICABLE",
  paragraph: null,
  timingStatus: "NOT_APPLICABLE",
  deadline: null,
  noticeGivenDate: null,
  daysLate: null,
  applicable: false,
  reasons,
  unresolved: [],
  confirmedContentDefects: [],
});

export function analysePofa(input: PofaInput): PofaAnalysis {
  const f = input.facts;
  const reasons: string[] = [];
  const unresolved: string[] = [];

  // ---- Jurisdiction gate (Source Register §15) ----
  const jurisdiction = factStr(f, FACT.JURISDICTION);
  if (jurisdiction === "SCOTLAND" || jurisdiction === "NORTHERN_IRELAND") {
    return NOT_APPLICABLE([
      `Schedule 4 keeper liability is an England and Wales route; jurisdiction recorded as ${jurisdiction}.`,
    ]);
  }

  // ---- Vehicle type gate ----
  // True hire/rental uses a separate Sch 4 transfer path.
  // Lease / company vehicles still run the normal keeper/PoFA analysis
  // so payment and other grounds can assemble in the rules letter.
  const hire = factStr(f, FACT.VEHICLE_HIRE_STATUS);
  if (hire === "HIRE") {
    return NOT_APPLICABLE([
      "Hire vehicles follow a separate Schedule 4 transfer route which is not automated.",
    ]);
  }

  // ---- Is the keeper route even engaged? ----
  const keeper = factStr(f, FACT.REGISTERED_KEEPER);
  const driverIdentified = factStr(f, FACT.DRIVER_IDENTIFIED);
  if (keeper !== "YES") {
    return NOT_APPLICABLE([
      "Appellant is not recorded as the registered keeper, so the Schedule 4 transfer question does not arise on this route.",
    ]);
  }
  if (driverIdentified === "YES") {
    return NOT_APPLICABLE([
      "The driver has already been formally identified to the operator, so keeper liability under Schedule 4 is not the operative question.",
    ]);
  }
  if (driverIdentified !== "NO") {
    unresolved.push(FACT.DRIVER_IDENTIFIED);
  }

  // ---- Classify the statutory route ----
  const noticeRoute = factStr(f, FACT.NOTICE_ROUTE);
  const eventDate = parseDate(factStr(f, FACT.PARKING_EVENT_DATE));
  const issueDate = parseDate(factStr(f, FACT.NOTICE_ISSUE_DATE));

  if (noticeRoute !== "POSTAL" && noticeRoute !== "WINDSCREEN") {
    unresolved.push(FACT.NOTICE_ROUTE);
    return {
      route: "UNRESOLVED",
      paragraph: null,
      timingStatus: "UNRESOLVED",
      deadline: null,
      noticeGivenDate: null,
      daysLate: null,
      applicable: true,
      reasons: [
        "The notice route could not be established, so no Schedule 4 route or timing test can be applied.",
      ],
      unresolved,
      confirmedContentDefects: input.confirmedContentDefects ?? [],
    };
  }

  if (noticeRoute === "WINDSCREEN") {
    // Paragraph 8 route: NTK following a Notice to Driver. The Notice to
    // Driver date is required and we do not infer it.
    reasons.push(
      "A Notice to Driver was placed on the vehicle, so the paragraph 8 route applies to any subsequent Notice to Keeper.",
    );
    if (!eventDate) {
      unresolved.push(FACT.PARKING_EVENT_DATE);
    }
    // The NTD is normally given on the day of the parking event.
    const ntdDate = eventDate;
    if (!ntdDate || !issueDate) {
      if (!issueDate) unresolved.push(FACT.NOTICE_ISSUE_DATE);
      return {
        route: "WINDSCREEN",
        paragraph: "8",
        timingStatus: "UNRESOLVED",
        deadline: null,
        noticeGivenDate: null,
        daysLate: null,
        applicable: true,
        reasons: [
          ...reasons,
          "The paragraph 8 timing test could not be completed because a required date is not established.",
        ],
        unresolved,
        confirmedContentDefects: input.confirmedContentDefects ?? [],
      };
    }
    // Relevant period: 28 days beginning with the day after the NTD.
    const deadline = addDays(ntdDate, 28);
    const given = addWorkingDays(issueDate, 2);
    const late = diffDays(given, deadline);
    const status = classify(late, reasons, deadline, given, "28-day paragraph 8");
    return {
      route: "WINDSCREEN",
      paragraph: "8",
      timingStatus: status,
      deadline: iso(deadline),
      noticeGivenDate: iso(given),
      daysLate: status === "FAILED" ? late : null,
      applicable: true,
      reasons,
      unresolved,
      confirmedContentDefects: input.confirmedContentDefects ?? [],
    };
  }

  // Paragraph 9 route: postal NTK with no prior Notice to Driver.
  reasons.push(
    "The notice was first given by post with no prior Notice to Driver, so the paragraph 9 route applies.",
  );
  if (!eventDate) unresolved.push(FACT.PARKING_EVENT_DATE);
  if (!issueDate) unresolved.push(FACT.NOTICE_ISSUE_DATE);
  if (!eventDate || !issueDate) {
    return {
      route: "POSTAL",
      paragraph: "9",
      timingStatus: "UNRESOLVED",
      deadline: null,
      noticeGivenDate: null,
      daysLate: null,
      applicable: true,
      reasons: [
        ...reasons,
        "The paragraph 9 timing test could not be completed because a required date is not established.",
      ],
      unresolved,
      confirmedContentDefects: input.confirmedContentDefects ?? [],
    };
  }

  // Relevant period: 14 days beginning with the day after the parking
  // period ended. Postal notices are given on the 2nd working day after
  // posting.
  const deadline = addDays(eventDate, 14);
  const given = addWorkingDays(issueDate, 2);
  const late = diffDays(given, deadline);
  const status = classify(late, reasons, deadline, given, "14-day paragraph 9");

  return {
    route: "POSTAL",
    paragraph: "9",
    timingStatus: status,
    deadline: iso(deadline),
    noticeGivenDate: iso(given),
    daysLate: status === "FAILED" ? late : null,
    applicable: true,
    reasons,
    unresolved,
    confirmedContentDefects: input.confirmedContentDefects ?? [],
  };
}

function classify(
  late: number,
  reasons: string[],
  deadline: Date,
  given: Date,
  label: string,
): PofaTimingStatus {
  if (late > BOUNDARY_TOLERANCE_DAYS) {
    reasons.push(
      `The notice is treated as given on ${iso(given)}, which is ${late} day(s) after the ${label} deadline of ${iso(deadline)}.`,
    );
    return "FAILED";
  }
  if (late > 0) {
    reasons.push(
      `The notice is treated as given on ${iso(given)}, within ${BOUNDARY_TOLERANCE_DAYS} day(s) of the ${label} deadline of ${iso(deadline)}. Because working-day counting is sensitive to bank holidays, no timing failure is alleged.`,
    );
    return "UNRESOLVED";
  }
  reasons.push(
    `The notice is treated as given on ${iso(given)}, within the ${label} deadline of ${iso(deadline)}.`,
  );
  return "COMPLIANT";
}

/**
 * True when a PoFA point may lead the appeal: a defect is actually
 * established AND the driver remains unidentified (KB-POFA-05).
 */
export function pofaCanLead(p: PofaAnalysis, driverUnidentified: boolean): boolean {
  if (!p.applicable || !driverUnidentified) return false;
  return p.timingStatus === "FAILED" || p.confirmedContentDefects.length > 0;
}
