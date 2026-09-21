import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { draftAppeal } from "@/lib/drafting/engine";
import type { AnswerMap } from "@/lib/questions/types";
import type { ConfirmedPcn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  confirmed: ConfirmedPcn;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  evidenceRefs?: string[];
}

/**
 * Generate a bespoke appeal draft.
 *
 * The draft is stored server-side by the order/payment flow — this
 * endpoint is for admin preview and for the generation pipeline. A
 * CUSTOMER session receives only status metadata, never the letter body,
 * because the payment gate owns that (V2 payment-lock requirement).
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin access required. Customer drafting runs inside the paid case pipeline.",
        },
      },
      { status: 403 },
    );
  }

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
          message: "Confirmed notice details are required before drafting.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await draftAppeal({
      confirmed: body.confirmed,
      answers: body.answers ?? {},
      evidenceTypes: body.evidenceTypes ?? [],
      evidenceRefs: body.evidenceRefs ?? [],
    });

    if (session.kind !== "ADMIN") {
      // Customer-safe: no body, no module IDs, no reasoning.
      return NextResponse.json({
        success: true,
        data: {
          ready: result.ok,
          blockedReason: result.blockedReason,
          paragraphCount: result.body
            ? result.body.split(/\n{2,}/).filter(Boolean).length
            : 0,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ok: result.ok,
        body: result.body,
        blockedReason: result.blockedReason,
        keeperSafe: result.keeperSafe,
        keeperSafeViolations: result.keeperSafeViolations,
        appliedTransformations: result.appliedTransformations,
        strippedIdentifiers: result.strippedIdentifiers,
        unresolvedVariables: result.unresolvedVariables,
        warnings: result.warnings,
        engineVersion: result.engineVersion,
        provider: result.draft
          ? {
              providerId: result.draft.providerId,
              promptVersion: result.draft.promptVersion,
              model: result.draft.model,
              bespoke: result.draft.bespoke,
              moduleIds: result.draft.moduleIds,
              usage: result.draft.usage,
            }
          : null,
        analysis: {
          primaryRoute: result.analysis.primaryRoute,
          secondaryRoutes: result.analysis.secondaryRoutes,
          codeVersion: result.analysis.codeVersion,
          pofaRoute: result.analysis.pofa.route,
          pofaTiming: result.analysis.pofa.timingStatus,
          driverStatus: result.analysis.driverStatus,
        },
      },
    });
  } catch (err) {
    console.error("[api/drafting/run] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: { code: "DRAFTING_FAILED", message: "The appeal could not be drafted." },
      },
      { status: 500 },
    );
  }
}
