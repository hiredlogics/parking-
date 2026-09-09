import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { findOrder } from "@/lib/db/orders";
import { buildPreview, getUnlockedForOrder } from "@/lib/services/documents/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the safe view of an order for the signed-in owner (or an
 * admin). Full paragraph text is only included when payment status is
 * "PAID". Preview data is always safe to return.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "DB_NOT_CONFIGURED" }, { status: 503 });
  }
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const order = await findOrder(id);
  if (!order) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  if (order.clientId !== session.userId && session.kind !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const preview = await buildPreview(order);
  const publicOrder = {
    id: order.id,
    paymentStatus: order.paymentStatus,
    documentStatus: order.documentStatus,
    emailStatus: order.emailStatus,
    appealStatus: order.appealStatus,
    amount: order.amount,
    currency: order.currency,
    paymentReference: order.paymentReference,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    pcnNumber: order.pcnNumber,
    vrm: order.vrm,
    operator: order.operator,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    emailedAt: order.emailedAt,
  };

  if (order.paymentStatus === "PAID") {
    const unlocked = await getUnlockedForOrder(order.id);
    if (unlocked.ok) {
      return NextResponse.json({
        ok: true,
        order: publicOrder,
        preview,
        unlocked: unlocked.data,
      });
    }
  }
  return NextResponse.json({ ok: true, order: publicOrder, preview });
}
