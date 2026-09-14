/**
 * First-class APPEAL entity — separate from CASE.
 *
 * Status lifecycle:
 *   DRAFT → AWAITING_ADMIN_APPROVAL → APPROVED | REJECTED | HELD
 *   HELD/REJECTED can return to AWAITING after regenerate.
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

export type CaseAppealStatus =
  | "DRAFT"
  | "AWAITING_ADMIN_APPROVAL"
  | "APPROVED"
  | "REJECTED"
  | "HELD";

export interface CaseAppeal {
  id: string;
  caseId: string;
  serviceId: string | null;
  status: CaseAppealStatus;
  version: number;
  body: string | null;
  paragraphs: Array<{ id: string; text: string }>;
  issuesJson: unknown[];
  factsSnapshot: Record<string, unknown>;
  knowledgeSnapshot: unknown[];
  moduleIds: string[];
  validationJson: unknown | null;
  checklistJson: unknown | null;
  warnings: string[];
  promptVersion: string | null;
  generationVersion: string | null;
  providerId: string | null;
  model: string | null;
  sourceDraftId: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvedBody: string | null;
  approvedParagraphs: Array<{ id: string; text: string }> | null;
  approvedVersion: number | null;
  holdReason: string | null;
  rejectReason: string | null;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToAppeal(r: Row): CaseAppeal {
  return {
    id: r.id as string,
    caseId: r.case_id as string,
    serviceId: (r.service_id as string | null) ?? null,
    status: r.status as CaseAppealStatus,
    version: Number(r.version ?? 1),
    body: (r.body as string | null) ?? null,
    paragraphs: Array.isArray(r.paragraphs)
      ? (r.paragraphs as Array<{ id: string; text: string }>)
      : [],
    issuesJson: Array.isArray(r.issues_json) ? (r.issues_json as unknown[]) : [],
    factsSnapshot:
      r.facts_snapshot && typeof r.facts_snapshot === "object"
        ? (r.facts_snapshot as Record<string, unknown>)
        : {},
    knowledgeSnapshot: Array.isArray(r.knowledge_snapshot)
      ? (r.knowledge_snapshot as unknown[])
      : [],
    moduleIds: Array.isArray(r.module_ids) ? (r.module_ids as string[]) : [],
    validationJson: r.validation_json ?? null,
    checklistJson: r.checklist_json ?? null,
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
    promptVersion: (r.prompt_version as string | null) ?? null,
    generationVersion: (r.generation_version as string | null) ?? null,
    providerId: (r.provider_id as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    sourceDraftId: (r.source_draft_id as string | null) ?? null,
    approvedBy: (r.approved_by as string | null) ?? null,
    approvedAt: (r.approved_at as string | null) ?? null,
    approvedBody: (r.approved_body as string | null) ?? null,
    approvedParagraphs: Array.isArray(r.approved_paragraphs)
      ? (r.approved_paragraphs as Array<{ id: string; text: string }>)
      : null,
    approvedVersion:
      r.approved_version != null ? Number(r.approved_version) : null,
    holdReason: (r.hold_reason as string | null) ?? null,
    rejectReason: (r.reject_reason as string | null) ?? null,
    adminNotes: (r.admin_notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function findCurrentAppeal(
  caseId: string,
): Promise<CaseAppeal | null> {
  const rows = await q(
    `SELECT * FROM case_appeals
     WHERE case_id = $1 AND superseded_at IS NULL
     ORDER BY version DESC LIMIT 1`,
    [caseId],
  );
  return rows[0] ? rowToAppeal(rows[0]) : null;
}

export async function findAppealById(id: string): Promise<CaseAppeal | null> {
  const rows = await q(`SELECT * FROM case_appeals WHERE id = $1`, [id]);
  return rows[0] ? rowToAppeal(rows[0]) : null;
}

export async function listAppealsForReview(): Promise<CaseAppeal[]> {
  const rows = await q(
    `SELECT * FROM case_appeals
     WHERE status IN ('AWAITING_ADMIN_APPROVAL', 'HELD')
       AND superseded_at IS NULL
     ORDER BY created_at ASC`,
  );
  return rows.map(rowToAppeal);
}

export async function listApprovedAppeals(caseId: string): Promise<CaseAppeal[]> {
  const rows = await q(
    `SELECT * FROM case_appeals
     WHERE case_id = $1 AND status = 'APPROVED'
     ORDER BY approved_at DESC`,
    [caseId],
  );
  return rows.map(rowToAppeal);
}

export async function saveAwaitingApprovalAppeal(input: {
  caseId: string;
  serviceId?: string | null;
  body: string | null;
  paragraphs: Array<{ id: string; text: string }>;
  issuesJson?: unknown[];
  factsSnapshot?: Record<string, unknown>;
  knowledgeSnapshot?: unknown[];
  moduleIds?: string[];
  validationJson?: unknown;
  checklistJson?: unknown;
  warnings?: string[];
  promptVersion?: string | null;
  generationVersion?: string | null;
  providerId?: string | null;
  model?: string | null;
  sourceDraftId?: string | null;
}): Promise<CaseAppeal> {
  const now = new Date().toISOString();
  const existing = await findCurrentAppeal(input.caseId);
  if (existing) {
    await q(
      `UPDATE case_appeals SET superseded_at = $2, updated_at = $2 WHERE id = $1`,
      [existing.id, now],
    );
  }
  const version = (existing?.version ?? 0) + 1;
  const id = `cap_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  await q(
    `INSERT INTO case_appeals (
       id, case_id, service_id, status, version, body, paragraphs,
       issues_json, facts_snapshot, knowledge_snapshot, module_ids,
       validation_json, checklist_json, warnings, prompt_version,
       generation_version, provider_id, model, source_draft_id,
       created_at, updated_at
     ) VALUES (
       $1,$2,$3,'AWAITING_ADMIN_APPROVAL',$4,$5,$6,$7,$8,$9,$10,
       $11,$12,$13,$14,$15,$16,$17,$18,$19,$19
     )`,
    [
      id,
      input.caseId,
      input.serviceId ?? null,
      version,
      input.body,
      JSON.stringify(input.paragraphs),
      JSON.stringify(input.issuesJson ?? []),
      JSON.stringify(input.factsSnapshot ?? {}),
      JSON.stringify(input.knowledgeSnapshot ?? []),
      JSON.stringify(input.moduleIds ?? []),
      input.validationJson ? JSON.stringify(input.validationJson) : null,
      input.checklistJson ? JSON.stringify(input.checklistJson) : null,
      JSON.stringify(input.warnings ?? []),
      input.promptVersion ?? null,
      input.generationVersion ?? null,
      input.providerId ?? null,
      input.model ?? null,
      input.sourceDraftId ?? null,
      now,
    ],
  );
  const row = await findAppealById(id);
  if (!row) throw new Error("saveAwaitingApprovalAppeal failed");
  return row;
}

export async function markAppealApproved(input: {
  appealId: string;
  approvedBy: string;
  /** Optional admin override — becomes the frozen PDF text. */
  body?: string | null;
  paragraphs?: Array<{ id: string; text: string }> | null;
}): Promise<CaseAppeal> {
  const now = new Date().toISOString();
  const current = await findAppealById(input.appealId);
  if (!current) throw new Error("Appeal not found");
  if (current.status !== "AWAITING_ADMIN_APPROVAL" && current.status !== "HELD") {
    throw new Error(`Cannot approve appeal in status ${current.status}`);
  }

  const body = input.body?.trim() ? input.body.trim() : current.body;
  const paragraphs =
    input.paragraphs && input.paragraphs.length > 0
      ? input.paragraphs
      : current.paragraphs;

  await q(
    `UPDATE case_appeals SET
       status = 'APPROVED',
       approved_by = $2,
       approved_at = $3,
       body = COALESCE($4, body),
       paragraphs = COALESCE($5::jsonb, paragraphs),
       approved_body = COALESCE($4, body),
       approved_paragraphs = COALESCE($5::jsonb, paragraphs),
       approved_version = version,
       updated_at = $3
     WHERE id = $1`,
    [
      input.appealId,
      input.approvedBy,
      now,
      body,
      paragraphs.length > 0 ? JSON.stringify(paragraphs) : null,
    ],
  );
  const row = await findAppealById(input.appealId);
  if (!row) throw new Error("markAppealApproved failed");
  return row;
}

export async function markAppealHeld(
  appealId: string,
  reason: string,
  notes?: string | null,
): Promise<CaseAppeal> {
  const now = new Date().toISOString();
  await q(
    `UPDATE case_appeals SET
       status = 'HELD', hold_reason = $2, admin_notes = COALESCE($3, admin_notes),
       updated_at = $4
     WHERE id = $1`,
    [appealId, reason, notes ?? null, now],
  );
  const row = await findAppealById(appealId);
  if (!row) throw new Error("markAppealHeld failed");
  return row;
}

export async function markAppealRejected(
  appealId: string,
  reason: string,
  notes?: string | null,
): Promise<CaseAppeal> {
  const now = new Date().toISOString();
  await q(
    `UPDATE case_appeals SET
       status = 'REJECTED', reject_reason = $2, admin_notes = COALESCE($3, admin_notes),
       updated_at = $4
     WHERE id = $1`,
    [appealId, reason, notes ?? null, now],
  );
  const row = await findAppealById(appealId);
  if (!row) throw new Error("markAppealRejected failed");
  return row;
}
