import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import type {
  CodeVersion,
  DraftingBlock,
  KbModule,
  LegalSource,
} from "./types";

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

/* ------------------------------ Sources ------------------------------ */

function rowToSource(r: Row): LegalSource {
  return {
    sourceId: r.source_id as string,
    title: r.title as string,
    jurisdiction: r.jurisdiction as LegalSource["jurisdiction"],
    authorityLevel: r.authority_level as LegalSource["authorityLevel"],
    status: r.status as LegalSource["status"],
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    sourceReference: (r.source_reference as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    lastReviewedAt: (r.last_reviewed_at as string | null) ?? null,
    quotationEnabled: Boolean(r.quotation_enabled),
    notes: (r.notes as string | null) ?? null,
  };
}

export async function listLegalSources(): Promise<LegalSource[]> {
  const rows = await q(`SELECT * FROM legal_sources ORDER BY source_id`);
  return rows.map(rowToSource);
}

export async function upsertLegalSource(s: LegalSource): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO legal_sources (
       source_id, title, jurisdiction, authority_level, status,
       effective_from, effective_to, source_reference, source_url,
       last_reviewed_at, quotation_enabled, notes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
     ON CONFLICT (source_id) DO UPDATE SET
       title = EXCLUDED.title,
       jurisdiction = EXCLUDED.jurisdiction,
       authority_level = EXCLUDED.authority_level,
       status = EXCLUDED.status,
       effective_from = EXCLUDED.effective_from,
       effective_to = EXCLUDED.effective_to,
       source_reference = EXCLUDED.source_reference,
       source_url = EXCLUDED.source_url,
       last_reviewed_at = EXCLUDED.last_reviewed_at,
       notes = EXCLUDED.notes,
       updated_at = EXCLUDED.updated_at`,
    [
      s.sourceId, s.title, s.jurisdiction, s.authorityLevel, s.status,
      s.effectiveFrom, s.effectiveTo, s.sourceReference, s.sourceUrl,
      s.lastReviewedAt, s.quotationEnabled, s.notes, now,
    ],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

/**
 * KB-GOV-06 — administrators enable case-law quotation explicitly.
 * Deliberately the only writer of quotation_enabled so a re-seed can
 * never silently re-enable a quotation an admin turned off.
 */
export async function setQuotationEnabled(
  sourceId: string,
  enabled: boolean,
): Promise<void> {
  await q(
    `UPDATE legal_sources SET quotation_enabled = $2, updated_at = $3 WHERE source_id = $1`,
    [sourceId, enabled, new Date().toISOString()],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

/* --------------------------- Code versions --------------------------- */

function rowToCodeVersion(r: Row): CodeVersion {
  return {
    id: r.id as string,
    codeName: r.code_name as string,
    version: r.version as string,
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    transitionStatus: r.transition_status as string,
    ataApplicability: r.ata_applicability as string,
    publishedAt: (r.published_at as string | null) ?? null,
    sourceUrl: (r.source_url as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  };
}

export async function listCodeVersions(): Promise<CodeVersion[]> {
  const rows = await q(
    `SELECT * FROM code_versions ORDER BY effective_from NULLS FIRST`,
  );
  return rows.map(rowToCodeVersion);
}

export async function upsertCodeVersion(c: CodeVersion): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO code_versions (
       id, code_name, version, effective_from, effective_to,
       transition_status, ata_applicability, published_at, source_url,
       notes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
     ON CONFLICT (id) DO UPDATE SET
       code_name = EXCLUDED.code_name,
       version = EXCLUDED.version,
       effective_from = EXCLUDED.effective_from,
       effective_to = EXCLUDED.effective_to,
       transition_status = EXCLUDED.transition_status,
       ata_applicability = EXCLUDED.ata_applicability,
       published_at = EXCLUDED.published_at,
       source_url = EXCLUDED.source_url,
       notes = EXCLUDED.notes,
       updated_at = EXCLUDED.updated_at`,
    [
      c.id, c.codeName, c.version, c.effectiveFrom, c.effectiveTo,
      c.transitionStatus, c.ataApplicability, c.publishedAt, c.sourceUrl,
      c.notes, now,
    ],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

/* ------------------------------ Modules ------------------------------ */

function rowToModule(r: Row): KbModule {
  return {
    moduleId: r.module_id as string,
    topic: r.topic as string,
    routeFamily: r.route_family as KbModule["routeFamily"],
    useWhen: asArray(r.use_when),
    doNotUseWhen: asArray(r.do_not_use_when),
    legalBasis: (r.legal_basis as string | null) ?? null,
    coreProposition: r.core_proposition as string,
    aiMustCheck: asArray(r.ai_must_check),
    evidenceNeeded: asArray(r.evidence_needed),
    draftingNotes: (r.drafting_notes as string | null) ?? null,
    version: Number(r.version ?? 1),
    effectiveFrom: (r.effective_from as string | null) ?? null,
    effectiveTo: (r.effective_to as string | null) ?? null,
    status: r.status as KbModule["status"],
    sourceIds: asArray(r.source_ids),
    blockIds: asArray(r.block_ids),
    lastLegalReview: (r.last_legal_review as string | null) ?? null,
    changeNotes: (r.change_notes as string | null) ?? null,
  };
}

/**
 * Load modules with their joined source and block IDs.
 * `onlyActive` implements the first structured retrieval filter
 * (KB §20: status = ACTIVE).
 */
export async function listKbModules(
  opts: { onlyActive?: boolean } = {},
): Promise<KbModule[]> {
  const where = opts.onlyActive ? `WHERE m.status = 'ACTIVE'` : ``;
  const rows = await q(
    `SELECT m.*,
            COALESCE(
              (SELECT jsonb_agg(s.source_id ORDER BY s.source_id)
                 FROM kb_module_sources s WHERE s.module_id = m.module_id),
              '[]'::jsonb) AS source_ids,
            COALESCE(
              (SELECT jsonb_agg(b.block_id ORDER BY b.block_id)
                 FROM kb_module_blocks b WHERE b.module_id = m.module_id),
              '[]'::jsonb) AS block_ids
       FROM kb_modules m
       ${where}
       ORDER BY m.module_id`,
  );
  return rows.map(rowToModule);
}

export async function upsertKbModule(m: KbModule): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO kb_modules (
       module_id, topic, route_family, use_when, do_not_use_when,
       legal_basis, core_proposition, ai_must_check, evidence_needed,
       drafting_notes, version, effective_from, effective_to, status,
       last_legal_review, change_notes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
     ON CONFLICT (module_id) DO UPDATE SET
       topic = EXCLUDED.topic,
       route_family = EXCLUDED.route_family,
       use_when = EXCLUDED.use_when,
       do_not_use_when = EXCLUDED.do_not_use_when,
       legal_basis = EXCLUDED.legal_basis,
       core_proposition = EXCLUDED.core_proposition,
       ai_must_check = EXCLUDED.ai_must_check,
       evidence_needed = EXCLUDED.evidence_needed,
       drafting_notes = EXCLUDED.drafting_notes,
       version = EXCLUDED.version,
       effective_from = EXCLUDED.effective_from,
       effective_to = EXCLUDED.effective_to,
       last_legal_review = EXCLUDED.last_legal_review,
       change_notes = EXCLUDED.change_notes,
       updated_at = EXCLUDED.updated_at`,
    [
      m.moduleId, m.topic, m.routeFamily,
      JSON.stringify(m.useWhen), JSON.stringify(m.doNotUseWhen),
      m.legalBasis, m.coreProposition,
      JSON.stringify(m.aiMustCheck), JSON.stringify(m.evidenceNeeded),
      m.draftingNotes, m.version, m.effectiveFrom, m.effectiveTo, m.status,
      m.lastLegalReview, m.changeNotes, now,
    ],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

export async function setModuleStatus(
  moduleId: string,
  status: KbModule["status"],
): Promise<void> {
  await q(
    `UPDATE kb_modules SET status = $2, updated_at = $3 WHERE module_id = $1`,
    [moduleId, status, new Date().toISOString()],
  );
  // Live retrieval reads through the catalog cache — drop it so the
  // next appeal sees this governance decision immediately.
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

/**
 * Archive the current row, then apply an approved content update.
 *
 * History is never overwritten: the previous version is written to
 * kb_module_revisions before the live row changes. Retrieval continues
 * to use the current ACTIVE row filtered by effective dates.
 */
export async function updateKbModuleContent(
  moduleId: string,
  patch: {
    coreProposition?: string;
    useWhen?: string[];
    doNotUseWhen?: string[];
    legalBasis?: string | null;
    evidenceNeeded?: string[];
    draftingNotes?: string | null;
    aiMustCheck?: string[];
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    lastLegalReview?: string | null;
    changeNotes?: string | null;
    status?: KbModule["status"];
  },
): Promise<KbModule | null> {
  const rows = await q(`SELECT * FROM kb_modules WHERE module_id = $1`, [
    moduleId,
  ]);
  if (rows.length === 0) return null;
  const current = rowToModule(rows[0]);
  const now = new Date().toISOString();

  await q(
    `INSERT INTO kb_module_revisions (
       module_id, version, snapshot_json, archived_at, change_notes
     ) VALUES ($1, $2, $3, $4, $5)`,
    [
      current.moduleId,
      current.version,
      JSON.stringify(current),
      now,
      patch.changeNotes ?? current.changeNotes,
    ],
  );

  const next: KbModule = {
    ...current,
    coreProposition: patch.coreProposition ?? current.coreProposition,
    useWhen: patch.useWhen ?? current.useWhen,
    doNotUseWhen: patch.doNotUseWhen ?? current.doNotUseWhen,
    legalBasis:
      patch.legalBasis !== undefined ? patch.legalBasis : current.legalBasis,
    evidenceNeeded: patch.evidenceNeeded ?? current.evidenceNeeded,
    draftingNotes:
      patch.draftingNotes !== undefined
        ? patch.draftingNotes
        : current.draftingNotes,
    aiMustCheck: patch.aiMustCheck ?? current.aiMustCheck,
    effectiveFrom:
      patch.effectiveFrom !== undefined
        ? patch.effectiveFrom
        : current.effectiveFrom,
    effectiveTo:
      patch.effectiveTo !== undefined
        ? patch.effectiveTo
        : current.effectiveTo,
    lastLegalReview:
      patch.lastLegalReview !== undefined
        ? patch.lastLegalReview
        : current.lastLegalReview,
    changeNotes:
      patch.changeNotes !== undefined ? patch.changeNotes : current.changeNotes,
    status: patch.status ?? current.status,
    version: current.version + 1,
  };

  await q(
    `UPDATE kb_modules SET
       use_when = $2, do_not_use_when = $3, legal_basis = $4,
       core_proposition = $5, ai_must_check = $6, evidence_needed = $7,
       drafting_notes = $8, version = $9, effective_from = $10,
       effective_to = $11, status = $12, last_legal_review = $13,
       change_notes = $14, updated_at = $15
     WHERE module_id = $1`,
    [
      next.moduleId,
      JSON.stringify(next.useWhen),
      JSON.stringify(next.doNotUseWhen),
      next.legalBasis,
      next.coreProposition,
      JSON.stringify(next.aiMustCheck),
      JSON.stringify(next.evidenceNeeded),
      next.draftingNotes,
      next.version,
      next.effectiveFrom,
      next.effectiveTo,
      next.status,
      next.lastLegalReview,
      next.changeNotes,
      now,
    ],
  );

  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
  return next;
}

/** Historic snapshots for audit / event-date reconstruction. */
export async function listModuleRevisions(
  moduleId: string,
): Promise<Array<{ version: number; archivedAt: string; module: KbModule }>> {
  const rows = await q(
    `SELECT version, archived_at, snapshot_json
     FROM kb_module_revisions
     WHERE module_id = $1
     ORDER BY version DESC`,
    [moduleId],
  );
  return rows.map((r) => ({
    version: Number(r.version),
    archivedAt: r.archived_at as string,
    module: r.snapshot_json as KbModule,
  }));
}

export async function linkModuleSource(
  moduleId: string,
  sourceId: string,
): Promise<void> {
  await q(
    `INSERT INTO kb_module_sources (module_id, source_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [moduleId, sourceId],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

export async function linkModuleBlock(
  moduleId: string,
  blockId: string,
): Promise<void> {
  await q(
    `INSERT INTO kb_module_blocks (module_id, block_id) VALUES ($1,$2)
     ON CONFLICT DO NOTHING`,
    [moduleId, blockId],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

/**
 * Batched join-row writes, for the seed.
 *
 * The seed wrote 139 join rows one statement at a time. Against a
 * serverless Postgres each of those is a network round trip, so the
 * loops alone cost more than half a minute. `unnest` turns each loop
 * into one statement; the conflict behaviour is identical.
 */
export async function linkModuleSourcesBatch(
  pairs: readonly [string, string][],
): Promise<void> {
  if (pairs.length === 0) return;
  await q(
    `INSERT INTO kb_module_sources (module_id, source_id)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT DO NOTHING`,
    [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
  );
}

export async function linkModuleBlocksBatch(
  pairs: readonly [string, string][],
): Promise<void> {
  if (pairs.length === 0) return;
  await q(
    `INSERT INTO kb_module_blocks (module_id, block_id)
     SELECT * FROM unnest($1::text[], $2::text[])
     ON CONFLICT DO NOTHING`,
    [pairs.map((p) => p[0]), pairs.map((p) => p[1])],
  );
}

/* --------------------------- Drafting blocks --------------------------- */

function rowToBlock(r: Row): DraftingBlock {
  return {
    blockId: r.block_id as string,
    title: r.title as string,
    routeFamily: r.route_family as DraftingBlock["routeFamily"],
    text: r.text as string,
    variables: asArray(r.variables),
    status: r.status as DraftingBlock["status"],
    version: Number(r.version ?? 1),
    inV2Appendix: Boolean(r.in_v2_appendix),
    usageNotes: (r.usage_notes as string | null) ?? null,
  };
}

export async function listDraftingBlocks(
  opts: { onlyActive?: boolean } = {},
): Promise<DraftingBlock[]> {
  const where = opts.onlyActive ? `WHERE status = 'ACTIVE'` : ``;
  const rows = await q(
    `SELECT * FROM drafting_blocks ${where} ORDER BY block_id`,
  );
  return rows.map(rowToBlock);
}

export async function upsertDraftingBlock(b: DraftingBlock): Promise<void> {
  const now = new Date().toISOString();
  await q(
    `INSERT INTO drafting_blocks (
       block_id, title, route_family, text, variables, status, version,
       in_v2_appendix, usage_notes, created_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
     ON CONFLICT (block_id) DO UPDATE SET
       title = EXCLUDED.title,
       route_family = EXCLUDED.route_family,
       text = EXCLUDED.text,
       variables = EXCLUDED.variables,
       version = EXCLUDED.version,
       in_v2_appendix = EXCLUDED.in_v2_appendix,
       usage_notes = EXCLUDED.usage_notes,
       updated_at = EXCLUDED.updated_at`,
    [
      b.blockId, b.title, b.routeFamily, b.text,
      JSON.stringify(b.variables), b.status, b.version,
      b.inV2Appendix, b.usageNotes, now,
    ],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}

export async function setBlockStatus(
  blockId: string,
  status: DraftingBlock["status"],
): Promise<void> {
  await q(
    `UPDATE drafting_blocks SET status = $2, updated_at = $3 WHERE block_id = $1`,
    [blockId, status, new Date().toISOString()],
  );
  const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
  invalidateKbCatalog();
}
