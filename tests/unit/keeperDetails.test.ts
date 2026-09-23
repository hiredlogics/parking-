/**
 * @vitest-environment node
 *
 * The keeper-details step, which is being moved out of the questions
 * journey before that journey is deleted.
 *
 * Only the pure decision logic is tested here — whether we still need to
 * ask, and how the stored answers are read back. The form's markup is
 * covered by the e2e journey; what matters at this level is that the
 * rule "a postal NTK already carries the keeper's details, a windscreen
 * ticket does not" survives the move intact, because getting it wrong in
 * either direction is a real defect: ask a postal-NTK customer for
 * details we already have, or produce a letter with no sender.
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_KEEPER_PROFILE,
  keeperProfileFrom,
  needsKeeperDetails,
} from "@/features/appeal/KeeperDetails";

describe("needsKeeperDetails", () => {
  it("asks on a windscreen notice with nothing stored", () => {
    expect(needsKeeperDetails({}, "WINDSCREEN")).toBe(true);
  });

  it("asks when the notice route could not be classified", () => {
    // An unclassified notice might be a windscreen ticket, and the cost
    // of asking unnecessarily is far lower than a letter with no sender.
    expect(needsKeeperDetails({}, "UNKNOWN")).toBe(true);
    expect(needsKeeperDetails({}, null)).toBe(true);
    expect(needsKeeperDetails({}, undefined)).toBe(true);
    expect(needsKeeperDetails({}, "")).toBe(true);
  });

  it("does not ask on a postal notice to keeper", () => {
    // A postal NTK is addressed to the keeper, so the details are
    // already on the notice the customer uploaded.
    expect(needsKeeperDetails({}, "POSTAL")).toBe(false);
  });

  it("stops asking once a name is stored", () => {
    expect(needsKeeperDetails({ keeper_name: "John Smith" }, "WINDSCREEN")).toBe(
      false,
    );
  });

  it("treats a whitespace-only name as missing", () => {
    expect(needsKeeperDetails({ keeper_name: "   " }, "WINDSCREEN")).toBe(true);
  });

  it("treats a null or absent name as missing", () => {
    expect(needsKeeperDetails({ keeper_name: null }, "WINDSCREEN")).toBe(true);
    expect(needsKeeperDetails({ keeper_name: undefined }, "WINDSCREEN")).toBe(
      true,
    );
  });
});

describe("keeperProfileFrom", () => {
  it("reads every field back out of the answer map", () => {
    expect(
      keeperProfileFrom({
        keeper_name: "John Smith",
        keeper_address_line1: "12 High Street",
        keeper_address_line2: "Flat 3",
        keeper_town: "Leeds",
        keeper_postcode: "LS1 2AB",
        // Unrelated answers must not leak into the form.
        notice_route: "WINDSCREEN",
      }),
    ).toEqual({
      keeper_name: "John Smith",
      keeper_address_line1: "12 High Street",
      keeper_address_line2: "Flat 3",
      keeper_town: "Leeds",
      keeper_postcode: "LS1 2AB",
    });
  });

  it("renders a missing or null field as an empty string", () => {
    // A React controlled input given undefined switches to uncontrolled
    // and warns; this is what keeps the form controlled.
    expect(keeperProfileFrom({})).toEqual(EMPTY_KEEPER_PROFILE);
    expect(keeperProfileFrom({ keeper_address_line2: null }).keeper_address_line2).toBe(
      "",
    );
  });

  it("is round-trippable with an empty profile", () => {
    expect(keeperProfileFrom({ ...EMPTY_KEEPER_PROFILE })).toEqual(
      EMPTY_KEEPER_PROFILE,
    );
  });
});
