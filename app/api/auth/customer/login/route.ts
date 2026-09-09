import { NextResponse } from "next/server";
import { loginCustomer } from "@/lib/auth/service";
import { getSession, stampKindCookie } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, error: "The database isn't configured yet. Try again shortly." },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const b = body as Partial<{ email: string; password: string }>;
  const result = await loginCustomer({
    email: String(b.email ?? ""),
    password: String(b.password ?? ""),
  });
  if (!result.ok || !result.user) {
    return NextResponse.json(result, { status: 401 });
  }
  const session = await getSession();
  session.userId = result.user.id;
  session.email = result.user.email;
  session.name = result.user.name;
  session.role = "CUSTOMER";
  session.kind = "CUSTOMER";
  await session.save();
  await stampKindCookie("CUSTOMER");
  return NextResponse.json(result);
}
