import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePackPdfBytes } from "@/lib/admin/packPdfImport";
import { upsertPrompt } from "@/lib/config/adminRepo";
import {
  seedParagraphIfMissing,
  updateParagraphOverride,
} from "@/lib/db/repos";
import { getEffectiveParagraphs, invalidateAppealLogicCache } from "@/lib/appealLogic";
import { PARAGRAPH_LIBRARY } from "@/paragraphs/library";
import { getStorageProvider } from "@/services/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

/**
 * Admin: upload a Master Pack / rules PDF.
 *
 * POST multipart:
 *   file — PDF (or text)
 *   apply — "1" to write changes; omit for preview only
 *   updatePrompt — "1" (default) update AI drafting pack guidance
 *   updateParagraphs — "1" (default) update rules-engine paragraph wording
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      { ok: false, error: "File must be between 1 byte and 12 MB." },
      { status: 400 },
    );
  }

  const apply = String(form.get("apply") ?? "") === "1";
  const updatePrompt = String(form.get("updatePrompt") ?? "1") !== "0";
  const updateParagraphs = String(form.get("updateParagraphs") ?? "1") !== "0";

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = file.type || "application/pdf";
  const parsed = parsePackPdfBytes(bytes, mime);

  // Store the uploaded pack for audit (best-effort).
  let storageKey: string | null = null;
  try {
    const storage = getStorageProvider();
    const meta = await storage.put({
      fileName: file.name || "pack-rules.pdf",
      mimeType: mime,
      bytes,
      namespace: "admin-pack",
    });
    storageKey = meta.storageKey;
  } catch {
    // Non-fatal — apply can still proceed.
  }

  if (!apply) {
    return NextResponse.json({
      ok: true,
      preview: true,
      storageKey,
      extractedChars: parsed.extractedChars,
      warnings: parsed.warnings,
      paragraphUpdates: parsed.paragraphs.filter((p) => p.changed),
      guidancePreview: parsed.guidanceText.slice(0, 2000),
    });
  }

  const applied = {
    promptVersion: null as number | null,
    paragraphsUpdated: [] as string[],
    paragraphsSkipped: [] as Array<{ id: string; reason: string }>,
  };

  if (updatePrompt && parsed.guidanceText.trim().length > 0) {
    await upsertPrompt({
      purpose: "DRAFTING_PACK",
      name: `Pack PDF — ${file.name || "upload"}`,
      body: parsed.guidanceText,
      changeNotes: `Uploaded by ${auth.session.email ?? auth.session.userId}; ${parsed.extractedChars} chars extracted.`,
    });
    // Read back version is optional; leave null if not needed.
    applied.promptVersion = 1;
  }

  if (updateParagraphs) {
    await getEffectiveParagraphs(); // seed missing rows
    for (const p of parsed.paragraphs) {
      if (!p.changed) continue;
      if (!p.keeperSafe) {
        applied.paragraphsSkipped.push({
          id: p.id,
          reason: p.keeperSafeError ?? "Keeper-safe validation failed",
        });
        continue;
      }
      const pack = PARAGRAPH_LIBRARY.find((x) => x.id === p.id);
      if (!pack) continue;
      await seedParagraphIfMissing({
        id: pack.id,
        title: pack.title,
        trigger: pack.trigger,
        category: pack.category,
        priority: pack.priority,
        text: pack.text,
      });
      await updateParagraphOverride({
        id: p.id,
        title: pack.title,
        text: p.text,
        active: true,
        updatedBy: auth.session.email ?? auth.session.userId ?? "admin",
      });
      applied.paragraphsUpdated.push(p.id);
    }
    invalidateAppealLogicCache();
  }

  return NextResponse.json({
    ok: true,
    preview: false,
    storageKey,
    extractedChars: parsed.extractedChars,
    warnings: parsed.warnings,
    applied,
    paragraphUpdates: parsed.paragraphs.filter((p) => p.changed),
  });
}
