/**
 * Admin configuration repository — services, issues, facts, knowledge
 * links, prompts, validation rules, email templates.
 *
 * Live appeals read ACTIVE rows. Edits create versions / do not destroy
 * history for already-generated appeals (those keep snapshots).
 */
import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import { randomUUID } from "crypto";

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [];

export interface ServiceRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  paymentRequired: boolean;
  amountPence: number;
  currency: string;
  status: string;
  version: number;
}

export interface IssueRow {
  id: string;
  serviceId: string;
  code: string;
  label: string;
  description: string | null;
  status: string;
  sortOrder: number;
  triggerTags: string[];
  version: number;
  /**
   * Declarative applicability, evaluated by lib/rules/conditions.ts.
   * NULL means "not yet migrated" — the engine falls back to
   * trigger_tags matching so an unconfigured issue never goes dark.
   */
  applicabilityCondition: unknown;
  /** Matching this excludes the issue even if applicability matched. */
  exclusionCondition: unknown;
  /** Per-issue tunables (e.g. POFA day-count thresholds). */
  configJson: Record<string, unknown>;
}

export interface IssueFactRow {
  id: string;
  issueId: string;
  factKey: string;
  reasonCode: string | null;
  priority: number;
  evidenceTypes: string[];
  status: string;
  /** Fact is required only when this matches. NULL = always (once active). */
  requiredWhen: unknown;
  /** Fact is never asked when this matches, even if required_when holds. */
  skipWhen: unknown;
  /** True = strengthens the appeal but never blocks sufficiency/payment. */
  optional: boolean;
}

export interface IssueKnowledgeRow {
  issueId: string;
  moduleId: string;
  status: string;
}

export async function listServices(onlyActive = false): Promise<ServiceRow[]> {
  const where = onlyActive ? `WHERE status = 'ACTIVE'` : ``;
  const rows = await q(`SELECT * FROM services ${where} ORDER BY name`);
  return rows.map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paymentRequired: Boolean(r.payment_required),
    amountPence: Number(r.amount_pence ?? 1199),
    currency: (r.currency as string) ?? "GBP",
    status: r.status as string,
    version: Number(r.version ?? 1),
  }));
}

export async function getServiceByCode(code: string): Promise<ServiceRow | null> {
  const rows = await q(`SELECT * FROM services WHERE code = $1 LIMIT 1`, [code]);
  if (!rows[0]) return null;
  return rowToService(rows[0]);
}

/** Shared by the single-service read and the batched graph load. */
function rowToService(r: Row): ServiceRow {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paymentRequired: Boolean(r.payment_required),
    amountPence: Number(r.amount_pence ?? 1199),
    currency: (r.currency as string) ?? "GBP",
    status: r.status as string,
    version: Number(r.version ?? 1),
  };
}

