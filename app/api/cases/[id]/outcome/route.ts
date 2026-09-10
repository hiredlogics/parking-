import { getSession } from "@/lib/auth/session";
import { hasDb } from "@/lib/db/pool";
import { fail, failFromAccess, ok, readJson } from "@/lib/api/envelope";
import { recordOutcomeForCase, toOutcomeView } from "@/lib/cases/outcome";
import { requireCaseAccess } from "@/lib/cases/service";
import type { CaseOutcomeStatus } from "@/types/caseState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/cases/[id]/outcome — current outcome state.
 * POST /api/cases/[id]/outcome — record what the operator decided.
 *
 * Recording an outcome does not change the workflow status. A completed
 * appeal stays completed whatever the operator says.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const access = await requireCaseAccess(id, session, "read");
  if (!access.ok) return failFromAccess(access);
  return ok({ outcome: toOutcomeView(access.appealCase) });
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!hasDb()) return fail("DB_NOT_CONFIGURED", "Database is not configured.", 503);
  const session = await getSession();
  const { id } = await ctx.params;

  const body = await readJson<{
    outcomeStatus: CaseOutcomeStatus;
    detail?: string;
  }>(request);
  if (!body?.outcomeStatus) {
    return fail("BAD_REQUEST", "An outcomeStatus is required.", 400);
  }

  const result = await recordOutcomeForCase(id, session, {
    outcomeStatus: body.outcomeStatus,
    detail: body.detail ?? null,
    source: "CUSTOMER",
  });
  if (!result.ok) return failFromAccess(result);
  return ok({ outcome: result.outcome });
}
