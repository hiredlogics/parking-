import type { CodeVersion } from "../types";
import { GRAPH_CODE_VERSIONS } from "../graph";

/**
 * Industry Code version bands — Legal Authority & Source Register V1 §4.
 *
 * The records live in lib/kb/graph.json. The register's requirement is
 * why they are records at all: "store Code provisions as versioned
 * records with effective_from, effective_to, transition_status,
 * operator/ATA applicability and source URL. Never hard-code a
 * grace/consideration/keying rule without that metadata."
 */
export const CODE_VERSIONS: CodeVersion[] = GRAPH_CODE_VERSIONS;

/**
 * Resolve the Code band that governs a parking event.
 *
 * Returns null when the event date is unknown, so the caller can raise a
 * missing fact rather than guessing.
 */
export function resolveCodeVersion(
  parkingEventDate: string | null | undefined,
  ata: string = "ALL",
  versions: CodeVersion[] = CODE_VERSIONS,
): CodeVersion | null {
  if (!parkingEventDate) return null;
  const t = Date.parse(parkingEventDate);
  if (Number.isNaN(t)) return null;

  const applicable = versions.filter((v) => {
    const fromOk = !v.effectiveFrom || Date.parse(v.effectiveFrom) <= t;
    const toOk = !v.effectiveTo || t < Date.parse(v.effectiveTo);
    if (!fromOk || !toOk) return false;
    if (v.ataApplicability === "ALL") return true;
    return v.ataApplicability === ata;
  });
  if (applicable.length === 0) return null;

  // Prefer an ATA-specific band over the generic one for the same window.
  const ataSpecific = applicable.find((v) => v.ataApplicability !== "ALL");
  return ataSpecific ?? applicable[0];
}
