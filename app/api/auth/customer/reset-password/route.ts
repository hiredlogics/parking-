import { NextResponse } from "next/server";
import { resetPasswordWithToken } from "@/lib/auth/service";
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

  const b = body as { token?: string; password?: string };
  const token = String(b.token ?? "");
  const { enforceRateLimit } = await import("@/lib/rateLimit");
  const limited = await enforceRateLimit(token.slice(0, 16) || "anonymous", "AUTH");
  if (limited) return limited;

  const result = await resetPasswordWithToken({
    token,
    password: String(b.password ?? ""),
  });
  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}
