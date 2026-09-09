import { describe, expect, it } from "vitest";
import { formatPublicCaseId } from "@/lib/cases/publicId";

describe("formatPublicCaseId", () => {
  it("formats CASE-YYYY-NNNNNN with zero-padded sequence", () => {
    expect(formatPublicCaseId(2026, 1)).toBe("CASE-2026-000001");
    expect(formatPublicCaseId(2026, 42)).toBe("CASE-2026-000042");
    expect(formatPublicCaseId(2026, 999999)).toBe("CASE-2026-999999");
  });
});
