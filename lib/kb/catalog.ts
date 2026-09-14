/**
 * Canonical Knowledge Base catalog.
 *
 * ONE source of truth for live appeals.
 *
 * Before this module existed, retrieveKnowledge and retrieveForQuestion
 * defaulted to the compiled-in ALL_KB_MODULES seed. An administrator
 * could disable a module in Postgres and live appeals would ignore the
 * change entirely — the admin UI showed DISABLED, the appeal still
 * drafted from ACTIVE seed material.
 *
 * Every production caller of retrieval (drafting, questioning,
 * sufficiency, analysis) must load the catalog through this module and
 * pass it into the sync retrieval functions. The seed remains for:
 *
 *   - bootstrap / migration (ensureKbSeeded)
 *   - unit tests without a database
 *   - local development when DATABASE_URL is unset
 *
 * In production (and staging), a missing or empty database catalog is a
 * hard failure. Silently falling back to compiled seed would recreate
 * the defect this module exists to close.
 */

import { hasDb } from "@/lib/db/pool";
import { isProductionRuntime } from "@/lib/config/production";
import { ensureKbSeeded } from "@/lib/kb/seed";
import {
  ALL_KB_MODULES,
  LEGAL_SOURCES,
  CODE_VERSIONS,
  buildAllDraftingBlocks,
} from "@/lib/kb/seed";
import {
  listCodeVersions,
  listDraftingBlocks,
  listKbModules,
  listLegalSources,
} from "@/lib/kb/repo";
import type {
  CodeVersion,
  DraftingBlock,
  KbModule,
  LegalSource,
} from "@/lib/kb/types";

export interface KbCatalog {
  modules: KbModule[];
  sources: LegalSource[];
  blocks: DraftingBlock[];
  codeVersions: CodeVersion[];
  /** Where the data came from — never "seed" in production. */
  origin: "database" | "seed";
  loadedAt: string;
}

export class KbCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KbCatalogError";
  }
}

/** Short in-process cache so a single request chain does not re-query. */
const CACHE_TTL_MS = 5_000;
let cached: { catalog: KbCatalog; expiresAt: number } | null = null;

/** Drop the cache — call after every admin mutation. */
export function invalidateKbCatalog(): void {
  cached = null;
}

function seedCatalog(): KbCatalog {
  return {
    modules: ALL_KB_MODULES,
    sources: LEGAL_SOURCES,
    blocks: buildAllDraftingBlocks(),
    codeVersions: CODE_VERSIONS,
    origin: "seed",
    loadedAt: new Date().toISOString(),
  };
}

async function loadFromDatabase(): Promise<KbCatalog> {
  // Bootstrap if empty (first deploy / fresh branch). Admin status and
  // quotation flags survive re-seed by design in the upserts.
  await ensureKbSeeded();

  const [modules, sources, blocks, codeVersions] = await Promise.all([
    listKbModules(),
    listLegalSources(),
    listDraftingBlocks(),
    listCodeVersions(),
  ]);

  if (modules.length === 0) {
    throw new KbCatalogError(
      "The knowledge base is empty in the database. Seed it (ensureKbSeeded) before generating appeals.",
    );
  }

  return {
    modules,
    sources,
    blocks,
    codeVersions,
    origin: "database",
    loadedAt: new Date().toISOString(),
  };
}

/**
 * Load the catalog that live appeals must use.
 *
 * Production / staging: database only. Failure throws KbCatalogError —
 * callers must route the case to MANUAL_REVIEW rather than drafting
 * from stale seed material.
 *
 * Development / test without a database: compiled seed, so unit tests
 * and offline work still run.
 */
export async function loadKbCatalog(opts?: {
  /** Bypass the short in-process cache (e.g. after an admin write). */
  force?: boolean;
}): Promise<KbCatalog> {
  if (!opts?.force && cached && Date.now() < cached.expiresAt) {
    return cached.catalog;
  }

  /*
   * Unit/integration tests default to the compiled seed so they do not
   * hang on a developer's DATABASE_URL. Live-admin DB behaviour is
   * covered by injectable-module tests and by setting KB_USE_DATABASE=1.
   */
  const inTest =
    process.env.VITEST === "true" ||
    process.env.APP_ENV === "test" ||
    process.env.NODE_ENV === "test";
  if (inTest && process.env.KB_USE_DATABASE !== "1") {
    const catalog = seedCatalog();
    cached = { catalog, expiresAt: Date.now() + CACHE_TTL_MS };
    return catalog;
  }

  if (!hasDb()) {
    if (isProductionRuntime()) {
      throw new KbCatalogError(
        "DATABASE_URL is not set. Live appeals cannot load the approved knowledge base.",
      );
    }
    const catalog = seedCatalog();
    cached = { catalog, expiresAt: Date.now() + CACHE_TTL_MS };
    return catalog;
  }

  try {
    const catalog = await loadFromDatabase();
    cached = { catalog, expiresAt: Date.now() + CACHE_TTL_MS };
    return catalog;
  } catch (err) {
    if (isProductionRuntime()) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new KbCatalogError(
        `Failed to load the approved knowledge base from the database: ${detail}. Refusing to draft from compiled seed.`,
      );
    }
    // Dev/test only: seed is an explicit, logged fallback.
    console.warn(
      "[kb/catalog] database load failed; using compiled seed (non-production only):",
      err,
    );
    const catalog = seedCatalog();
    cached = { catalog, expiresAt: Date.now() + CACHE_TTL_MS };
    return catalog;
  }
}

/**
 * Resolve modules for a sync retrieval call.
 *
 * Production callers must pass catalog.modules. Falling through to seed
 * is refused so a missed await loadKbCatalog() cannot silently undo
 * admin governance.
 */
export function modulesForRetrieval(
  override: KbModule[] | undefined,
): KbModule[] {
  if (override) return override;
  if (isProductionRuntime()) {
    throw new KbCatalogError(
      "retrieveKnowledge was called without a catalog in production. Load via loadKbCatalog() and pass modules.",
    );
  }
  return ALL_KB_MODULES;
}

export function sourcesForRetrieval(
  override: LegalSource[] | undefined,
): LegalSource[] {
  if (override) return override;
  if (isProductionRuntime()) {
    throw new KbCatalogError(
      "retrieveKnowledge was called without sources in production. Load via loadKbCatalog().",
    );
  }
  return LEGAL_SOURCES;
}

export function blocksForRetrieval(
  override: DraftingBlock[] | undefined,
): DraftingBlock[] {
  if (override) return override;
  if (isProductionRuntime()) {
    throw new KbCatalogError(
      "retrieveKnowledge was called without blocks in production. Load via loadKbCatalog().",
    );
  }
  return buildAllDraftingBlocks();
}
