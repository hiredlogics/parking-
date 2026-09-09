import { describe, expect, it } from "vitest";
import { MockDocumentExtractionProvider } from "@/services/extraction/mockProvider";

describe("MockDocumentExtractionProvider", () => {
  it("uses filename hint to pick Example A scenario", async () => {
    const p = new MockDocumentExtractionProvider();
    const res = await p.extract({
      name: "example-a.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(res.raw.operator_name).toBeDefined();
    expect(res.providerId).toBe("mock-v1");
  });

  it("returns confidence values", async () => {
    const p = new MockDocumentExtractionProvider();
    const res = await p.extract({
      name: "example-b.pdf",
      mimeType: "application/pdf",
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(Object.keys(res.confidence).length).toBeGreaterThan(0);
  });
});
