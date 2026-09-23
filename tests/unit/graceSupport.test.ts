import { describe, expect, it } from "vitest";
import {
  isGraceGroundSupportable,
  resolveRecordedDurationMinutes,
} from "@/lib/appeals/graceSupport";
import { toLegacyAnswers } from "@/lib/facts/toLegacyAnswers";
import { FACT } from "@/lib/facts/facts";
import type { ConfirmedPcn } from "@/types";

describe("graceSupport", () => {
  it("rejects a multi-hour stay without a short overstay figure", () => {
    const r = isGraceGroundSupportable({
      totalRecordedDurationMinutes: 441,
      entryTime: "9:07 am",
      exitTime: "4:28 pm",
      exitDelayReason: "Leaving the car park",
    });
    expect(r.ok).toBe(false);
  });

  it("accepts a short quantified overstay", () => {
    const r = isGraceGroundSupportable({
      totalRecordedDurationMinutes: 130,
      allegedOverstayMinutes: 8,
      exitDelayReason: "Queue at barrier",
    });
    expect(r.ok).toBe(true);
  });

  it("rejects overstay beyond standard grace", () => {
    const r = isGraceGroundSupportable({
      allegedOverstayMinutes: 25,
    });
    expect(r.ok).toBe(false);
  });

  it("resolves duration from entry/exit clocks", () => {
    expect(
      resolveRecordedDurationMinutes({
        entryTime: "9:07 am",
        exitTime: "4:28 pm",
      }),
    ).toBe(441);
  });
});

describe("toLegacyAnswers grace gating", () => {
  const longStay: ConfirmedPcn = {
    operator_name: "Wise Parking",
    pcn_number: "AP539112",
    vrm: "LX71UNS",
    parking_location: "Queen Elizabeth Hospital",
    parking_event_date: "2026-09-08",
    entry_time: "09:07",
    exit_time: "16:28",
    total_recorded_duration: 441,
    confirmedAt: new Date().toISOString(),
  };

  it("does not invent grace facts for a long stay even with exit-delay text", () => {
    const legacy = toLegacyAnswers(
      {
        [FACT.SCENARIOS]: ["grace_or_exit"],
        [FACT.EXIT_DELAY_REASON]: "Needed time to leave",
      },
      longStay,
    );
    expect(legacy.branch.grace).toBeUndefined();
  });
});
