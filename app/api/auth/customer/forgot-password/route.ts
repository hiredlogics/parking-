import { NextResponse } from "next/server";
import { requestPasswordReset } from "@/lib/auth/service";
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

  const email = String((body as { email?: string }).email ?? "").trim().toLowerCase();
  const { enforceRateLimit } = await import("@/lib/rateLimit");
  const limited = await enforceRateLimit(email || "anonymous", "AUTH");
  if (limited) return limited;

  const result = await requestPasswordReset(email);
  return NextResponse.json(result);
}
