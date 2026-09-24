import { describe, expect, it } from "vitest";
import type { ConfirmedPcn } from "@/types";
import { FACT } from "@/lib/facts/facts";
import { loadKbCatalog } from "@/lib/kb/catalog";
import { analyseCase } from "@/lib/analysis/engine";
import { loadPofaConfig } from "@/lib/config/pofaConfig";
import { deriveKnownFacts } from "@/lib/facts/facts";
import { retrieveKnowledge } from "@/lib/retrieval/engine";

/**
 * Ten notices carrying ONLY what production can actually establish.
 *
 * This fixture set exists because `tests/fixtures/uatCases.ts` cannot
 * catch a whole class of defect. Every UAT fixture supplies `scenarios`
 * and the branch facts as answers, which the adaptive question engine
 * used to collect. Once that engine was removed nothing could supply
 * them, and retrieval returned ZERO modules for every real case — while
 * the UAT suite stayed green, because its fixtures still handed those
 * facts in directly.
 *
 * So these fixtures are deliberately impoverished: notice-derived
 * fields, plus the registered-keeper answer the confirm page asks for,
 * and nothing else. If a change breaks what a real customer can reach,
 * it fails here.
 */
const notice = (over: Partial<ConfirmedPcn>): ConfirmedPcn =>
  ({
    uk_jurisdiction: "ENGLAND_WALES",
    notice_route: "POSTAL",
    case_stage: "INITIAL_OPERATOR_APPEAL",
    confirmedAt: "2026-09-24T00:00:00.000Z",
    ...over,
  }) as ConfirmedPcn;

interface Sample {
  id: string;
  confirmed: ConfirmedPcn;
  /** Days between the parking event and the notice being issued. */
  ntk: "LATE" | "COMPLIANT";
}

export const PRODUCTION_NOTICES: Sample[] = [
  {
    id: "smart-parking-late",
    ntk: "LATE",
    confirmed: notice({
      operator_name: "Smart Parking Ltd", pcn_number: "SP62712518", vrm: "FD18BOF",
      parking_location: "B&M Chatham", parking_event_date: "2026-08-10",
      notice_issue_date: "2026-08-27", entry_time: "19:06", exit_time: "20:41",
      total_recorded_duration: 95, charge_amount: 90,
      alleged_breach: "Parked without payment recorded by ANPR",
    }),
  },
  {
    id: "euro-car-parks-voucher",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "Euro Car Parks", pcn_number: "88812545842", vrm: "KJ19KYN",
      parking_location: "Sainsburys Willesden Green", parking_event_date: "2026-08-29",
      notice_issue_date: "2026-09-04", entry_time: "13:05", exit_time: "14:14",
      total_recorded_duration: 69, charge_amount: 100,
      alleged_breach: "A voucher/receipt was not validated at the kiosk",
    }),
  },
  {
    id: "parkingeye-overstay",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "ParkingEye Ltd", pcn_number: "PE/99120033", vrm: "LM20 TRV",
      parking_location: "Retail Park, Leeds", parking_event_date: "2026-07-03",
      notice_issue_date: "2026-07-09", entry_time: "11:20", exit_time: "14:55",
      total_recorded_duration: 215, charge_amount: 100,
      alleged_breach: "Overstaying the maximum permitted free stay of 180 minutes",
    }),
  },
  {
    id: "excel-short-stay",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "Excel Parking Services", pcn_number: "EX4410882", vrm: "YD17 KKX",
      parking_location: "Queens Road, Sheffield", parking_event_date: "2026-06-15",
      notice_issue_date: "2026-06-20", entry_time: "14:00", exit_time: "14:07",
      total_recorded_duration: 7, charge_amount: 100,
      alleged_breach: "Parking without payment",
    }),
  },
  {
    id: "ukpc-windscreen-permit",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "UK Parking Control", pcn_number: "UKPC7781203", vrm: "BV65 WNO",
      parking_location: "Elmfield Court (residential)", parking_event_date: "2026-08-02",
      notice_issue_date: "2026-08-02", notice_route: "WINDSCREEN",
      charge_amount: 100, alleged_breach: "No valid permit displayed",
    }),
  },
  {
    id: "horizon-very-late",
    ntk: "LATE",
    confirmed: notice({
      operator_name: "Horizon Parking Ltd", pcn_number: "HP-5521904", vrm: "RK18 UYT",
      parking_location: "Garden Centre, Norwich", parking_event_date: "2026-05-01",
      notice_issue_date: "2026-07-02", entry_time: "10:11", exit_time: "11:40",
      total_recorded_duration: 89, charge_amount: 100,
      alleged_breach: "Failure to make a valid payment",
    }),
  },
  {
    id: "met-long-anpr",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "MET Parking Services", pcn_number: "MET3390127", vrm: "GX16 PLD",
      parking_location: "McDonalds Drive-Thru, Luton", parking_event_date: "2026-07-20",
      notice_issue_date: "2026-07-25", entry_time: "08:40", exit_time: "16:05",
      total_recorded_duration: 445, charge_amount: 100,
      alleged_breach: "Overstay of maximum stay (single visit recorded)",
    }),
  },
  {
    id: "carparkplus-hospital",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "Car Park Plus", pcn_number: "CPP-771249", vrm: "WP19 ZDF",
      parking_location: "St Marys Hospital visitor car park", parking_event_date: "2026-08-18",
      notice_issue_date: "2026-08-23", entry_time: "09:05", exit_time: "13:48",
      total_recorded_duration: 283, charge_amount: 70,
      alleged_breach: "Exceeded maximum stay",
    }),
  },
  {
    id: "nsl-ev-bay",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "NSL Services", pcn_number: "NSL-2288401", vrm: "EV70 CHG",
      parking_location: "Motorway Services, Warwick", parking_event_date: "2026-09-01",
      notice_issue_date: "2026-09-05", entry_time: "22:10", exit_time: "23:58",
      total_recorded_duration: 108, charge_amount: 100,
      alleged_breach: "Parked in an EV charging bay without charging",
    }),
  },
  {
    id: "group-nexus-no-times",
    ntk: "COMPLIANT",
    confirmed: notice({
      operator_name: "Group Nexus Ltd", pcn_number: "GN-6612093", vrm: "SA15 MRT",
      parking_location: "Town Centre APCOA, Derby", parking_event_date: "2026-08-08",
      notice_issue_date: "2026-08-14", charge_amount: 60,
      alleged_breach: "Parking in a restricted area",
    }),
  },
];

