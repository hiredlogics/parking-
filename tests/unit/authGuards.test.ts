/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { sealData } from "iron-session";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionPassword,
  type SessionData,
} from "@/lib/auth/sessionConfig";

/**
 * Auth guard regressions.
 *
 * Both bugs covered here were observed live: a signed-out visitor
 * reached /appeal/upload and burned paid extraction calls, then got a
 * 403 from POST /api/cases that the client could not recover from.
 */

async function seal(data: SessionData): Promise<string> {
  return sealData(data, { password: sessionPassword(), ttl: SESSION_MAX_AGE });
}

function request(path: string, cookie?: string): NextRequest {
  const req = new NextRequest(`http://test.local${path}`);
  if (cookie !== undefined) req.cookies.set(SESSION_COOKIE, cookie);
  return req;
}

const { middleware } = await import("@/middleware");

/* =========================== Middleware =========================== */

describe("Middleware session validation", () => {
  it("lets a valid customer session through to the appeal flow", async () => {
    const res = await middleware(
      request("/appeal/upload", await seal({ userId: "c1", kind: "CUSTOMER" })),
    );
    expect(res.status).toBe(200);
  });

  it("redirects a visitor with no cookie to signup", async () => {
    const res = await middleware(request("/appeal/upload"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signup");
  });

  it("redirects an UNDECRYPTABLE cookie instead of rendering the page", async () => {
    // The live bug: presence-only checking let this through, so the page
    // rendered while every API call behind it returned 401.
    const res = await middleware(request("/appeal/upload", "garbage-not-a-seal"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signup");
  });

  it("clears a stale cookie so the next visit starts clean", async () => {
    const res = await middleware(request("/appeal/upload", "garbage-not-a-seal"));
    expect(res.headers.get("set-cookie")).toMatch(/pag_admin_session=/);
  });

  it("treats a sealed session with no userId as signed out", async () => {
    const res = await middleware(request("/appeal/upload", await seal({})));
    expect(res.status).toBe(307);
  });

  it("rejects a cookie sealed with a different password", async () => {
    const foreign = await sealData(
      { userId: "c1", kind: "CUSTOMER" },
      { password: "an-entirely-different-password-of-32-chars-min!!", ttl: SESSION_MAX_AGE },
    );
    const res = await middleware(request("/appeal/upload", foreign));
    expect(res.status).toBe(307);
  });

  it("sends an admin session on a customer path to signin, without logging them out", async () => {
    const cookie = await seal({ userId: "a1", kind: "ADMIN" });
    const res = await middleware(request("/appeal/upload", cookie));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signin");
    // A VALID session must survive a wrong-kind redirect.
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/pag_admin_session=;/);
  });

  it("guards admin paths against a customer session", async () => {
    const cookie = await seal({ userId: "c1", kind: "CUSTOMER" });
    const res = await middleware(request("/admin/cases", cookie));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets a valid admin session into the CRM", async () => {
    const cookie = await seal({ userId: "a1", kind: "ADMIN" });
    const res = await middleware(request("/admin/cases", cookie));
    expect(res.status).toBe(200);
  });

  it("ignores an unguarded path entirely", async () => {
    const res = await middleware(request("/"));
    expect(res.status).toBe(200);
  });

  it("does not trust a client-set pag_kind over the sealed value", async () => {
    // pag_kind is readable and editable by the browser; the sealed
    // session is authoritative.
    const req = new NextRequest("http://test.local/admin/cases");
    req.cookies.set(SESSION_COOKIE, await seal({ userId: "c1", kind: "CUSTOMER" }));
    req.cookies.set("pag_kind", "ADMIN");
    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("preserves the intended destination for post-login return", async () => {
    const res = await middleware(request("/appeal/evidence"));
    const location = res.headers.get("location") ?? "";
    expect(location).toContain("next=%2Fappeal%2Fevidence");
  });
});

/* ==================== createCaseForCustomer codes ==================== */

const findCase = vi.fn();
vi.mock("@/lib/cases/repo", () => ({
  findCase: (...a: unknown[]) => findCase(...a),
  createCase: async () => ({ id: "case_1", publicId: "PAG-1" }),
  findCasesForCustomer: async () => [],
  findResumableCase: async () => null,
  listCaseDocuments: async () => [],
  addCaseEvent: async () => {},
  setCaseStatus: async () => {},
}));

const { createCaseForCustomer } = await import("@/lib/cases/service");

beforeEach(() => findCase.mockReset());

describe("createCaseForCustomer status codes", () => {
  it("returns 401 for a signed-out caller, not 403", async () => {
    // The live bug: a 403 here meant the client never redirected to
    // sign-in, leaving the customer in a silent retry loop.
    const res = await createCaseForCustomer({});
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(401);
      expect(res.code).toBe("UNAUTHENTICATED");
    }
  });

  it("returns 403 for an admin session, which signing in cannot fix", async () => {
    const res = await createCaseForCustomer({ userId: "a1", kind: "ADMIN" });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(403);
      expect(res.code).toBe("CUSTOMER_REQUIRED");
    }
  });

  it("creates a case for a customer session", async () => {
    const res = await createCaseForCustomer({ userId: "c1", kind: "CUSTOMER" });
    expect(res.ok).toBe(true);
  });
});
