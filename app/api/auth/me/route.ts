import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { findClientById } from "@/lib/db/repos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: true, user: null, hasDb: hasDb() });
  }
  const phone =
    session.kind === "CUSTOMER"
      ? ((await findClientById(session.userId))?.phone ?? null)
      : null;
  return NextResponse.json({
    ok: true,
    hasDb: hasDb(),
    user: {
      id: session.userId,
      email: session.email,
      name: session.name,
      phone,
      role: session.role,
      kind: session.kind ?? "CUSTOMER",
    },
  });
}
