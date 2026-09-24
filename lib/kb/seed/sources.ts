/**
 * Legal Authority & Source Register V1 — §1 authority hierarchy, §2 core
 * legislation, §6 Beavis, §7 residential authorities, §9 CMA 2026
 * developments, §16 status flags.
 *
 * The records now live in lib/kb/graph.json. Rules they encode:
 *   - Case-law quotation is DISABLED by default (KB-GOV-06 / §17).
 *   - WITHDRAWN / GOVERNMENT_PROPOSAL / OPEN_INVESTIGATION must never be
 *     presented as current binding law.
 */
export { GRAPH_SOURCES as LEGAL_SOURCES } from "../graph";
