import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { findAppealById } from "@/lib/appeals/repo";
import * as caseRepo from "@/lib/cases/repo";
import {
  approveAppeal,
  holdAppeal,
  rejectAppeal,
} from "@/lib/appeals/approve";
import { previewAppealPdf } from "@/lib/appeals/previewPdf";
import { generateAppealForCase } from "@/lib/generation/caseGeneration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/review/[id] — full review payload
 * POST — { action: APPROVE | HOLD | REJECT | REGENERATE | PREVIEW_PDF, reason?, notes?, bodyText? }
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) {
    return NextResponse.json(
      { success: false, error: { code: "DB_NOT_CONFIGURED", message: "Database not configured." } },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const appeal = await findAppealById(id);
  if (!appeal) {
    return NextResponse.json(
      { success: false, error: { code: "NOT_FOUND", message: "Appeal not found." } },
      { status: 404 },
    );
  }
  const appealCase = await caseRepo.findCase(appeal.caseId);
  const [evidence, pcnDocs] = await Promise.all([
    caseRepo.listCaseDocuments(appeal.caseId, "EVIDENCE"),
    caseRepo.listCaseDocuments(appeal.caseId, "PCN"),
  ]);

  const documents = [...pcnDocs, ...evidence].map((d) => ({
    id: d.id,
    fileName: d.fileName,
    documentType: d.documentType,
    evidenceType: d.evidenceType,
    mimeType: d.mimeType,
    sizeBytes: d.sizeBytes,
    viewUrl: `/api/cases/${appeal.caseId}/documents/${d.id}?disposition=inline`,
    downloadUrl: `/api/cases/${appeal.caseId}/documents/${d.id}?disposition=attachment`,
  }));

  return NextResponse.json({
    success: true,
    data: {
      appeal,
      case: appealCase,
      evidence,
      documents,
    },
  });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) {
    return NextResponse.json(
      { success: false, error: { code: "DB_NOT_CONFIGURED", message: "Database not configured." } },
      { status: 503 },
    );
  }
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return NextResponse.json(
      { success: false, error: { code: "FORBIDDEN", message: "Admin access required." } },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  let body: { action?: string; reason?: string; notes?: string; bodyText?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "BAD_REQUEST", message: "Invalid body." } },
      { status: 400 },
    );
  }

  const action = String(body.action ?? "").toUpperCase();
  const reason = String(body.reason ?? "Admin action");
  const notes = body.notes ? String(body.notes) : undefined;

  if (action === "PREVIEW_PDF") {
    const result = await previewAppealPdf(id, session, {
      bodyText: body.bodyText ? String(body.bodyText) : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    return new NextResponse(Buffer.from(result.bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${result.fileName.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  if (action === "APPROVE") {
    const result = await approveAppeal(id, session, {
      bodyText: body.bodyText ? String(body.bodyText) : undefined,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, data: result });
  }

  if (action === "HOLD") {
    const result = await holdAppeal(id, session, reason, notes);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, data: result });
  }

  if (action === "REJECT") {
    const result = await rejectAppeal(id, session, reason, notes);
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    return NextResponse.json({ success: true, data: result });
  }

  if (action === "REGENERATE") {
    const appeal = await findAppealById(id);
    if (!appeal) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Appeal not found." } },
        { status: 404 },
      );
    }
    const result = await generateAppealForCase(appeal.caseId, session, {
      force: true,
    });
    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: { code: result.code, message: result.message } },
        { status: result.status },
      );
    }
    return NextResponse.json({
      success: true,
      data: { regenerated: true, draftId: result.draft.id },
    });
  }

  return NextResponse.json(
    { success: false, error: { code: "BAD_ACTION", message: "Unknown action." } },
    { status: 400 },
  );
}
