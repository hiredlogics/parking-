import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { generateValidatedAppeal } from "@/lib/generation/engine";
import { insertAuditEvent } from "@/lib/kb/audit";
import { openManualReview } from "@/lib/generation/manualReview";
import type { AnswerMap } from "@/lib/questions/types";
import type { ConfirmedPcn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  confirmed: ConfirmedPcn;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  evidenceRefs?: string[];
  caseId?: string;
}

/**
 * Full generation pipeline: analyse, retrieve, draft, validate, release.
 *
 * A BLOCKING validation failure never releases. It opens a manual review
 * record instead. The letter body is returned to ADMIN sessions only —
 * the customer receives it through the paid document endpoint.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json(
      { success: false, error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } },
      { status: 401 },
    );
  }

  const limited = await (
    await import("@/lib/rateLimit")
  ).enforceRateLimit(session.userId, "GENERATION");
  if (limited) return limited;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid body." } },
      { status: 400 },
    );
  }
  if (!body?.confirmed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CONFIRMATION_REQUIRED",
          message: "Confirmed notice details are required before generation.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await generateValidatedAppeal({
      confirmed: body.confirmed,
      answers: body.answers ?? {},
      evidenceTypes: body.evidenceTypes ?? [],
      evidenceRefs: body.evidenceRefs ?? [],
    });

    // Persist the outcome for audit, and open a review when blocked.
    if (hasDb()) {
      try {
        await insertAuditEvent({
          eventType:
            result.status === "READY"
              ? "VALIDATION_COMPLETED"
              : "MANUAL_REVIEW_REQUESTED",
          caseId: body.caseId ?? null,
          actorId: session.userId,
          payload: {
            status: result.status,
            reason: result.reason,
            primaryRoute: result.analysis.primaryRoute,
            moduleIds: result.moduleIds,
            provider: result.provider?.providerId ?? null,
            promptVersion: result.provider?.promptVersion ?? null,
            blockingCount:
              result.attempts[result.attempts.length - 1]?.validation
                .blockingCount ?? 0,
            generationVersion: result.generationVersion,
          },
        });
        if (result.status === "MANUAL_REVIEW") {
          await openManualReview({
            caseId: body.caseId ?? null,
            reason: result.reason ?? "VALIDATION_FAILED",
            detail: result.detail,
          });
        }
      } catch (auditErr) {
        // Audit failure must not lose the generation result.
        console.error("[api/generation/run] audit failed:", auditErr);
      }
    }

    const lastAttempt = result.attempts[result.attempts.length - 1];

    if (session.kind !== "ADMIN") {
      return NextResponse.json({
        success: true,
        data: {
          status: result.status,
          // Customer-safe: never the body, never validator internals.
          needsReview: result.status === "MANUAL_REVIEW",
          reviewDetail:
            result.status === "MANUAL_REVIEW" ? result.detail : null,
          paragraphCount: result.body
            ? result.body.split(/\n{2,}/).filter(Boolean).length
            : 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        status: result.status,
        body: result.body,
        reason: result.reason,
        detail: result.detail,
        moduleIds: result.moduleIds,
        provider: result.provider,
        warnings: result.warnings,
        generationVersion: result.generationVersion,
        analysis: {
          primaryRoute: result.analysis.primaryRoute,
          secondaryRoutes: result.analysis.secondaryRoutes,
          codeVersion: result.analysis.codeVersion,
          pofaRoute: result.analysis.pofa.route,
          pofaTiming: result.analysis.pofa.timingStatus,
          driverStatus: result.analysis.driverStatus,
        },
        attempts: result.attempts.map((a) => ({
          attempt: a.attempt,
          accepted: a.accepted,
          status: a.validation.status,
          blockingCount: a.validation.blockingCount,
          warningCount: a.validation.warningCount,
          passed: a.validation.passed,
          issues: a.validation.issues,
          checklist: a.checklist.items,
        })),
        validatorVersion: lastAttempt?.validation.validatorVersion ?? null,
      },
    });
  } catch (err) {
    console.error("[api/generation/run] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: { code: "GENERATION_FAILED", message: "The appeal could not be generated." },
      },
      { status: 500 },
    );
  }
}
