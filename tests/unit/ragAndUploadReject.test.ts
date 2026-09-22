import { describe, expect, it } from "vitest";
import { assessDocumentDeterministic } from "@/lib/triage/deterministic";
import { triageBlocksAppealJourney } from "@/types/triage";

describe("unrelated document reject", () => {
  it("rejects empty / non-parking uploads", () => {
    const triage = assessDocumentDeterministic({
      operatorName: null,
      allegedBreach: null,
      parkingLocation: null,
      extraText: "Happy birthday menu from the cafe",
    });
    expect(triage.serviceDecision).toBe("NOT_SUPPORTED");
    expect(triage.reasonCode).toBe("UNRELATED_DOCUMENT");
    expect(triageBlocksAppealJourney(triage)).toBe(true);
  });

  it("still accepts a private parking notice", () => {
    const triage = assessDocumentDeterministic({
      operatorName: "ParkingEye Ltd",
      allegedBreach: "Failure to pay the parking charge",
      parkingLocation: "Retail Park",
      extraText: "Parking Charge Notice — Notice to Keeper",
    });
    expect(triage.serviceDecision).toBe(
      "PRIVATE_PARKING_INITIAL_APPEAL_OK",
    );
  });
});
