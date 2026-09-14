import { getSession, type SessionData } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";

export type AdminAuth =
  | { ok: true; session: SessionData }
  | {
      ok: false;
      status: 403 | 503;
      code: "FORBIDDEN" | "DB_NOT_CONFIGURED";
      error: string;
    };

/**
 * Resolve the signed-in administrator for /api/admin/* routes.
 *
 * Strict `kind === "ADMIN"` — unlike require-customer.ts, there is no
 * backfill for an older cookie missing `kind`. Admin access is never
 * inferred. Callers map a `{ok:false}` result onto a response with
 * `fail(auth.code, auth.error, auth.status)` from lib/api/envelope.
 */
export async function requireAdmin(): Promise<AdminAuth> {
  if (!hasDb()) {
    return {
      ok: false,
      status: 503,
      code: "DB_NOT_CONFIGURED",
      error: "Database is not configured.",
    };
  }
  const session = await getSession();
  if (!session.userId || session.kind !== "ADMIN") {
    return {
      ok: false,
      status: 403,
      code: "FORBIDDEN",
      error: "Admin access required.",
    };
  }
  return { ok: true, session };
}
