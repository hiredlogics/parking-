import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type { GenerationResult, GenerationStatus } from "@/lib/generation/engine";

/**
 * Persisted appeal drafts.
 *
 * Append-only: superseding marks the old row rather than deleting it,
 * so an audit can always reconstruct what was released and why.
 */

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export interface DraftParagraph {
  id: string;
  text: string;
}

export interface AppealDraftRow {
  id: string;
  caseId: string;
  version: number;
  status: GenerationStatus;
  body: string | null;
  paragraphs: DraftParagraph[];
  moduleIds: string[];
  primaryRoute: string | null;
  secondaryRoutes: string[];
  codeVersionId: string | null;
  pofaRoute: string | null;
  providerId: string | null;
  promptVersion: string | null;
  model: string | null;
  bespoke: boolean;
  validation: unknown;
  checklist: unknown;
  warnings: string[];
  attempts: number;
  blockReason: string | null;
  blockDetail: string | null;
  generationVersion: string | null;
  createdAt: string;
  supersededAt: string | null;
}

function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function rowToDraft(r: Row): AppealDraftRow {
  return {
    id: r.id as string,
    caseId: r.case_id as string,
    version: Number(r.version ?? 1),
    status: r.status as GenerationStatus,
    body: (r.body as string | null) ?? null,
    paragraphs: json<DraftParagraph[]>(r.paragraphs, []),
    moduleIds: json<string[]>(r.module_ids, []),
    primaryRoute: (r.primary_route as string | null) ?? null,
    secondaryRoutes: json<string[]>(r.secondary_routes, []),
    codeVersionId: (r.code_version_id as string | null) ?? null,
    pofaRoute: (r.pofa_route as string | null) ?? null,
    providerId: (r.provider_id as string | null) ?? null,
    promptVersion: (r.prompt_version as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    bespoke: Boolean(r.bespoke),
    validation: json<unknown>(r.validation, null),
    checklist: json<unknown>(r.checklist, null),
    warnings: json<string[]>(r.warnings, []),
    attempts: Number(r.attempts ?? 1),
    blockReason: (r.block_reason as string | null) ?? null,
    blockDetail: (r.block_detail as string | null) ?? null,
    generationVersion: (r.generation_version as string | null) ?? null,
    createdAt: r.created_at as string,
    supersededAt: (r.superseded_at as string | null) ?? null,
  };
}

/** The live draft for a case, whatever its status. */
export async function findCurrentDraft(
  caseId: string,
): Promise<AppealDraftRow | null> {
  const rows = await q(
    `SELECT * FROM case_appeal_drafts
      WHERE case_id = $1 AND superseded_at IS NULL
      ORDER BY version DESC LIMIT 1`,
    [caseId],
  );
  return rows[0] ? rowToDraft(rows[0]) : null;
}

/** The live draft only when it is releasable. */
export async function findReleasedDraft(
  caseId: string,
): Promise<AppealDraftRow | null> {
  const draft = await findCurrentDraft(caseId);
  if (!draft || draft.status !== "READY" || !draft.body) return null;
  return draft;
}

export async function listDraftsForCase(
  caseId: string,
): Promise<AppealDraftRow[]> {
  const rows = await q(
    `SELECT * FROM case_appeal_drafts WHERE case_id = $1 ORDER BY version DESC`,
    [caseId],
  );
  return rows.map(rowToDraft);
}

/** Split a released body into renderable paragraphs. */
export function toParagraphs(body: string): DraftParagraph[] {
  return body
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `p${i + 1}`, text }));
}

/**
 * Store a generation outcome as the case's live draft.
 *
 * Blocked outcomes are stored too — a manual reviewer needs to see what
 * the pipeline decided, not just that it refused.
 */
export async function saveDraft(
  caseId: string,
  result: GenerationResult,
): Promise<AppealDraftRow> {
  const now = new Date().toISOString();
  const previous = await findCurrentDraft(caseId);
  if (previous) {
    await q(
      `UPDATE case_appeal_drafts SET superseded_at = $2 WHERE id = $1`,
      [previous.id, now],
    );
  }

  const version = (previous?.version ?? 0) + 1;
  const id = `draft_${caseId.slice(-8)}_v${version}_${Math.random().toString(36).slice(2, 8)}`;
  const lastAttempt = result.attempts[result.attempts.length - 1];

  await q(
    `INSERT INTO case_appeal_drafts
       (id, case_id, version, status, body, paragraphs, module_ids,
        primary_route, secondary_routes, code_version_id, pofa_route,
        provider_id, prompt_version, model, bespoke,
        validation, checklist, warnings, attempts,
        block_reason, block_detail, generation_version, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
    [
      id,
      caseId,
      version,
      result.status,
      result.body,
      JSON.stringify(result.body ? toParagraphs(result.body) : []),
      JSON.stringify(result.moduleIds),
      result.analysis.primaryRoute ?? null,
      JSON.stringify(result.analysis.secondaryRoutes ?? []),
      result.analysis.codeVersionId ?? null,
      result.analysis.pofa?.route ?? null,
      result.provider?.providerId ?? null,
      result.provider?.promptVersion ?? null,
      result.provider?.model ?? null,
      result.provider?.bespoke ?? false,
      lastAttempt
        ? JSON.stringify({
            status: lastAttempt.validation.status,
            blockingCount: lastAttempt.validation.blockingCount,
            warningCount: lastAttempt.validation.warningCount,
            validatorVersion: lastAttempt.validation.validatorVersion,
            issues: lastAttempt.validation.issues,
          })
        : null,
      lastAttempt ? JSON.stringify(lastAttempt.checklist) : null,
      JSON.stringify(result.warnings),
      result.attempts.length || 1,
      result.reason,
      result.detail,
      result.generationVersion,
      now,
    ],
  );

  const rows = await q(`SELECT * FROM case_appeal_drafts WHERE id = $1`, [id]);
  return rowToDraft(rows[0]);
}
