import { describe, expect, it } from "vitest";
import {
  extractPostcodeArea,
  inferUkJurisdiction,
  resolveUkJurisdiction,
} from "@/lib/questions/jurisdiction";
import { deriveKnownFacts, FACT } from "@/lib/questions/facts";

describe("inferUkJurisdiction", () => {
  it("infers England/Wales from a London location", () => {
    expect(inferUkJurisdiction("NCP Car Park, London Bridge SE1 9SG")).toBe(
      "ENGLAND_WALES",
    );
  });

  it("infers Scotland from Edinburgh postcode", () => {
    expect(inferUkJurisdiction("Castle Terrace, Edinburgh EH1 2NG")).toBe(
      "SCOTLAND",
    );
  });

  it("infers Northern Ireland from BT postcode", () => {
    expect(inferUkJurisdiction("Belfast BT1 5GS")).toBe("NORTHERN_IRELAND");
  });

  it("infers England/Wales from Solihull postcode without asking", () => {
    expect(
      inferUkJurisdiction(
        "SEARS RETAIL PARK, SHIRLEY, SOLIHULL, B90 4QY",
      ),
    ).toBe("ENGLAND_WALES");
  });

  it("infers England/Wales from Solihull place name alone", () => {
    expect(inferUkJurisdiction("Sears Retail Park, Solihull")).toBe(
      "ENGLAND_WALES",
    );
  });

  it("infers England/Wales from outward-only postcode", () => {
    expect(inferUkJurisdiction("Sears Retail Park B90")).toBe("ENGLAND_WALES");
  });

  it("returns null when unsure", () => {
    expect(inferUkJurisdiction("Unknown retail park")).toBeNull();
  });

  it("extracts outward area codes", () => {
    expect(extractPostcodeArea("12 High Street, LS1 2AB")).toBe("LS");
    expect(extractPostcodeArea("G1 1AA")).toBe("G");
    expect(extractPostcodeArea("B90")).toBe("B");
  });

  it("seeds jurisdiction into known facts from parking location", () => {
    const facts = deriveKnownFacts({
      confirmed: {
        parking_location: "Leeds LS1 2AB",
        confirmedAt: new Date().toISOString(),
      },
    });
    expect(facts.values[FACT.JURISDICTION]).toBe("ENGLAND_WALES");
  });

  it("seeds jurisdiction from AI-extracted uk_jurisdiction even without place hints", () => {
    const facts = deriveKnownFacts({
      confirmed: {
        parking_location: "Sears Retail Park",
        uk_jurisdiction: "ENGLAND_WALES",
        confirmedAt: new Date().toISOString(),
      },
    });
    expect(facts.values[FACT.JURISDICTION]).toBe("ENGLAND_WALES");
  });

  it("defaults England/Wales when location is known but nation is ambiguous", () => {
    const facts = deriveKnownFacts({
      confirmed: {
        parking_location: "Sears Retail Park",
        confirmedAt: new Date().toISOString(),
      },
    });
    expect(facts.values[FACT.JURISDICTION]).toBe("ENGLAND_WALES");
  });

  it("does not invent jurisdiction with no location and no extraction", () => {
    const facts = deriveKnownFacts({
      confirmed: {
        confirmedAt: new Date().toISOString(),
      },
    });
    expect(facts.values[FACT.JURISDICTION]).toBeUndefined();
  });

  it("does not treat UNKNOWN extraction as resolved", () => {
    expect(
      resolveUkJurisdiction({
        ukJurisdiction: "UNKNOWN",
        parkingLocation: "Unknown retail park",
      }),
    ).toBeNull();
  });
});
