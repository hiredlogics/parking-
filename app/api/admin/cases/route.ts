import { requireAdmin } from "@/lib/auth/require-admin";
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
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

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
