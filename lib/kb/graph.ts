import type { CodeVersion, KbModule, LegalSource } from "./types";
import type { ModuleEdge } from "./edges";
import graph from "./graph.json";

/**
 * The controlled legal knowledge base, as data.
 *
 * `graph.json` is the single source of truth for the knowledge graph:
 * source and Code-version nodes, the 58 controlled modules, and the
 * module→module edges. It replaced four hand-maintained TypeScript data
 * files, which put ~2,000 lines of legal content behind a deploy.
 *
 * What is NOT here, deliberately:
 *
 *   Drafting wording. `paragraphs/library.ts` remains the canonical
 *   store for approved paragraph text and is covered by verbatim tests.
 *   Copying that wording into this file would create a second source of
 *   truth for the one thing in the system that may never be rewritten.
 *   Blocks are still derived from the library in seed/blocks.ts.
 *
 * This is the floor, not the authority: the seed writes these rows into
 * Postgres, and an administrator's edits there win (see lib/kb/repo.ts
 * and the status fields the upserts leave alone).
 */

export const GRAPH_VERSION: number = graph.version;

export const GRAPH_SOURCES = graph.sources as LegalSource[];
export const GRAPH_CODE_VERSIONS = graph.codeVersions as CodeVersion[];
export const GRAPH_MODULES = graph.modules as KbModule[];
export const GRAPH_MODULE_EDGES = graph.moduleEdges as ModuleEdge[];
