import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, ok } from "@/lib/api/envelope";
import { listClients } from "@/lib/db/repos";
import { listAllCases } from "@/lib/cases/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * IDs from the old CRM demo seed (formerly `lib/crm/seed.ts`, now
 * removed). The seed no longer runs, but rows it already wrote to
 * existing databases may still be sitting in `clients` — filtered out
 * here so they don't linger in the admin UI.
 */
const FAKE_SEED_CLIENT_IDS = new Set([
  "cl_smith",
  "cl_brown",
  "cl_jones",
  "cl_wilson",
  "cl_taylor",
  "cl_green",
  "cl_davies",
  "cl_hall",
  "cl_white",
  "cl_johnson",
  "cl_campbell",
  "cl_allen",
  "cl_ward",
  "cl_hughes",
]);

/**
 * GET /api/admin/clients — every real customer, with their appeal-case
 * counts. Admin-only.
 */
export async function GET() {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  if (!session.userId) {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  if (session.kind === "CUSTOMER") {
    return fail("FORBIDDEN", "Admin access required.", 403);
  }

  const [clients, cases] = await Promise.all([listClients(), listAllCases(5000)]);

  const countsByCustomer = new Map<string, { total: number; active: number }>();
  for (const c of cases) {
    const entry = countsByCustomer.get(c.customerId) ?? { total: 0, active: 0 };
    entry.total += 1;
    if (c.lifecycleStatus !== "COMPLETED") entry.active += 1;
    countsByCustomer.set(c.customerId, entry);
  }

  const rows = clients
    .filter((c) => !FAKE_SEED_CLIENT_IDS.has(c.id))
    .map((c) => {
      const counts = countsByCustomer.get(c.id) ?? { total: 0, active: 0 };
      return {
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone ?? null,
        status: c.status ?? "ACTIVE",
        joinedAt: c.joinedAt,
        lastActivityAt: c.lastActivityAt,
        totalCases: counts.total,
        activeCases: counts.active,
      };
    });

  return ok({ clients: rows });
}
