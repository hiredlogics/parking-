import { NextResponse } from "next/server";
import { hasDb } from "@/lib/db/pool";
import { getSql } from "@/lib/db/pool";
import { isProductionRuntime } from "@/lib/config/production";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness + shallow readiness for load balancers / Mojo / DO.
 * Does not expose secrets, config values, or customer data.
 */
export async function GET() {
  const started = Date.now();
  let db: "ok" | "unavailable" | "skipped" = "skipped";

  if (hasDb()) {
    try {
      const sql = getSql();
      await sql.query("SELECT 1");
      db = "ok";
    } catch {
      db = "unavailable";
    }
  } else if (isProductionRuntime()) {
    db = "unavailable";
  }

  const ready = db !== "unavailable";
  const body = {
    ok: ready,
    service: "parking-appeals",
    env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "unknown",
    db,
    basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
    ms: Date.now() - started,
  };

  return NextResponse.json(body, { status: ready ? 200 : 503 });
}
