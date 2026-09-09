import { NextResponse } from "next/server";
import { loginAdmin } from "@/lib/auth/service";
import { getSession, stampKindCookie } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin login. Credentials are hardcoded (see `lib/auth/service.ts`) so
 * no self-registration is possible for admins.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }
  const b = body as Partial<{ email: string; password: string }>;
  const result = await loginAdmin({
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
  session.role = result.user.role;
  session.kind = "ADMIN";
  await session.save();
  await stampKindCookie("ADMIN");
  return NextResponse.json(result);
}
