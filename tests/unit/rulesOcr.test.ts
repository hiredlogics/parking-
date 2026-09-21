import { describe, expect, it } from "vitest";
import { extractPrintableText, parsePcnText, rulesExtractFromBytes } from "@/services/extraction/rulesOcr";

const SAMPLE = `
PARKING CHARGE NOTICE
ParkingEye Ltd
PCN Reference: 1234567890
Vehicle Registration: AB12 CDE
Date of parking event: 14/03/2024
Location: Tesco, Leeds
Amount due: £100
Notice to Keeper
Alleged contravention: Failure to make a valid payment
Entry: 09:12 Exit: 11:45
`;

describe("rules OCR / parsePcnText", () => {
  it("extracts core UK notice fields from plain text", () => {
    const { raw, confidence } = parsePcnText(SAMPLE);
    expect(raw.operator_name).toMatch(/ParkingEye/i);
    expect(raw.pcn_number).toBe("1234567890");
    expect(raw.vrm).toMatch(/AB12\s?CDE/);
    expect(raw.parking_event_date).toBe("2024-03-14");
    expect(raw.charge_amount).toBe(100);
    expect(raw.notice_route).toBe("POSTAL");
    expect(raw.parking_location).toMatch(/Tesco/i);
    expect(confidence.pcn_number).toBeGreaterThan(0.5);
  });

  it("returns windscreen route when wording says so", () => {
    const { raw } = parsePcnText("This notice was affixed to the vehicle windscreen. PCN Number: XYZ998877");
    expect(raw.notice_route).toBe("WINDSCREEN");
    expect(raw.pcn_number).toBe("XYZ998877");
  });

  it("does not invent fields from empty text", () => {
    const { raw, warnings } = parsePcnText("   ");
    expect(raw.pcn_number).toBeUndefined();
    expect(raw.vrm).toBeUndefined();
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("rulesExtractFromBytes works on a text PDF-like buffer", () => {
    const body = `%PDF-1.4\n(ParkingEye Ltd)\n(PCN Reference: 555666777)\n(AB12 CDE)\n`;
    const bytes = new TextEncoder().encode(body);
    const result = rulesExtractFromBytes({
      name: "notice.pdf",
      mimeType: "application/pdf",
      bytes,
    });
    expect(result.providerId).toBe("rules-ocr");
    expect(result.raw.operator_name).toMatch(/ParkingEye/i);
    expect(result.raw.pcn_number).toBe("555666777");
  });

  it("extractPrintableText keeps readable content", () => {
    const bytes = new TextEncoder().encode("Hello £60 ParkingEye AB12CDE");
    const text = extractPrintableText(bytes, "text/plain");
    expect(text).toContain("ParkingEye");
  });
});
