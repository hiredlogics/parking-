import { assembleAppeal, type AssembledAppeal } from "@/lib/assembly";
import { evaluate } from "@/rules";
import { getEffectiveParagraphs, getEffectiveRules } from "@/lib/appealLogic";
import { renderAppealPdf } from "@/services/documents/pdf";
import { renderAppealDocx } from "@/services/documents/docx";
import { findOrder, type OrderRow } from "@/lib/db/orders";

/**
 * DocumentAccessService — the only server-side path to the clean
 * appeal. Every route that returns paragraph text, PDF or DOCX MUST go
 * through here so the payment gate cannot be bypassed by hitting an
 * older endpoint.
 *
 * The rules are simple:
 *   - Metadata (ground count, PCN etc.) is always safe to return.
 *   - Full paragraph text + document bytes require `order.paymentStatus === "PAID"`.
 */

async function assembleFromOrder(order: OrderRow): Promise<AssembledAppeal> {
  const snap = order.inputSnapshot;
  const [rules, paragraphs] = await Promise.all([getEffectiveRules(), getEffectiveParagraphs()]);
  const evaluation = evaluate(
    { pcn: snap.pcn, answers: snap.answers, evidence: snap.evidence ?? [] },
    rules,
  );
  return assembleAppeal(snap.pcn, snap.answers, snap.evidence ?? [], evaluation, paragraphs);
}

/**
 * Preview payload — safe to send before payment. Contains structural
 * metadata but NO paragraph text. The frontend uses this to render the
 * masked/watermarked preview.
 */
export interface PreviewPayload {
  pcnNumber: string | null;
  vrm: string | null;
  operator: string | null;
  groundCount: number;
  evidenceCount: number;
  paragraphCount: number;
  keeperSafe: boolean;
  hasUnresolvedVariables: boolean;
  ready: boolean;
}

export async function buildPreview(order: OrderRow): Promise<PreviewPayload> {
  const appeal = await assembleFromOrder(order);
  const ready = appeal.keeperSafe && appeal.unresolvedVariables.length === 0;
  return {
    pcnNumber: order.pcnNumber,
    vrm: order.vrm,
    operator: order.operator,
    groundCount: order.groundCount,
    evidenceCount: order.evidenceCount,
    paragraphCount: appeal.paragraphs.length,
    keeperSafe: appeal.keeperSafe,
    hasUnresolvedVariables: appeal.unresolvedVariables.length > 0,
    ready,
  };
}

/**
 * The unlocked, post-payment payload. Contains every paragraph's full
 * text and metadata. Callers MUST verify `order.paymentStatus === "PAID"`
 * before invoking this function — `getUnlockedForOrder` below encodes
 * that contract.
 */
export interface UnlockedPayload {
  paragraphs: { id: string; text: string }[];
  pcn: OrderRow["inputSnapshot"]["pcn"];
  evidence: OrderRow["inputSnapshot"]["evidence"];
  groundCount: number;
}

export async function getUnlockedForOrder(
  orderId: string,
): Promise<{ ok: true; data: UnlockedPayload } | { ok: false; reason: string; status: number }> {
  const order = await findOrder(orderId);
  if (!order) return { ok: false, reason: "Order not found.", status: 404 };
  if (order.paymentStatus !== "PAID") {
    return { ok: false, reason: "Payment required.", status: 402 };
  }
  const appeal = await assembleFromOrder(order);
  return {
    ok: true,
    data: {
      paragraphs: appeal.paragraphs.map((p) => ({ id: p.id, text: p.text })),
      pcn: order.inputSnapshot.pcn,
      evidence: order.inputSnapshot.evidence ?? [],
      groundCount: order.groundCount,
    },
  };
}

/**
 * Render the clean document bytes for a paid order. Refuses to render
 * anything if the order isn't paid.
 */
export async function renderOrderDocument(
  orderId: string,
  format: "pdf" | "docx",
): Promise<
  | { ok: true; bytes: Uint8Array; filename: string; contentType: string; order: OrderRow }
  | { ok: false; reason: string; status: number }
> {
  const order = await findOrder(orderId);
  if (!order) return { ok: false, reason: "Order not found.", status: 404 };
  if (order.paymentStatus !== "PAID") {
    return { ok: false, reason: "Payment required.", status: 402 };
  }
  const appeal = await assembleFromOrder(order);
  const snap = order.inputSnapshot;
  const safeSuffix = (order.pcnNumber ?? order.vrm ?? order.id)
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 32) || order.id;
  const filename = `Parking-Appeal-${safeSuffix}.${format}`;
  if (format === "pdf") {
    const bytes = await renderAppealPdf({
      pcn: snap.pcn,
      answers: snap.answers,
      evidence: snap.evidence ?? [],
      appeal,
    });
    return {
      ok: true,
      bytes: new Uint8Array(bytes),
      filename,
      contentType: "application/pdf",
      order,
    };
  }
  const bytes = await renderAppealDocx({
    pcn: snap.pcn,
    answers: snap.answers,
    evidence: snap.evidence ?? [],
    appeal,
  });
  return {
    ok: true,
    bytes: new Uint8Array(bytes),
    filename,
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    order,
  };
}
