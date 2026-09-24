import { createHash } from "node:crypto";
import { ensureSchema } from "@/lib/db/schema";
import { getSql, hasDb } from "@/lib/db/pool";
import {
  linkModuleBlocksBatch,
  linkModuleSourcesBatch,
  upsertCodeVersion,
  upsertDraftingBlock,
  upsertKbModule,
  upsertLegalSource,
} from "../repo";
import type { KbModule } from "../types";
import { GRAPH_MODULES } from "../graph";
import { LEGAL_SOURCES } from "./sources";
import { CODE_VERSIONS } from "./codeVersions";
import { buildAllDraftingBlocks } from "./blocks";

/** All 58 controlled knowledge modules, from lib/kb/graph.json. */
export const ALL_KB_MODULES: KbModule[] = GRAPH_MODULES;

export { LEGAL_SOURCES, CODE_VERSIONS, buildAllDraftingBlocks };

export interface KbSeedSummary {
  sources: number;
  codeVersions: number;
  modules: number;
  blocks: number;
  moduleSourceLinks: number;
  moduleBlockLinks: number;
  skipped?: boolean;
}

let running: Promise<KbSeedSummary> | null = null;

const FINGERPRINT_KEY = "kb_seed_fingerprint";

/**
 * Identity of the content this seed would write.
 *
 * Only the fields the upserts actually set are hashed, so an
 * administrator toggling a module's status does not make the seed look
 * stale and trigger a pointless re-run.
 */
function seedFingerprint(blockIds: string[]): string {
  const h = createHash("sha256");
  h.update(
    JSON.stringify({
      sources: LEGAL_SOURCES.map((s) => s.sourceId),
      codeVersions: CODE_VERSIONS.map((c) => `${c.id}:${c.version}`),
      modules: ALL_KB_MODULES.map((m) => `${m.moduleId}:${m.version}`),
      blocks: blockIds,
      links: ALL_KB_MODULES.map(
        (m) => `${m.moduleId}>${m.sourceIds.join(",")}|${m.blockIds.join(",")}`,
      ),
    }),
  );
  return h.digest("hex");
}

/**
 * Idempotent knowledge-base seed.
 *
 * Upserts sources, Code versions, modules and drafting blocks. Safe to
 * re-run: administrator-controlled fields are deliberately NOT reset —
 * `status` on existing modules/blocks and `quotation_enabled` on
 * sources are left untouched by the upserts in `repo.ts`, so admin
 * decisions survive a redeploy (V2 §19).
 *
 * It also SKIPS itself when the database already holds this exact
 * content. That matters more than it sounds: the seed writes ~317 rows,
 * every one of them a separate network round trip to a serverless
 * Postgres, which measured at 78 seconds. It sat in front of appeal
 * generation, so the first customer after any cold start waited for all
 * of it. The fingerprint turns that into a single query.
 *
 * The row count is checked alongside the fingerprint so a truncated or
 * partially restored database still re-seeds rather than trusting a
 * stale marker.
 */
export async function ensureKbSeeded(): Promise<KbSeedSummary> {
  if (running) return running;
  running = (async () => {
    if (!hasDb()) {
      return {
        sources: 0, codeVersions: 0, modules: 0, blocks: 0,
        moduleSourceLinks: 0, moduleBlockLinks: 0, skipped: true,
      };
    }
    await ensureSchema();

    const blocks = buildAllDraftingBlocks();
    const fingerprint = seedFingerprint(blocks.map((b) => b.blockId));
    const sql = getSql();

    const res = (await sql.query(
      `SELECT
         (SELECT value FROM system_meta WHERE key = $1) AS fingerprint,
         (SELECT count(*) FROM kb_modules) AS module_count`,
      [FINGERPRINT_KEY],
    )) as unknown as
      | { rows?: Array<{ fingerprint: string | null; module_count: string }> }
      | Array<{ fingerprint: string | null; module_count: string }>;
    const row = (Array.isArray(res) ? res : (res.rows ?? []))[0];

    if (
      row?.fingerprint === fingerprint &&
      Number(row.module_count) >= ALL_KB_MODULES.length
    ) {
      return {
        sources: LEGAL_SOURCES.length,
        codeVersions: CODE_VERSIONS.length,
        modules: ALL_KB_MODULES.length,
        blocks: blocks.length,
        moduleSourceLinks: 0,
        moduleBlockLinks: 0,
        skipped: true,
      };
    }

    for (const s of LEGAL_SOURCES) await upsertLegalSource(s);
    for (const c of CODE_VERSIONS) await upsertCodeVersion(c);
    for (const b of blocks) await upsertDraftingBlock(b);
    for (const m of ALL_KB_MODULES) await upsertKbModule(m);

    // Join rows last so FK targets exist.
    const knownSources = new Set(LEGAL_SOURCES.map((s) => s.sourceId));
    const knownBlocks = new Set(blocks.map((b) => b.blockId));
    const sourcePairs: [string, string][] = [];
    const blockPairs: [string, string][] = [];
    for (const m of ALL_KB_MODULES) {
      for (const sid of m.sourceIds) {
        if (knownSources.has(sid)) sourcePairs.push([m.moduleId, sid]);
      }
      for (const bid of m.blockIds) {
        if (knownBlocks.has(bid)) blockPairs.push([m.moduleId, bid]);
      }
    }
    await linkModuleSourcesBatch(sourcePairs);
    await linkModuleBlocksBatch(blockPairs);

    await sql.query(
      `INSERT INTO system_meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [FINGERPRINT_KEY, fingerprint],
    );

    const { invalidateKbCatalog } = await import("@/lib/kb/catalog");
    invalidateKbCatalog();

    return {
      sources: LEGAL_SOURCES.length,
      codeVersions: CODE_VERSIONS.length,
      modules: ALL_KB_MODULES.length,
      blocks: blocks.length,
      moduleSourceLinks: sourcePairs.length,
      moduleBlockLinks: blockPairs.length,
    };
  })();
  try {
    return await running;
  } catch (err) {
    running = null;
    throw err;
  }
}
