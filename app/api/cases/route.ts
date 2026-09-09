import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok, readJson } from "@/lib/api/envelope";
import {
  createCaseForCustomer,
  getCustomerCaseState,
  resumeCaseForCustomer,
} from "@/lib/cases/service";
import { findCasesForCustomer } from "@/lib/cases/repo";
import type { ServiceType } from "@/lib/cases/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/cases  — the caller's cases plus the one to resume.
 * POST /api/cases  — start a new appeal case.
 */
export async function GET() {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  if (!session.userId) {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  if (session.kind === "ADMIN") {
    return fail("CUSTOMER_REQUIRED", "This endpoint is for customers.", 403);
  }

  const cases = await findCasesForCustomer(session.userId);
  const resumable = await resumeCaseForCustomer(session);

  // Only the resumable case is returned in full, to keep the payload
  // small and avoid shipping every case's answers to the browser.
  let resumeState = null;
  if (resumable) {
    const state = await getCustomerCaseState(resumable.id, session);
    if (state.ok) resumeState = state.state;
  }

  return ok({
    cases: cases.map((c) => ({
      id: c.id,
      publicId: c.publicId,
      status: c.status,
      serviceType: c.serviceType,
      pcnNumber: c.pcnNumber,
      vrm: c.vrm,
      operatorName: c.operatorName,
      paymentStatus: c.paymentStatus,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
    resume: resumeState,
  });
}

export async function POST(request: Request) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();

  const body = await readJson<{ serviceType?: ServiceType }>(request);
  const created = await createCaseForCustomer(
    session,
    body?.serviceType ?? "PRIVATE_PARKING_INITIAL_APPEAL",
  );
  if (!created.ok) return failFromAccess(created);

  const state = await getCustomerCaseState(created.appealCase.id, session);
  if (!state.ok) return failFromAccess(state);
  return ok({ case: state.state }, 201);
}
