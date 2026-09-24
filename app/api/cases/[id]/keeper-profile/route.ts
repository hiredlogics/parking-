import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok } from "@/lib/api/envelope";
import { saveKeeperProfileForCase } from "@/lib/cases/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cases/[id]/keeper-profile
 *
 * Saves registered-keeper name + address and/or free-text situation notes.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return fail("BAD_REQUEST", "Invalid JSON body.", 400);
  }

  const result = await saveKeeperProfileForCase(id, session, {
    keeper_name:
      body.keeper_name !== undefined ? String(body.keeper_name) : undefined,
    keeper_address_line1:
      body.keeper_address_line1 !== undefined
        ? String(body.keeper_address_line1)
        : undefined,
    keeper_address_line2:
      body.keeper_address_line2 !== undefined
        ? String(body.keeper_address_line2)
        : undefined,
    keeper_town:
      body.keeper_town !== undefined ? String(body.keeper_town) : undefined,
    keeper_postcode:
      body.keeper_postcode !== undefined ? String(body.keeper_postcode) : undefined,
    situation_other:
      body.situation_other !== undefined ? String(body.situation_other) : undefined,
    registered_keeper:
      body.registered_keeper !== undefined
        ? String(body.registered_keeper)
        : undefined,
  });

  if (!result.ok) {
    if ("status" in result && result.status === 400) {
      return fail(result.code, result.message, 400);
    }
    return failFromAccess(result);
  }

  return ok({ adaptiveAnswers: result.adaptiveAnswers });
}
