import { ensureSchema } from "@/lib/db/schema";
import { hasDb } from "@/lib/db/pool";
import {
  linkModuleBlock,
  linkModuleSource,
  upsertCodeVersion,
  upsertDraftingBlock,
  upsertKbModule,
  upsertLegalSource,
} from "../repo";
import type { KbModule } from "../types";
import { LEGAL_SOURCES } from "./sources";
import { CODE_VERSIONS } from "./codeVersions";
import { KB_MODULES_CORE } from "./modules.core";
import { KB_MODULES_NEW } from "./modules.new";
import { buildAllDraftingBlocks } from "./blocks";

/** All 58 controlled knowledge modules. */
export const ALL_KB_MODULES: KbModule[] = [
  ...KB_MODULES_CORE,
  ...KB_MODULES_NEW,
];

export {
  LEGAL_SOURCES,
  CODE_VERSIONS,
  KB_MODULES_CORE,
  KB_MODULES_NEW,
  buildAllDraftingBlocks,
};

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

/**
 * Idempotent knowledge-base seed.
 *
 * Upserts sources, Code versions, modules and drafting blocks. Safe to
 * re-run: administrator-controlled fields are deliberately NOT reset —
 * `status` on existing modules/blocks and `quotation_enabled` on
 * sources are left untouched by the upserts in `repo.ts`, so admin
 * decisions survive a redeploy (V2 §19).
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

    for (const s of LEGAL_SOURCES) await upsertLegalSource(s);
    for (const c of CODE_VERSIONS) await upsertCodeVersion(c);

    const blocks = buildAllDraftingBlocks();
    for (const b of blocks) await upsertDraftingBlock(b);

    for (const m of ALL_KB_MODULES) await upsertKbModule(m);

    // Join rows last so FK targets exist.
    const knownSources = new Set(LEGAL_SOURCES.map((s) => s.sourceId));
    const knownBlocks = new Set(blocks.map((b) => b.blockId));
    let sourceLinks = 0;
    let blockLinks = 0;
    for (const m of ALL_KB_MODULES) {
      for (const sid of m.sourceIds) {
        if (!knownSources.has(sid)) continue;
        await linkModuleSource(m.moduleId, sid);
        sourceLinks += 1;
      }
      for (const bid of m.blockIds) {
        if (!knownBlocks.has(bid)) continue;
        await linkModuleBlock(m.moduleId, bid);
        blockLinks += 1;
      }
    }

    return {
      sources: LEGAL_SOURCES.length,
      codeVersions: CODE_VERSIONS.length,
      modules: ALL_KB_MODULES.length,
      blocks: blocks.length,
      moduleSourceLinks: sourceLinks,
      moduleBlockLinks: blockLinks,
    };
  })();
  try {
    return await running;
  } catch (err) {
    running = null;
    throw err;
  }
}