/** Exactly what the confirm page can now establish beyond the notice. */
const CONFIRM_PAGE_ANSWERS = {
  [FACT.REGISTERED_KEEPER]: "YES",
  [FACT.DRIVER_IDENTIFIED]: "NO",
};

async function runNotice(confirmed: ConfirmedPcn) {
  const catalog = await loadKbCatalog();
  const analysis = await analyseCase({
    confirmed,
    answers: CONFIRM_PAGE_ANSWERS,
    evidenceTypes: [],
    evidenceRefs: [],
    pofaConfig: await loadPofaConfig(),
  });
  const facts = deriveKnownFacts({ confirmed, answers: CONFIRM_PAGE_ANSWERS });
  const retrieval = retrieveKnowledge({
    analysis,
    facts,
    parkingEventDate: confirmed.parking_event_date,
    evidenceTypes: [],
    modules: catalog.modules,
    sources: catalog.sources,
    blocks: catalog.blocks,
  });
  return { analysis, retrieval, moduleIds: retrieval.modules.map((m) => m.moduleId) };
}

describe("production-reachable notices", () => {
  it("covers ten distinct operators", () => {
    expect(PRODUCTION_NOTICES).toHaveLength(10);
    expect(new Set(PRODUCTION_NOTICES.map((n) => n.id)).size).toBe(10);
  });

  /*
   * Notices with an established PoFA timing defect must still retrieve
   * grounds from confirm-page answers alone (dates are on the notice).
   *
   * Compliant notices no longer retrieve a weak keeper-only PoFA module
   * from defaults — that produced generic letters. Those cases need the
   * fact-gap step (allegation → issues → answers) before retrieval has
   * anything case-specific to say.
   */
  it.each(
    PRODUCTION_NOTICES.filter((n) => n.ntk === "LATE").map(
      (n) => [n.id, n] as const,
    ),
  )(
    "%s (late NTK) retrieves at least one ground and some wording",
    async (_id, sample) => {
      const { moduleIds, retrieval } = await runNotice(sample.confirmed);
      expect(moduleIds.length).toBeGreaterThan(0);
      expect(retrieval.blocks.length).toBeGreaterThan(0);
    },
  );

  it.each(
    PRODUCTION_NOTICES.filter((n) => n.ntk === "COMPLIANT").map(
      (n) => [n.id, n] as const,
    ),
  )(
    "%s (confirm-only) does not invent a weak keeper PoFA ground",
    async (_id, sample) => {
      const { analysis, moduleIds } = await runNotice(sample.confirmed);
      expect(analysis.pofa.timingStatus).not.toBe("FAILED");
      expect(moduleIds).not.toContain("KB-POFA-02");
      // Without fact-gap answers there is no conduct route and no
      // established PoFA defect — so no modules, not a generic letter.
      expect(moduleIds.filter((m) => m.startsWith("KB-POFA"))).toEqual([]);
    },
  );

  it("establishes the registered keeper with assertable provenance", () => {
    const facts = deriveKnownFacts({
      confirmed: PRODUCTION_NOTICES[0].confirmed,
      answers: CONFIRM_PAGE_ANSWERS,
    });
    expect(facts.known.has(FACT.REGISTERED_KEEPER)).toBe(true);
    expect(facts.provenance[FACT.REGISTERED_KEEPER]).toBe("answer");
  });

  it.each(
    PRODUCTION_NOTICES.filter((n) => n.ntk === "LATE").map((n) => [n.id, n] as const),
  )("%s argues the postal NTK timing ground", async (_id, sample) => {
    const { analysis, moduleIds } = await runNotice(sample.confirmed);
    expect(analysis.pofa.timingStatus).toBe("FAILED");
    expect(analysis.pofa.daysLate).toBeGreaterThan(0);
    expect(moduleIds).toContain("KB-POFA-02");
  });

  /*
   * The other half of the same guard: a notice served in time must not
   * pick up a timing challenge. A false positive here would put an
   * untrue statement in a legal letter, which is worse than a thin one.
   */
  it.each(
    PRODUCTION_NOTICES.filter((n) => n.ntk === "COMPLIANT").map(
      (n) => [n.id, n] as const,
    ),
  )("%s does not allege a timing failure", async (_id, sample) => {
    const { analysis, moduleIds } = await runNotice(sample.confirmed);
    expect(analysis.pofa.timingStatus).not.toBe("FAILED");
    expect(moduleIds).not.toContain("KB-POFA-02");
  });

  it("dates the deemed-service deadline from working days", async () => {
    // Event 10/08, +14 days = 24/08 deadline. Issued Thu 27/08, deemed
    // given two working days later = 31/08, so seven days late.
    const { analysis } = await runNotice(PRODUCTION_NOTICES[0].confirmed);
    expect(analysis.pofa.daysLate).toBe(7);
  });
});
