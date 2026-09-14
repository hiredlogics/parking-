import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { listAllCases, listRecentCaseEvents } from "@/lib/cases/repo";
import { listAllPayments } from "@/lib/payments/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-facing labels for the dashboard "Recent activity" feed. Unlike
 * the customer-safe allowlist in `lib/portal/overview.ts`, admin is
 * allowed to see every event type, so anything missing here just falls
 * back to a humanised version of the raw event type.
 */
const EVENT_LABELS: Record<string, string> = {
  CASE_CREATED: "Case created",
  EXTRACTION_COMPLETED: "Notice extracted",
  EXTRACTION_CONFIRMED: "Notice details confirmed",
  EXTRACTION_CORRECTED: "Notice details corrected",
  QUESTION_ANSWERED: "Question answered",
  DOCUMENT_UPLOADED: "Evidence uploaded",
  DOCUMENT_REMOVED: "Evidence removed",
  DOCUMENT_DOWNLOADED: "Document downloaded",
  PAYMENT_STARTED: "Payment started",
  PAYMENT_CONFIRMED: "Payment received",
  PDF_GENERATED: "Appeal PDF generated",
  PDF_GENERATION_FAILED: "Appeal PDF generation failed",
  PCN_STORAGE_FAILED: "Notice upload failed",
  APPEAL_AWAITING_ADMIN_APPROVAL: "Appeal submitted for review",
  APPEAL_APPROVED: "Appeal approved",
  APPEAL_HELD: "Appeal held",
  APPEAL_REJECTED: "Appeal rejected",
  OUTCOME_RECORDED: "Outcome recorded",
};

function eventLabel(type: string): string {
  return (
    EVENT_LABELS[type] ??
    type
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase())
  );
}

/**
 * GET /api/admin/dashboard — KPIs, today's totals and recent activity
 * for the admin overview page, built from the real appeal-case,
 * payment and event tables.
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

  const [cases, payments, events] = await Promise.all([
    listAllCases(1000),
    listAllPayments(500),
    listRecentCaseEvents(8),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const createdToday = cases.filter((c) => c.createdAt.startsWith(today)).length;
  const revenueToday = payments
    .filter((p) => p.status === "PAID" && (p.paidAt ?? p.createdAt).startsWith(today))
    .reduce((sum, p) => sum + p.amount, 0);

  const byLifecycle: Record<string, number> = {};
  for (const c of cases) {
    byLifecycle[c.lifecycleStatus] = (byLifecycle[c.lifecycleStatus] ?? 0) + 1;
  }
  const completed = byLifecycle.COMPLETED ?? 0;

  return ok({
    kpis: {
      total: cases.length,
      inProgress: byLifecycle.IN_PROGRESS ?? 0,
      readyForPayment: byLifecycle.READY_FOR_PAYMENT ?? 0,
      underReview: (byLifecycle.UNDER_REVIEW ?? 0) + (byLifecycle.MANUAL_REVIEW ?? 0),
      completed,
    },
    createdToday,
    revenueToday,
    openCases: cases.length - completed,
    recentCases: cases.slice(0, 5).map((c) => ({
      id: c.id,
      publicId: c.publicId,
      customerName: c.customerName,
      status: c.status,
      lifecycleStatus: c.lifecycleStatus,
      updatedAt: c.updatedAt,
    })),
    recentActivity: events.map((e) => ({
      id: e.id,
      caseId: e.caseId,
      casePublicId: e.casePublicId,
      description: eventLabel(e.eventType),
      createdAt: e.createdAt,
    })),
  });
}
