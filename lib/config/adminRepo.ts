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
}

export interface IssueFactRow {
  id: string;
  issueId: string;
  factKey: string;
  reasonCode: string | null;
  priority: number;
  evidenceTypes: string[];
  status: string;
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
    amountPence: Number(r.amount_pence ?? 2900),
    currency: (r.currency as string) ?? "GBP",
    status: r.status as string,
    version: Number(r.version ?? 1),
  }));
}

export async function getServiceByCode(code: string): Promise<ServiceRow | null> {
  const rows = await q(`SELECT * FROM services WHERE code = $1 LIMIT 1`, [code]);
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    paymentRequired: Boolean(r.payment_required),
    amountPence: Number(r.amount_pence ?? 2900),
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
      input.amountPence ?? 2900,
      input.currency ?? "GBP",
      input.status ?? "ACTIVE",
      now,
    ],
  );
  const row = await getServiceByCode(input.code);
  if (!row) throw new Error("upsertService failed");
  return row;
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
  return rows.map((r) => ({
    id: r.id as string,
    serviceId: r.service_id as string,
    code: r.code as string,
    label: r.label as string,
    description: (r.description as string | null) ?? null,
    status: r.status as string,
    sortOrder: Number(r.sort_order ?? 100),
    triggerTags: asArray(r.trigger_tags),
    version: Number(r.version ?? 1),
  }));
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
  const r = rows[0]!;
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
  };
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
  return rows.map((r) => ({
    id: r.id as string,
    issueId: r.issue_id as string,
    factKey: r.fact_key as string,
    reasonCode: (r.reason_code as string | null) ?? null,
    priority: Number(r.priority ?? 100),
    evidenceTypes: asArray(r.evidence_types),
    status: r.status as string,
  }));
}

export async function upsertIssueFact(input: {
  issueId: string;
  factKey: string;
  reasonCode?: string | null;
  priority?: number;
  evidenceTypes?: string[];
  status?: string;
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
       updated_at = EXCLUDED.updated_at`;
  await q(
    `INSERT INTO issue_required_facts (
       id, issue_id, fact_key, reason_code, priority, evidence_types,
       status, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     ${onConflict}`,
    [
      id,
      input.issueId,
      input.factKey,
      input.reasonCode ?? null,
      input.priority ?? 100,
      JSON.stringify(input.evidenceTypes ?? []),
      input.status ?? "ACTIVE",
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

export async function upsertValidationRule(input: {
  code: string;
  label: string;
  severity?: string;
  configJson?: Record<string, unknown>;
  status?: string;
  /** Bootstrap seeding only — insert if absent, never overwrite an admin edit. */
  seedOnly?: boolean;
}): Promise<void> {
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
export async function loadServiceGraph(serviceCode: string): Promise<{
  service: ServiceRow;
  issues: Array<
    IssueRow & {
      facts: IssueFactRow[];
      knowledge: IssueKnowledgeRow[];
    }
  >;
} | null> {
  const cacheKey = `svcgraph:v1:${serviceCode}`;
  try {
    const { cacheGetJson } = await import("@/lib/cache/store");
    const cached = await cacheGetJson<{
      service: ServiceRow;
      issues: Array<
        IssueRow & {
          facts: IssueFactRow[];
          knowledge: IssueKnowledgeRow[];
        }
      >;
    }>(cacheKey);
    if (cached?.service) return cached;
  } catch {
    // Cache is optional.
  }

  const service = await getServiceByCode(serviceCode);
  if (!service || service.status !== "ACTIVE") return null;
  const issues = await listIssues(service.id, true);
  const enriched = await Promise.all(
    issues.map(async (issue) => ({
      ...issue,
      facts: await listIssueFacts(issue.id, true),
      knowledge: await listIssueKnowledge(issue.id, true),
    })),
  );
  const graph = { service, issues: enriched };

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
    if (serviceCode) await cacheDel(`svcgraph:v1:${serviceCode}`);
    else await cacheDelPrefix("svcgraph:v1:");
  } catch {
    // ignore
  }
}
