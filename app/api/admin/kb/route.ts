import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { ensureKbSeeded } from "@/lib/kb/seed";
import {
  listCodeVersions,
  listDraftingBlocks,
  listKbModules,
  listLegalSources,
} from "@/lib/kb/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin read access to the controlled knowledge base.
 *
 * V2 §19 requires the KB to be editable independently of application
 * code. This endpoint is the read half; module/source status changes go
 * through dedicated PATCH endpoints so an audit trail can be attached.
 */
export async function GET() {
  if (!hasDb()) {
    return NextResponse.json(
      { success: false, error: { code: "DB_NOT_CONFIGURED", message: "Database is not configured." } },
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
  try {
    const seed = await ensureKbSeeded();
    const [modules, sources, codeVersions, blocks] = await Promise.all([
      listKbModules(),
      listLegalSources(),
      listCodeVersions(),
      listDraftingBlocks(),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        seed,
        counts: {
          modules: modules.length,
          activeModules: modules.filter((m) => m.status === "ACTIVE").length,
          sources: sources.length,
          codeVersions: codeVersions.length,
          blocks: blocks.length,
          activeBlocks: blocks.filter((b) => b.status === "ACTIVE").length,
          reviewBlocks: blocks.filter((b) => b.status === "REVIEW").length,
        },
        modules,
        sources,
        codeVersions,
        blocks,
      },
    });
  } catch (err) {
    console.error("[api/admin/kb] failed:", err);
    const message = err instanceof Error ? err.message : "Failed to load knowledge base.";
    return NextResponse.json(
      { success: false, error: { code: "KB_LOAD_FAILED", message } },
      { status: 500 },
    );
  }
}
