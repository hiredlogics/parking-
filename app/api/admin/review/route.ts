import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { listAppealsForReview } from "@/lib/appeals/repo";
import * as caseRepo from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/review
 * Queue of appeals awaiting admin approval.
 *
 * Does not re-seed admin config on every poll — that was blocking the
 * queue UI for 20–30s on slow Neon connections.
 */
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DB_NOT_CONFIGURED",
          message: "Database not configured.",
        },
      },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "Admin access required." },
      },
      { status: 403 },
    );
  }

  try {
    const appeals = await listAppealsForReview();
    const enriched = await Promise.all(
      appeals.map(async (a) => {
        const c = await caseRepo.findCase(a.caseId);
        return {
          appeal: {
            id: a.id,
            caseId: a.caseId,
            status: a.status,
            createdAt: a.createdAt,
            moduleIds: a.moduleIds,
            issuesJson: a.issuesJson,
          },
          case: c
            ? {
                id: c.id,
                publicId: c.publicId,
                customerId: c.customerId,
                operatorName: c.operatorName,
                pcnNumber: c.pcnNumber,
                vrm: c.vrm,
                parkingLocation: c.parkingLocation,
                parkingEventDate: c.parkingEventDate,
                status: c.status,
              }
            : null,
        };
      }),
    );

    return NextResponse.json({ success: true, data: { items: enriched } });
  } catch (err) {
    console.error("[api/admin/review]", err);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "REVIEW_QUEUE_FAILED",
          message:
            err instanceof Error
              ? err.message
              : "Could not load appeals for review.",
        },
      },
      { status: 500 },
    );
  }
}
