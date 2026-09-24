import { randomUUID } from "crypto";
import { getSql, hasDb } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";
import { GRAPH_MODULE_EDGES } from "./graph";

/**
 * Module → module edges: the relationship the knowledge "graph" never had.
 *
 * Until now the KB was a three-level tree — source → module → block —
 * with nothing connecting one module to another. That left two real
 * facts about the legal content unrepresentable: that some grounds
 * contradict each other, and that some are meaningless without another.
 *
 * The edges are seeded from code and read from the database, the same
 * pattern the rest of the KB uses, so an administrator can add or retire
 * an edge without a deploy while the code-side set remains the floor
 * when there is no database.
 *
 * DELIBERATELY SMALL. Every edge below is a relationship I can state a
 * reason for, in the note. An edge that merely looks plausible would
 * silently suppress a legitimate ground, which is a worse failure than
 * having no edge at all — so the seed covers the cases the knowledge
 * base itself calls out and stops there.
 */

export type EdgeKind = "SUPERSEDES" | "REQUIRES" | "CONFLICTS_WITH" | "NARROWS";

export interface ModuleEdge {
  fromModule: string;
  toModule: string;
  kind: EdgeKind;
  weight: number;
  note: string;
}

/**
 * The code-side floor, from lib/kb/graph.json.
 *
 * CONFLICTS_WITH is symmetric in meaning but stored one way; readers
 * must treat it as undirected (see `conflictsWith` below).
 */
export const SEED_MODULE_EDGES: ModuleEdge[] = GRAPH_MODULE_EDGES;

interface EdgeRow {
  from_module: string;
  to_module: string;
  edge_kind: string;
  weight: number;
  note: string | null;
}

let cache: { at: number; edges: ModuleEdge[] } | null = null;
const TTL_MS = 15_000;

/** Reset the cache — for tests and after an admin edit. */
export function invalidateModuleEdgeCache(): void {
  cache = null;
}

/**
 * Load the edges. Admin rows replace the seed for the same
 * (from, to, kind) triple and may add new ones; the seed is the floor
 * when there is no database, matching how the rest of this codebase
 * degrades.
 */
export async function loadModuleEdges(): Promise<ModuleEdge[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.edges;

  const merged = new Map<string, ModuleEdge>();
  const keyOf = (e: { fromModule: string; toModule: string; kind: string }) =>
    `${e.fromModule}|${e.toModule}|${e.kind}`;
  for (const e of SEED_MODULE_EDGES) merged.set(keyOf(e), e);

  if (hasDb()) {
    try {
      await ensureSchema();
      const sql = getSql();
      const res = await sql.query(
        `SELECT from_module, to_module, edge_kind, weight, note
           FROM kb_module_edges WHERE status = 'ACTIVE'`,
      );
      const rows = (
        Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])
      ) as EdgeRow[];
      for (const r of rows) {
        const e: ModuleEdge = {
          fromModule: r.from_module,
          toModule: r.to_module,
          kind: r.edge_kind as EdgeKind,
          weight: Number(r.weight ?? 0),
          note: r.note ?? "",
        };
        merged.set(keyOf(e), e);
      }
    } catch {
      // A graph-edge outage must not stop an appeal being generated. The
      // seed is a safe floor: it suppresses contradictory stacking and
      // nothing else.
    }
  }

  const edges = [...merged.values()];
  cache = { at: Date.now(), edges };
  return edges;
}

/** Seed the code-side edges into the database, without clobbering edits. */
export async function seedModuleEdges(): Promise<number> {
  if (!hasDb()) return 0;
  await ensureSchema();
  const sql = getSql();
  const now = new Date().toISOString();
  let written = 0;
  for (const e of SEED_MODULE_EDGES) {
    await sql.query(
      `INSERT INTO kb_module_edges
         (id, from_module, to_module, edge_kind, weight, note, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',$7,$7)
       ON CONFLICT (from_module, to_module, edge_kind) DO NOTHING`,
      [randomUUID(), e.fromModule, e.toModule, e.kind, e.weight, e.note, now],
    );
    written += 1;
  }
  invalidateModuleEdgeCache();
  return written;
}

export async function upsertModuleEdge(input: {
  fromModule: string;
  toModule: string;
  kind: EdgeKind;
  weight?: number;
  note?: string;
  status?: "ACTIVE" | "DISABLED";
}): Promise<void> {
  await ensureSchema();
  const sql = getSql();
  const now = new Date().toISOString();
  await sql.query(
    `INSERT INTO kb_module_edges
       (id, from_module, to_module, edge_kind, weight, note, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
     ON CONFLICT (from_module, to_module, edge_kind) DO UPDATE SET
       weight = EXCLUDED.weight,
       note = EXCLUDED.note,
       status = EXCLUDED.status,
       updated_at = EXCLUDED.updated_at`,
    [
      randomUUID(),
      input.fromModule,
      input.toModule,
      input.kind,
      input.weight ?? 0,
      input.note ?? null,
      input.status ?? "ACTIVE",
      now,
    ],
  );
  invalidateModuleEdgeCache();
}

/* ---------------- Query helpers over a loaded edge set ---------------- */

/** Conflicts are undirected regardless of which way the row was stored. */
export function conflictsWith(edges: ModuleEdge[], moduleId: string): Set<string> {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.kind !== "CONFLICTS_WITH") continue;
    if (e.fromModule === moduleId) out.add(e.toModule);
    if (e.toModule === moduleId) out.add(e.fromModule);
  }
  return out;
}

/** Modules this one cannot stand without. Directed. */
export function prerequisitesOf(edges: ModuleEdge[], moduleId: string): string[] {
  return edges
    .filter((e) => e.kind === "REQUIRES" && e.fromModule === moduleId)
    .map((e) => e.toModule);
}

/** Modules this one is a more specific case of. Directed. */
export function generalisationsOf(edges: ModuleEdge[], moduleId: string): string[] {
  return edges
    .filter((e) => e.kind === "NARROWS" && e.fromModule === moduleId)
    .map((e) => e.toModule);
}

/** Modules superseded by this one. Directed. */
export function supersededBy(edges: ModuleEdge[], moduleId: string): string[] {
  return edges
    .filter((e) => e.kind === "SUPERSEDES" && e.fromModule === moduleId)
    .map((e) => e.toModule);
}
