import { NextResponse } from "next/server";
import { clearKindCookie, getSession } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = await getSession();
  session.destroy();
  await clearKindCookie();
  return NextResponse.json({ ok: true });
}
