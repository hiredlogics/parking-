import { requireAdmin } from "@/lib/auth/require-admin";
import { ok, fail, readJson } from "@/lib/api/envelope";
import {
  required,
  str,
  optStr,
  strArray,
  bool,
  int,
  enumOf,
  ValidationError,
} from "@/lib/api/validate";
import { ensureAdminConfigSeeded } from "@/lib/config/seedAdminConfig";
import {
  listServices,
  loadServiceGraph,
  upsertService,
  upsertIssue,
  upsertIssueFact,
  linkIssueKnowledge,
  upsertPrompt,
  upsertValidationRule,
  upsertEmailTemplate,
  getServiceByCode,
  invalidateServiceGraphCache,
} from "@/lib/config/adminRepo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_VALUES = ["ACTIVE", "REVIEW", "DISABLED"] as const;
const SEVERITY_VALUES = ["BLOCKING", "WARNING"] as const;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  await ensureAdminConfigSeeded();
  const services = await listServices(false);
  const graph = await loadServiceGraph("PRIVATE_PARKING_INITIAL_APPEAL");

  return ok({ services, issues: graph?.issues ?? [] });
}

/**
 * POST — mutate Admin configuration without a rebuild.
 *
 * Body: { action, ...fields }
 * Actions: UPSERT_SERVICE | UPSERT_ISSUE | UPSERT_FACT | LINK_KNOWLEDGE
 *          | UPSERT_PROMPT | UPSERT_VALIDATION | UPSERT_EMAIL_TEMPLATE
 *
 * Edits version prompts/templates; existing appeals keep snapshots.
 */
export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return fail(auth.code, auth.error, auth.status);

  await ensureAdminConfigSeeded();

  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return fail("BAD_REQUEST", "Invalid body.", 400);

  const action = String(body.action ?? "").toUpperCase();

  try {
    switch (action) {
      case "UPSERT_SERVICE": {
        const code = required(str(body, "code"));
        const name = required(str(body, "name"));
        const description = required(optStr(body, "description"));
        const paymentRequired = required(bool(body, "paymentRequired", true));
        const amountPence = required(int(body, "amountPence", 1199));
        const status = required(enumOf(body, "status", STATUS_VALUES, "ACTIVE"));
        const row = await upsertService({
          code,
          name,
          description,
          paymentRequired,
          amountPence,
          status,
        });
        return ok({ service: row });
      }
      case "UPSERT_ISSUE": {
        const serviceId = required(optStr(body, "serviceId"));
        const serviceCode = required(optStr(body, "serviceCode"));
        const service = serviceId
          ? { id: serviceId }
          : await getServiceByCode(serviceCode ?? "PRIVATE_PARKING_INITIAL_APPEAL");
        if (!service?.id) {
          return fail("NO_SERVICE", "Service not found.", 404);
        }
        const code = required(str(body, "code"));
        const label = required(str(body, "label"));
        const description = required(optStr(body, "description"));
        const sortOrder = required(int(body, "sortOrder", 100));
        const triggerTags = required(strArray(body, "triggerTags"));
        const status = required(enumOf(body, "status", STATUS_VALUES, "ACTIVE"));
        const row = await upsertIssue({
          serviceId: service.id,
          code,
          label,
          description,
          sortOrder,
          triggerTags,
          status,
        });
        await invalidateServiceGraphCache(
          "code" in service && typeof service.code === "string"
            ? service.code
            : (serviceCode ?? undefined),
        );
        return ok({ issue: row });
      }
      case "UPSERT_FACT": {
        const issueId = required(str(body, "issueId"));
        const factKey = required(str(body, "factKey"));
        const reasonCode = required(optStr(body, "reasonCode"));
        const priority = required(int(body, "priority", 100));
        const evidenceTypes = required(strArray(body, "evidenceTypes"));
        const status = required(enumOf(body, "status", STATUS_VALUES, "ACTIVE"));
        await upsertIssueFact({
          issueId,
          factKey,
          reasonCode,
          priority,
          evidenceTypes,
          status,
        });
        await invalidateServiceGraphCache();
        return ok({ ok: true });
      }
      case "LINK_KNOWLEDGE": {
        const issueId = required(str(body, "issueId"));
        const moduleId = required(str(body, "moduleId"));
        const status = required(enumOf(body, "status", STATUS_VALUES, "ACTIVE"));
        await linkIssueKnowledge(issueId, moduleId, status);
        await invalidateServiceGraphCache();
        return ok({ ok: true });
      }
      case "UPSERT_PROMPT": {
        const purpose = required(str(body, "purpose"));
        const name = required(optStr(body, "name")) ?? purpose;
        const promptBody = required(str(body, "body"));
        const changeNotes = required(optStr(body, "changeNotes"));
        await upsertPrompt({ purpose, name, body: promptBody, changeNotes });
        return ok({ ok: true });
      }
      case "UPSERT_VALIDATION": {
        const code = required(str(body, "code"));
        const label = required(str(body, "label"));
        const severity = required(enumOf(body, "severity", SEVERITY_VALUES, "BLOCKING"));
        const status = required(enumOf(body, "status", STATUS_VALUES, "ACTIVE"));
        await upsertValidationRule({ code, label, severity, status });
        const { invalidateValidatorConfigCache } = await import("@/lib/validation/ruleConfig");
        invalidateValidatorConfigCache();
        return ok({ ok: true });
      }
      case "UPSERT_EMAIL_TEMPLATE": {
        const code = required(str(body, "code"));
        const subject = required(str(body, "subject"));
        const bodyText = required(str(body, "bodyText"));
        const bodyHtml = required(optStr(body, "bodyHtml"));
        const status = required(enumOf(body, "status", STATUS_VALUES, "ACTIVE"));
        await upsertEmailTemplate({ code, subject, bodyText, bodyHtml, status });
        return ok({ ok: true });
      }
      default:
        return fail("BAD_ACTION", "Unknown action.", 400);
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      return fail("BAD_REQUEST", `${err.field}: ${err.message}`, 400);
    }
    console.error("[admin/config] mutation failed:", err);
    return fail(
      "MUTATION_FAILED",
      err instanceof Error ? err.message : "Update failed.",
      500,
    );
  }
}
