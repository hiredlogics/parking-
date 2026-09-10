/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@/lib/auth/session";
import type { AppealCase, CaseDocument } from "@/lib/cases/types";

/**
 * P1-a — evidence access control.
 *
 * The database and storage are mocked so these tests exercise the
 * ownership rules, the upload validation and the "a storage key is not
 * a capability" property.
 */

const OWNER: SessionData = { userId: "cust_1", kind: "CUSTOMER" };
const STRANGER: SessionData = { userId: "cust_2", kind: "CUSTOMER" };
const ADMIN: SessionData = { userId: "adm_1", kind: "ADMIN" };

const CASE_A = "case_a";
const CASE_B = "case_b";

function makeCase(id: string, customerId: string): AppealCase {
  return {
    id,
    publicId: `PAG-${id}`,
    customerId,
    serviceType: "PRIVATE_PARKING_INITIAL_APPEAL",
    status: "QUESTIONING",
    operatorName: null, pcnNumber: null, vrm: null,
    parkingLocation: null, parkingEventDate: null,
    noticeIssueDate: null, noticeReceivedDate: null,
    noticeRoute: "UNKNOWN", operatorAta: "UNKNOWN",
    driverStatus: "UNIDENTIFIED", pofaRoute: null,
    extraction: null, confirmed: null,
    adaptiveAnswers: {}, askedQuestionIds: [],
    candidateRoutes: [], primaryRoute: null, secondaryRoutes: [],
    missingFacts: [], codeVersionId: null,
    questioningComplete: false, sufficiencyStatus: "INCOMPLETE",
    readinessCheckedAt: null, outOfScopeReason: null, outOfScopeDetail: null,
    paymentStatus: "UNPAID", appealLocked: true, orderId: null,
    lifecycleStatus: "IN_PROGRESS",
    outcomeStatus: "PENDING",
    outcomeRecordedAt: null,
    outcomeSource: null,
    outcomeDetail: null,
    submittedAt: null,
    followUpDueAt: null,
    stageNumber: 1,
    parentCaseId: null,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
  };
}

const cases: Record<string, AppealCase> = {
  [CASE_A]: makeCase(CASE_A, "cust_1"),
  [CASE_B]: makeCase(CASE_B, "cust_2"),
};

let documents: CaseDocument[] = [];
const addCaseEvent = vi.fn(async () => {});

vi.mock("@/lib/cases/repo", () => ({
  findCase: async (id: string) => cases[id] ?? null,
  findCaseDocument: async (id: string) =>
    documents.find((d) => d.id === id) ?? null,
  listCaseDocuments: async (caseId: string) =>
    documents.filter((d) => d.caseId === caseId),
  addCaseDocument: async (input: Record<string, unknown>) => {
    const doc = {
      id: `doc_${documents.length + 1}`,
      uploadedAt: "2025-01-01T00:00:00.000Z",
      ...input,
    } as unknown as CaseDocument;
    documents.push(doc);
    return doc;
  },
  addCaseEvent: () => addCaseEvent(),
}));

const { uploadEvidenceForCase, getEvidenceDownload, isAllowedMime } =
  await import("@/lib/cases/evidence");
const { resetStorageProvider } = await import("@/services/storage");

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

function upload(caseId: string, session: SessionData, over: Record<string, unknown> = {}) {
  return uploadEvidenceForCase(caseId, session, {
    fileName: "receipt.png",
    mimeType: "image/png",
    bytes: PNG,
    evidenceType: "payment_receipt",
    ...over,
  });
}

beforeEach(() => {
  documents = [];
  addCaseEvent.mockClear();
  delete process.env.STORAGE_PROVIDER;
  resetStorageProvider();
});

/* ========================= Upload authorisation ========================= */