export async function upsertService(input: {
  id?: string;
  code: string;
  name: string;
  description?: string | null;
  paymentRequired?: boolean;
  amountPence?: number;
  currency?: string;
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<ServiceRow> {
  const now = new Date().toISOString();
  const id = input.id ?? `svc_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const onConflict = input.seedOnly
    ? `ON CONFLICT (code) DO NOTHING`
    : `ON CONFLICT (code) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       payment_required = EXCLUDED.payment_required,
       amount_pence = EXCLUDED.amount_pence,
       currency = EXCLUDED.currency,
       status = EXCLUDED.status,
       version = services.version + 1,
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO services (
       id, code, name, description, payment_required, amount_pence,
       currency, status, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9)
     ${onConflict}`,
    [
      id,
      input.code,
      input.name,
      input.description ?? null,
      input.paymentRequired ?? true,
      input.amountPence ?? 1199,
      input.currency ?? "GBP",
      input.status ?? "ACTIVE",
      now,
    ],
  );
  const row = await getServiceByCode(input.code);
  if (!row) throw new Error("upsertService failed");
  return row;
}

function rowToIssue(r: Row): IssueRow {
  return {
    id: r.id as string,
    serviceId: r.service_id as string,
    code: r.code as string,
    label: r.label as string,
    description: (r.description as string | null) ?? null,
    status: r.status as string,
    sortOrder: Number(r.sort_order ?? 100),
    triggerTags: asArray(r.trigger_tags),
    version: Number(r.version ?? 1),
    applicabilityCondition: r.applicability_json ?? null,
    exclusionCondition: r.exclusion_json ?? null,
    configJson: (r.config_json as Record<string, unknown>) ?? {},
  };
}

export async function listIssues(
  serviceId: string,
  onlyActive = true,
): Promise<IssueRow[]> {
  const where = onlyActive
    ? `WHERE service_id = $1 AND status = 'ACTIVE'`
    : `WHERE service_id = $1`;
  const rows = await q(
    `SELECT * FROM issues ${where} ORDER BY sort_order, code`,
    [serviceId],
  );
  return rows.map(rowToIssue);
}

export async function upsertIssue(input: {
  id?: string;
  serviceId: string;
  code: string;
  label: string;
  description?: string | null;
  sortOrder?: number;
  triggerTags?: string[];
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<IssueRow> {
  const now = new Date().toISOString();
  const id = input.id ?? `iss_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const onConflict = input.seedOnly
    ? `ON CONFLICT (service_id, code) DO NOTHING`
    : `ON CONFLICT (service_id, code) DO UPDATE SET
       label = EXCLUDED.label,
       description = EXCLUDED.description,
       status = EXCLUDED.status,
       sort_order = EXCLUDED.sort_order,
       trigger_tags = EXCLUDED.trigger_tags,
       version = issues.version + 1,
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO issues (
       id, service_id, code, label, description, status, sort_order,
       trigger_tags, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9)
     ${onConflict}`,
    [
      id,
      input.serviceId,
      input.code,
      input.label,
      input.description ?? null,
      input.status ?? "ACTIVE",
      input.sortOrder ?? 100,
      JSON.stringify(input.triggerTags ?? []),
      now,
    ],
  );
  const rows = await q(
    `SELECT * FROM issues WHERE service_id = $1 AND code = $2`,
    [input.serviceId, input.code],
  );
  return rowToIssue(rows[0]!);
}

/**
 * Set an issue's declarative applicability/exclusion/config — the
 * columns that make it Admin-driven rather than TypeScript-driven.
 *
 * Archives the previous state into `issue_revisions` first, so a
 * "change a rule" test can restore the exact prior condition, and so a
 * completed appeal's snapshot never has to guess what the rule looked
 * like when it ran.
 */
export async function setIssueApplicability(input: {
  issueId: string;
  applicabilityCondition?: unknown;
  exclusionCondition?: unknown;
  configJson?: Record<string, unknown>;
  changeNote?: string | null;
  changedBy?: string | null;
}): Promise<IssueRow> {
  const now = new Date().toISOString();
  const current = await q(`SELECT * FROM issues WHERE id = $1`, [
    input.issueId,
  ]);
  if (!current[0]) throw new Error(`issue not found: ${input.issueId}`);
  const before = current[0];

  await q(
    `INSERT INTO issue_revisions (issue_id, version, snapshot_json, archived_at, archived_by, change_note)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (issue_id, version) DO NOTHING`,
    [
      input.issueId,
      Number(before.version ?? 1),
      JSON.stringify(before),
      now,
      input.changedBy ?? null,
      input.changeNote ?? null,
    ],
  );

  const sets: string[] = [];
  const params: unknown[] = [input.issueId];
  if (input.applicabilityCondition !== undefined) {
    params.push(JSON.stringify(input.applicabilityCondition));
    sets.push(`applicability_json = $${params.length}`);
  }
  if (input.exclusionCondition !== undefined) {
    params.push(JSON.stringify(input.exclusionCondition));
    sets.push(`exclusion_json = $${params.length}`);
  }
  if (input.configJson !== undefined) {
    params.push(JSON.stringify(input.configJson));
    sets.push(`config_json = $${params.length}`);
  }
  params.push(input.changeNote ?? null);
  sets.push(`change_note = $${params.length}`);
  params.push(input.changedBy ?? null);
  sets.push(`created_by = $${params.length}`);
  params.push(now);
  sets.push(`updated_at = $${params.length}`, `version = version + 1`);

  await q(`UPDATE issues SET ${sets.join(", ")} WHERE id = $1`, params);
  await invalidateServiceGraphCache();

  const rows = await q(`SELECT * FROM issues WHERE id = $1`, [input.issueId]);
  return rowToIssue(rows[0]!);
}

/** Restore an issue to a prior archived version (undo a rule change). */
export async function restoreIssueRevision(
  issueId: string,
  version: number,
): Promise<IssueRow> {
  const rows = await q(
    `SELECT snapshot_json FROM issue_revisions WHERE issue_id = $1 AND version = $2`,
    [issueId, version],
  );
  if (!rows[0]) {
    throw new Error(`no archived version ${version} for issue ${issueId}`);
  }
  const snap = rows[0].snapshot_json as Record<string, unknown>;
  const now = new Date().toISOString();
  await q(
    `UPDATE issues SET
       label = $2, description = $3, status = $4, sort_order = $5,
       trigger_tags = $6, applicability_json = $7, exclusion_json = $8,
       config_json = $9, updated_at = $10, version = version + 1
     WHERE id = $1`,
    [
      issueId,
      snap.label,
      snap.description ?? null,
      snap.status,
      snap.sort_order ?? 100,
      JSON.stringify(asArray(snap.trigger_tags)),
      JSON.stringify(snap.applicability_json ?? null),
      JSON.stringify(snap.exclusion_json ?? null),
      JSON.stringify(snap.config_json ?? {}),
      now,
    ],
  );
  await invalidateServiceGraphCache();
  const rows2 = await q(`SELECT * FROM issues WHERE id = $1`, [issueId]);
  return rowToIssue(rows2[0]!);
}

export async function listIssueFacts(
  issueId: string,
  onlyActive = true,
): Promise<IssueFactRow[]> {
  const where = onlyActive
    ? `WHERE issue_id = $1 AND status = 'ACTIVE'`
    : `WHERE issue_id = $1`;
  const rows = await q(
    `SELECT * FROM issue_required_facts ${where} ORDER BY priority, fact_key`,
    [issueId],
  );
  return rows.map(rowToIssueFact);
}

/** Shared by the per-issue read and the batched graph load. */
function rowToIssueFact(r: Row): IssueFactRow {
  return {
    id: r.id as string,
    issueId: r.issue_id as string,
    factKey: r.fact_key as string,
    reasonCode: (r.reason_code as string | null) ?? null,
    priority: Number(r.priority ?? 100),
    evidenceTypes: asArray(r.evidence_types),
    status: r.status as string,
    requiredWhen: r.required_when ?? null,
    skipWhen: r.skip_when ?? null,
    optional: Boolean(r.optional),
  };
}

export async function upsertIssueFact(input: {
  issueId: string;
  factKey: string;
  reasonCode?: string | null;
  priority?: number;
  evidenceTypes?: string[];
  status?: string;
  requiredWhen?: unknown;
  skipWhen?: unknown;
  optional?: boolean;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const id = `irf_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const onConflict = input.seedOnly
    ? `ON CONFLICT (issue_id, fact_key) DO NOTHING`
    : `ON CONFLICT (issue_id, fact_key) DO UPDATE SET
       reason_code = EXCLUDED.reason_code,
       priority = EXCLUDED.priority,
       evidence_types = EXCLUDED.evidence_types,
       status = EXCLUDED.status,
       required_when = EXCLUDED.required_when,
       skip_when = EXCLUDED.skip_when,
       optional = EXCLUDED.optional,
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO issue_required_facts (
       id, issue_id, fact_key, reason_code, priority, evidence_types,
       status, required_when, skip_when, optional, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     ${onConflict}`,
    [
      id,
      input.issueId,
      input.factKey,
      input.reasonCode ?? null,
      input.priority ?? 100,
      JSON.stringify(input.evidenceTypes ?? []),
      input.status ?? "ACTIVE",
      JSON.stringify(input.requiredWhen ?? {}),
      input.skipWhen != null ? JSON.stringify(input.skipWhen) : null,
      input.optional ?? false,
      now,
    ],
  );
}

export async function listIssueKnowledge(
  issueId: string,
  onlyActive = true,
): Promise<IssueKnowledgeRow[]> {
  const where = onlyActive
    ? `WHERE issue_id = $1 AND status = 'ACTIVE'`
    : `WHERE issue_id = $1`;
  const rows = await q(`SELECT * FROM issue_knowledge ${where}`, [issueId]);
  return rows.map((r) => ({
    issueId: r.issue_id as string,
    moduleId: r.module_id as string,
    status: r.status as string,
  }));
}

export async function linkIssueKnowledge(
  issueId: string,
  moduleId: string,
  status = "ACTIVE",
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly = false,
): Promise<void> {
  const now = new Date().toISOString();
  const onConflict = seedOnly
    ? `ON CONFLICT (issue_id, module_id) DO NOTHING`
    : `ON CONFLICT (issue_id, module_id) DO UPDATE SET status = EXCLUDED.status`;
  await q(
    `INSERT INTO issue_knowledge (issue_id, module_id, status, created_at)
     VALUES ($1,$2,$3,$4)
     ${onConflict}`,
    [issueId, moduleId, status, now],
  );
}

/* ------------------------------------------------------------------ */
/* Fact defaults — Admin-managed controlled assumptions                */
/* ------------------------------------------------------------------ */

export interface FactDefaultRow {
  id: string;
  serviceId: string | null;
  factKey: string;
  condition: unknown;
  defaultValue: unknown;
  reasonCode: string;
  priority: number;
  status: string;
  version: number;
}

function rowToFactDefault(r: Row): FactDefaultRow {
  return {
    id: r.id as string,
    serviceId: (r.service_id as string | null) ?? null,
    factKey: r.fact_key as string,
    condition: r.condition_json ?? null,
    defaultValue: r.default_value,
    reasonCode: (r.reason_code as string) ?? "SYSTEM_SAFE_DEFAULT",
    priority: Number(r.priority ?? 100),
    status: r.status as string,
    version: Number(r.version ?? 1),
  };
}

export async function listFactDefaults(
  serviceId?: string | null,
  onlyActive = true,
): Promise<FactDefaultRow[]> {
  const where = onlyActive ? `WHERE status = 'ACTIVE'` : `WHERE TRUE`;
  const serviceFilter = serviceId
    ? ` AND (service_id = $1 OR service_id IS NULL)`
    : ``;
  const rows = await q(
    `SELECT * FROM fact_defaults ${where}${serviceFilter} ORDER BY priority, fact_key`,
    serviceId ? [serviceId] : [],
  );
  return rows.map(rowToFactDefault);
}

export async function upsertFactDefault(input: {
  id?: string;
  serviceId?: string | null;
  factKey: string;
  condition?: unknown;
  defaultValue: unknown;
  reasonCode?: string;
  priority?: number;
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<FactDefaultRow> {
  const now = new Date().toISOString();
  const id = input.id ?? `fd_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const onConflict = input.seedOnly
    ? `ON CONFLICT (id) DO NOTHING`
    : `ON CONFLICT (id) DO UPDATE SET
       condition_json = EXCLUDED.condition_json,
       default_value = EXCLUDED.default_value,
       reason_code = EXCLUDED.reason_code,
       priority = EXCLUDED.priority,
       status = EXCLUDED.status,
       version = fact_defaults.version + 1,
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO fact_defaults (
       id, service_id, fact_key, condition_json, default_value,
       reason_code, priority, status, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$9)
     ${onConflict}`,
    [
      id,
      input.serviceId ?? null,
      input.factKey,
      input.condition != null ? JSON.stringify(input.condition) : null,
      JSON.stringify(input.defaultValue),
      input.reasonCode ?? "SYSTEM_SAFE_DEFAULT",
      input.priority ?? 100,
      input.status ?? "ACTIVE",
      now,
    ],
  );
  const rows = await q(`SELECT * FROM fact_defaults WHERE id = $1`, [id]);
  return rowToFactDefault(rows[0]!);
}

export async function setFactDefaultStatus(
  id: string,
  status: string,
): Promise<void> {
  await q(
    `UPDATE fact_defaults SET status = $2, updated_at = $3 WHERE id = $1`,
    [id, status, new Date().toISOString()],
  );
}

export async function upsertPrompt(input: {
  purpose: string;
  name: string;
  body: string;
  status?: string;
  changeNotes?: string | null;
}): Promise<void> {
  const now = new Date().toISOString();
  const latest = await q(
    `SELECT COALESCE(MAX(version), 0) AS v FROM prompts WHERE purpose = $1`,
    [input.purpose],
  );
  const version = Number(latest[0]?.v ?? 0) + 1;
  // Soft-disable previous ACTIVE for this purpose
  await q(
    `UPDATE prompts SET status = 'SUPERSEDED', updated_at = $2
     WHERE purpose = $1 AND status = 'ACTIVE'`,
    [input.purpose, now],
  );
  await q(
    `INSERT INTO prompts (
       id, purpose, name, body, version, status, change_notes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
    [
      `prm_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      input.purpose,
      input.name,
      input.body,
      version,
      input.status ?? "ACTIVE",
      input.changeNotes ?? null,
      now,
    ],
  );
}

/**
 * Bootstrap seeding only — inserts version 1 as ACTIVE if this purpose has
 * no prompt row yet, otherwise does nothing. Unlike upsertPrompt, never
 * mints a new version, so a cold process restart can't supersede an
 * admin-edited prompt with the seed body.
 */
export async function insertPromptIfAbsent(input: {
  purpose: string;
  name: string;
  body: string;
  changeNotes?: string | null;
}): Promise<void> {
  const existing = await q(`SELECT 1 FROM prompts WHERE purpose = $1 LIMIT 1`, [
    input.purpose,
  ]);
  if (existing.length > 0) return;
  const now = new Date().toISOString();
  await q(
    `INSERT INTO prompts (
       id, purpose, name, body, version, status, change_notes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,1,'ACTIVE',$5,$6,$6)`,
    [
      `prm_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      input.purpose,
      input.name,
      input.body,
      input.changeNotes ?? null,
      now,
    ],
  );
}

export async function getActivePrompt(
  purpose: string,
): Promise<{ body: string; version: number; name: string } | null> {
  const rows = await q(
    `SELECT * FROM prompts
     WHERE purpose = $1 AND status = 'ACTIVE'
     ORDER BY version DESC LIMIT 1`,
    [purpose],
  );
  if (!rows[0]) return null;
  return {
    body: rows[0].body as string,
    version: Number(rows[0].version),
    name: rows[0].name as string,
  };
}

/**
 * Validator codes that can never be disabled or downgraded, however the
 * request is shaped. VAL-DRIVER is the keeper-safety check — the one
 * validator this product cannot ship without.
 */
const IMMUTABLE_VALIDATOR_CODES = new Set(["VAL-DRIVER"]);

export async function upsertValidationRule(input: {
  code: string;
  label: string;
  severity?: string;
  configJson?: Record<string, unknown>;
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<void> {
  if (
    IMMUTABLE_VALIDATOR_CODES.has(input.code) &&
    !input.seedOnly &&
    ((input.status ?? "ACTIVE") !== "ACTIVE" || (input.severity ?? "BLOCKING") !== "BLOCKING")
  ) {
    throw new Error(
      `${input.code} is a non-negotiable safety validator and cannot be disabled or downgraded.`,
    );
  }
  const now = new Date().toISOString();
  const onConflict = input.seedOnly
    ? `ON CONFLICT (code) DO NOTHING`
    : `ON CONFLICT (code) DO UPDATE SET
       label = EXCLUDED.label,
       severity = EXCLUDED.severity,
       config_json = EXCLUDED.config_json,
       status = EXCLUDED.status,
       version = validation_rules.version + 1,
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO validation_rules (
       id, code, label, severity, config_json, status, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7)
     ${onConflict}`,
    [
      `val_${input.code.toLowerCase()}`,
      input.code,
      input.label,
      input.severity ?? "BLOCKING",
      JSON.stringify(input.configJson ?? {}),
      input.status ?? "ACTIVE",
      now,
    ],
  );
}

export interface ValidationRuleRow {
  code: string;
  label: string;
  severity: string;
  status: string;
  configJson: Record<string, unknown>;
  version: number;
}

export async function listValidationRules(): Promise<ValidationRuleRow[]> {
  const rows = await q(`SELECT * FROM validation_rules ORDER BY code`);
  return rows.map((r) => ({
    code: r.code as string,
    label: r.label as string,
    severity: (r.severity as string) ?? "BLOCKING",
    status: (r.status as string) ?? "ACTIVE",
    configJson: (r.config_json as Record<string, unknown>) ?? {},
    version: Number(r.version ?? 1),
  }));
}

export async function upsertEmailTemplate(input: {
  code: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const onConflict = input.seedOnly
    ? `ON CONFLICT (code) DO NOTHING`
    : `ON CONFLICT (code) DO UPDATE SET
       subject = EXCLUDED.subject,
       body_text = EXCLUDED.body_text,
       body_html = EXCLUDED.body_html,
       status = EXCLUDED.status,
       version = email_templates.version + 1,
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO email_templates (
       id, code, subject, body_text, body_html, status, version, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,1,$7,$7)
     ${onConflict}`,
    [
      `etpl_${input.code.toLowerCase()}`,
      input.code,
      input.subject,
      input.bodyText,
      input.bodyHtml ?? null,
      input.status ?? "ACTIVE",
      now,
    ],
  );
}

export async function getEmailTemplate(code: string): Promise<{
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  version: number;
} | null> {
  const rows = await q(
    `SELECT * FROM email_templates WHERE code = $1 AND status = 'ACTIVE' LIMIT 1`,
    [code],
  );
  if (!rows[0]) return null;
  return {
    subject: rows[0].subject as string,
    bodyText: rows[0].body_text as string,
    bodyHtml: (rows[0].body_html as string | null) ?? null,
    version: Number(rows[0].version ?? 1),
  };
}

/** Full active graph for one service — used by the generic issue engine. */
export interface ServiceGraph {
  service: ServiceRow;
  issues: Array<
    IssueRow & {
      facts: IssueFactRow[];
      knowledge: IssueKnowledgeRow[];
    }
  >;
  factDefaults: FactDefaultRow[];
}

/**
 * Full active graph for one service — used by the generic issue
 * engine. This, plus lib/rules/conditions.ts, is the single business
 * authority: an issue's applicability, a fact's requirement, and a
 * case's controlled defaults are all rows here, not TypeScript.
 */
export async function loadServiceGraph(
  serviceCode: string,
): Promise<ServiceGraph | null> {
  const cacheKey = `svcgraph:v2:${serviceCode}`;
  try {
    const { cacheGetJson } = await import("@/lib/cache/store");
    const cached = await cacheGetJson<ServiceGraph>(cacheKey);
    if (cached?.service) return cached;
  } catch {
    // Cache is optional.
  }

  /*
   * The whole graph in ONE round trip, on ONE connection.
   *
   * This used to read the service, then its issues, then call
   * listIssueFacts + listIssueKnowledge once per issue. With eleven
   * issues that is twenty-four queries, and it measured 2,434ms against
   * Neon — the single largest item in a cold start, larger than the TLS
   * handshake, and paid again whenever the 300s cache lapses.
   *
   * Batching the per-issue reads was not enough, and issuing the
   * remainder through `Promise.all` actively hurt: the pool opens up to
   * ten connections, so concurrent queries on a cold process pay a
   * fresh ~1.7s TLS handshake each instead of sharing one. Latency here
   * is dominated by round trips and handshakes, not by rows, so the
   * only fix that helps is to stop making round trips.
   *
   * The row shapes are unchanged — Postgres returns each table's rows
   * as JSON and the same `rowTo*` mappers decode them — so this is a
   * transport change, not a behaviour change.
   */
  const graphRows = await q(
    `WITH svc AS (
       SELECT * FROM services WHERE code = $1 AND status = 'ACTIVE' LIMIT 1
     ), iss AS (
       SELECT i.* FROM issues i
         JOIN svc ON i.service_id = svc.id
        WHERE i.status = 'ACTIVE'
        ORDER BY i.sort_order, i.code
     )
     SELECT
       (SELECT row_to_json(svc) FROM svc) AS service,
       (SELECT COALESCE(json_agg(row_to_json(iss)), '[]'::json) FROM iss) AS issues,
       (SELECT COALESCE(json_agg(row_to_json(f) ORDER BY f.priority, f.fact_key), '[]'::json)
          FROM issue_required_facts f
         WHERE f.status = 'ACTIVE'
           AND f.issue_id IN (SELECT id FROM iss)) AS facts,
       (SELECT COALESCE(json_agg(row_to_json(k)), '[]'::json)
          FROM issue_knowledge k
         WHERE k.status = 'ACTIVE'
           AND k.issue_id IN (SELECT id FROM iss)) AS knowledge,
       (SELECT COALESCE(json_agg(row_to_json(d) ORDER BY d.priority, d.fact_key), '[]'::json)
          FROM fact_defaults d
         WHERE d.status = 'ACTIVE'
           AND (d.service_id IS NULL
                OR d.service_id = (SELECT id FROM svc))) AS defaults`,
    [serviceCode],
  );

  const bundle = graphRows[0];
  if (!bundle?.service) return null;

  const service = rowToService(bundle.service as Row);
  const issues = (bundle.issues as Row[]).map(rowToIssue);
  const factDefaults = (bundle.defaults as Row[]).map(rowToFactDefault);

  const factsByIssue = new Map<string, IssueFactRow[]>();
  for (const r of bundle.facts as Row[]) {
    const issueId = r.issue_id as string;
    const list = factsByIssue.get(issueId) ?? [];
    list.push(rowToIssueFact(r));
    factsByIssue.set(issueId, list);
  }
  const knowledgeByIssue = new Map<string, IssueKnowledgeRow[]>();
  for (const r of bundle.knowledge as Row[]) {
    const issueId = r.issue_id as string;
    const list = knowledgeByIssue.get(issueId) ?? [];
    list.push({
      issueId,
      moduleId: r.module_id as string,
      status: r.status as string,
    });
    knowledgeByIssue.set(issueId, list);
  }

  const enriched = issues.map((issue) => ({
    ...issue,
    facts: factsByIssue.get(issue.id) ?? [],
    knowledge: knowledgeByIssue.get(issue.id) ?? [],
  }));
  const graph: ServiceGraph = { service, issues: enriched, factDefaults };

  try {
    const { cacheSetJson } = await import("@/lib/cache/store");
    await cacheSetJson(cacheKey, graph, 300);
  } catch {
    // ignore
  }
  return graph;
}

/** Drop cached service graphs after admin config edits. */
export async function invalidateServiceGraphCache(
  serviceCode?: string,
): Promise<void> {
  try {
    const { cacheDel, cacheDelPrefix } = await import("@/lib/cache/store");
    if (serviceCode) await cacheDel(`svcgraph:v2:${serviceCode}`);
    else await cacheDelPrefix("svcgraph:v2:");
  } catch {
    // ignore
  }
}
