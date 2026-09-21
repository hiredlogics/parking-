import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { analyseCase, factsForCase } from "@/lib/analysis/engine";
import { retrieveKnowledge } from "@/lib/retrieval/engine";
import { KbCatalogError, loadKbCatalog } from "@/lib/kb/catalog";
import type { AnswerMap } from "@/lib/questions/types";
import type { ConfirmedPcn } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  confirmed: ConfirmedPcn;
  answers?: AnswerMap;
  evidenceTypes?: string[];
  evidenceRefs?: string[];
  /** Admin-only: include the full internal trace in the response. */
  includeTrace?: boolean;
}

/**
 * Run issue analysis + knowledge retrieval.
 *
 * KB §16 rule 7 forbids exposing module IDs, retrieval scores or
 * internal reasoning to the customer. So a CUSTOMER session receives
 * only a safe summary; the full analysis, module list and decision trace
 * are returned to ADMIN sessions only.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "FORBIDDEN",
          message: "Admin access required. Customer analysis runs inside the paid case pipeline.",
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
          message: "Confirmed notice details are required before analysis.",
        },
      },
      { status: 400 },
    );
  }

  try {
    const analysis = analyseCase({
      confirmed: body.confirmed,
      answers: body.answers ?? {},
      evidenceTypes: body.evidenceTypes ?? [],
      evidenceRefs: body.evidenceRefs ?? [],
    });
    let catalog;
    try {
      catalog = await loadKbCatalog();
    } catch (err) {
      if (err instanceof KbCatalogError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "KB_CATALOG_UNAVAILABLE",
              message: err.message,
            },
          },
          { status: 503 },
        );
      }
      throw err;
    }
    const retrieval = retrieveKnowledge({
      analysis,
      facts: factsForCase({
        confirmed: body.confirmed,
        answers: body.answers ?? {},
        evidenceTypes: body.evidenceTypes ?? [],
      }),
      parkingEventDate: body.confirmed.parking_event_date ?? null,
      evidenceTypes: body.evidenceTypes ?? [],
      modules: catalog.modules,
      sources: catalog.sources,
      blocks: catalog.blocks,
    });

    const isAdmin = session.kind === "ADMIN";
    if (!isAdmin) {
      // Customer-safe summary only — no module IDs, no reasoning.
      return NextResponse.json({
        success: true,
        data: {
          ready: analysis.manualReview === null,
          manualReview: analysis.manualReview
            ? { detail: analysis.manualReview.detail }
            : null,
          groundCount: retrieval.output.moduleIds.length > 0
            ? 1 + analysis.secondaryRoutes.length
            : 0,
          missingFactCount: analysis.missingFacts.length,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        analysis,
        retrieval: {
          output: retrieval.output,
          moduleIds: retrieval.modules.map((m) => m.moduleId),
          blockIds: retrieval.blocks.map((b) => b.blockId),
          sourceIds: retrieval.sources.map((s) => s.sourceId),
          retrievalVersion: retrieval.retrievalVersion,
          trace: body.includeTrace ? retrieval.trace : undefined,
        },
      },
    });
  } catch (err) {
    console.error("[api/analysis/run] failed:", err);
    return NextResponse.json(
      {
        success: false,
        error: { code: "ANALYSIS_FAILED", message: "Analysis could not be completed." },
      },
      { status: 500 },
    );
  }
}
