import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { listAllCases } from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/cases — every appeal case.
 *
 * Admin-only, and unlike the customer endpoints this returns internal
 * state (routes, sufficiency, payment) because that is exactly what the
 * CRM needs to triage.
 */
export async function GET() {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  if (!session.userId) {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  if (session.kind === "CUSTOMER") {
    return fail("FORBIDDEN", "Admin access required.", 403);
  }

  const cases = await listAllCases();
  return ok({
    cases: cases.map((c) => ({
      id: c.id,
      publicId: c.publicId,
      customerName: c.customerName,
      customerEmail: c.customerEmail,
      status: c.status,
      lifecycleStatus: c.lifecycleStatus,
      serviceType: c.serviceType,
      operatorName: c.operatorName,
      pcnNumber: c.pcnNumber,
      vrm: c.vrm,
      parkingEventDate: c.parkingEventDate,
      primaryRoute: c.primaryRoute,
      candidateRoutes: c.candidateRoutes,
      sufficiencyStatus: c.sufficiencyStatus,
      questioningComplete: c.questioningComplete,
      outstandingCount: c.missingFacts.length,
      paymentStatus: c.paymentStatus,
      outOfScopeReason: c.outOfScopeReason,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })),
  });
}
