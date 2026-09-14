/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEMO_SCENARIOS } from "@/tests/fixtures/demoScenarios";
import { evaluate } from "@/rules";
import { assembleAppeal } from "@/lib/assembly";
import { renderAppealPdf } from "@/services/documents/pdf";
import { renderAppealDocx } from "@/services/documents/docx";
import type { SessionData } from "@/lib/auth/session";

/**
 * POST /api/cases/[id]/extract
 *
 * Extraction is a PAID vision call, so the gating is the point of these
 * tests. It replaced a previously public /api/extract endpoint that any
 * anonymous visitor could drive in a loop.
 */

let session: SessionData = { userId: "cust_1", kind: "CUSTOMER" };
let accessOk = true;
let rateAllowed = true;
const extractSpy = vi.fn();

vi.mock("@/lib/db/pool", () => ({ hasDb: () => true, getSql: () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));

vi.mock("@/lib/cases/service", () => ({
  requireCaseAccess: async () =>
    accessOk
      ? { ok: true, appealCase: { id: "case_1" } }
      : { ok: false, status: 404, code: "NOT_FOUND", message: "Case not found." },
  saveExtractionForCase: async () => ({ ok: true }),
  getCustomerCaseState: async () => ({ ok: true, state: { id: "case_1" } }),
}));

vi.mock("@/lib/cases/repo", () => ({
  addCaseDocument: async () => ({ id: "doc_1" }),
  addCaseEvent: async () => {},
}));

vi.mock("@/lib/rateLimit", () => ({
  EXTRACTION_RATE_LIMIT: () => ({ action: "extract", limit: 12, windowSeconds: 3600 }),
  consumeRateLimit: async () => ({
    allowed: rateAllowed,
    limit: 12,
    remaining: rateAllowed ? 11 : 0,
    resetAt: "2026-01-01T00:00:00.000Z",
    retryAfterSeconds: 900,
  }),
}));

vi.mock("@/services/storage", () => ({
  getStorageProvider: () => ({
    id: "memory",
    put: async () => ({
      storageKey: "cases/case_1/evidence/k-notice.pdf",
      fileName: "notice.pdf",
      mimeType: "application/pdf",
      sizeBytes: 4,
      sha256: "abc",
      uploadedAt: "2026-01-01T00:00:00.000Z",
    }),
  }),
}));

vi.mock("@/services/extraction", () => ({
  getExtractionProvider: () => ({ extract: extractSpy }),
}));

const { POST: extractPost } = await import("@/app/api/cases/[id]/extract/route");

const ctx = { params: Promise.resolve({ id: "case_1" }) };

function upload(name = "notice.pdf", type = "application/pdf") {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([1, 2, 3, 4])], name, { type }));
  return new Request("http://test.local/api/cases/case_1/extract", {
    method: "POST",
    body: form,
  });
}

beforeEach(() => {
  session = { userId: "cust_1", kind: "CUSTOMER" };
  accessOk = true;
  rateAllowed = true;
  extractSpy.mockReset();
  extractSpy.mockResolvedValue({ raw: { operator_name: "Op Ltd" }, confidence: {} });
});

describe("POST /api/cases/[id]/extract", () => {
  it("extracts for the owning customer", async () => {
    const res = await extractPost(upload(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.extraction.raw.operator_name).toBe("Op Ltd");
  });

  it("rejects an unauthenticated caller", async () => {
    session = {};
    accessOk = false;
    const res = await extractPost(upload(), ctx);
    expect(res.status).toBe(404);
    // No AI call may be made for a caller with no case.
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("rejects a caller who does not own the case", async () => {
    accessOk = false;
    const res = await extractPost(upload(), ctx);
    expect(res.status).toBe(404);
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("returns 429 once the hourly limit is reached", async () => {
    rateAllowed = false;
    const res = await extractPost(upload(), ctx);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    // The whole point: a rate-limited request costs nothing.
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("rejects an unsupported mime type before calling the model", async () => {
    const res = await extractPost(upload("notes.txt", "text/plain"), ctx);
    expect(res.status).toBe(415);
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("reports remaining budget on success", async () => {
    const res = await extractPost(upload(), ctx);
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("11");
  });

  it("does not leak provider configuration detail to the browser", async () => {
    extractSpy.mockRejectedValueOnce(new Error("401 Incorrect API key sk-abc123"));
    const res = await extractPost(upload(), ctx);
    expect(res.status).toBe(502);
    const text = JSON.stringify(await res.json());
    expect(text).not.toMatch(/sk-abc123/);
    expect(text).not.toMatch(/API key/i);
  });
});

describe("Document renderers (server-side)", () => {
  it("renders a PDF for a valid keeper-safe worked example (Example A)", async () => {
    const s = DEMO_SCENARIOS.find((x) => x.id === "payment_keying")!;
    const pcn = { ...s.pcn, confirmedAt: new Date().toISOString() };
    const evaluation = evaluate({ pcn, answers: s.suggestedAnswers, evidence: [] });
    const appeal = assembleAppeal(pcn, s.suggestedAnswers, [], evaluation);
    const bytes = await renderAppealPdf({
      pcn,
      answers: s.suggestedAnswers,
      evidence: [],
      appeal,
    });
    const buf = new Uint8Array(bytes);
    expect(String.fromCharCode(...buf.slice(0, 5))).toBe("%PDF-");
  });

  it("renders a DOCX for a valid worked example (Example C)", async () => {
    const s = DEMO_SCENARIOS.find((x) => x.id === "keeper_late_ntk")!;
    const pcn = { ...s.pcn, confirmedAt: new Date().toISOString() };
    const evaluation = evaluate({ pcn, answers: s.suggestedAnswers, evidence: [] });
    const appeal = assembleAppeal(pcn, s.suggestedAnswers, [], evaluation);
    const bytes = await renderAppealDocx({
      pcn,
      answers: s.suggestedAnswers,
      evidence: [],
      appeal,
    });
    const buf = new Uint8Array(bytes);
    // ZIP magic bytes (DOCX is a zip archive)
    expect(buf[0]).toBe(0x50);
    expect(buf[1]).toBe(0x4b);
  });
});