describe("Upload authorisation", () => {
  it("accepts an upload from the owning customer", async () => {
    const res = await upload(CASE_A, OWNER);
    expect(res.ok).toBe(true);
  });

  it("rejects an unauthenticated upload", async () => {
    const res = await upload(CASE_A, {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
    expect(documents).toHaveLength(0);
  });

  it("hides another customer's case behind 404", async () => {
    const res = await upload(CASE_A, STRANGER);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
    expect(documents).toHaveLength(0);
  });

  it("refuses an admin planting evidence on a customer's case", async () => {
    // Admins are read-only on case content, so uploaded evidence can
    // always be attributed to the customer.
    const res = await upload(CASE_A, ADMIN);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(403);
  });

  it("namespaces the stored key by case", async () => {
    const res = await upload(CASE_A, OWNER);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.document.storageKey.startsWith(`cases/${CASE_A}/evidence/`)).toBe(true);
  });

  it("records the content hash", async () => {
    const res = await upload(CASE_A, OWNER);
    expect(res.ok && res.document.sha256).toBeTruthy();
  });
});

/* ========================== Upload validation ========================== */

describe("Upload validation", () => {
  it("rejects an executable disguised as evidence", async () => {
    const res = await upload(CASE_A, OWNER, {
      mimeType: "application/x-msdownload",
      fileName: "evil.exe",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(415);
  });

  it("rejects office documents that can carry active content", async () => {
    expect(isAllowedMime("application/vnd.ms-excel")).toBe(false);
    expect(isAllowedMime("application/zip")).toBe(false);
    expect(isAllowedMime("image/svg+xml")).toBe(false);
  });

  it("accepts the formats customers actually upload", async () => {
    for (const m of ["image/jpeg", "image/png", "image/heic", "application/pdf"]) {
      expect(isAllowedMime(m), m).toBe(true);
    }
  });

  it("rejects an empty file", async () => {
    const res = await upload(CASE_A, OWNER, { bytes: new Uint8Array(0) });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("EMPTY_FILE");
  });

  it("rejects a file over 20 MB", async () => {
    const res = await upload(CASE_A, OWNER, {
      bytes: new Uint8Array(21 * 1024 * 1024),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(413);
  });

  it("rejects an unrecognised evidence type", async () => {
    const res = await upload(CASE_A, OWNER, { evidenceType: "made_up" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("BAD_EVIDENCE_TYPE");
  });

  it("stores nothing when validation fails", async () => {
    await upload(CASE_A, OWNER, { mimeType: "application/zip" });
    expect(documents).toHaveLength(0);
  });
});

/* ======================== Download authorisation ======================== */

describe("Download authorisation", () => {
  let docId = "";

  beforeEach(async () => {
    const res = await upload(CASE_A, OWNER);
    docId = res.ok ? res.document.id : "";
  });

  it("lets the owner download", async () => {
    const res = await getEvidenceDownload(CASE_A, OWNER, docId);
    expect(res.ok).toBe(true);
  });

  it("lets an admin read a customer's evidence", async () => {
    const res = await getEvidenceDownload(CASE_A, ADMIN, docId);
    expect(res.ok).toBe(true);
  });

  it("refuses another customer", async () => {
    const res = await getEvidenceDownload(CASE_A, STRANGER, docId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated request", async () => {
    const res = await getEvidenceDownload(CASE_A, {}, docId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(401);
  });

  it("refuses a document id borrowed from another case", async () => {
    // The document exists and cust_2 owns CASE_B, but the document
    // belongs to CASE_A — the case/document pairing must be checked.
    const res = await getEvidenceDownload(CASE_B, STRANGER, docId);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("404s an unknown document", async () => {
    const res = await getEvidenceDownload(CASE_A, OWNER, "doc_nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it("streams when the provider cannot sign", async () => {
    const res = await getEvidenceDownload(CASE_A, OWNER, docId);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.download.kind).toBe("stream");
    if (res.download.kind === "stream") {
      expect(res.download.object.bytes.byteLength).toBe(PNG.byteLength);
    }
  });
});
