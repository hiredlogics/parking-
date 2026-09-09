import type { CodeVersion } from "../types";

/**
 * Industry Code version bands — Legal Authority & Source Register V1 §4.
 *
 * As at September 2026 the BPA states the private parking sector Single
 * Code of Practice is current version 1.1, published 13 April 2026, with
 * version 1.1 having effect from 17 February 2025.
 *
 * Developer requirement from the register:
 *   "store Code provisions as versioned records with effective_from,
 *    effective_to, transition_status, operator/ATA applicability and
 *    source URL. Never hard-code a grace/consideration/keying rule
 *    without that metadata."
 */
export const CODE_VERSIONS: CodeVersion[] = [
  {
    id: "CODE-PRE-2024",
    codeName: "Earlier applicable ATA Code of Practice",
    version: "PRE_SINGLE_CODE",
    effectiveFrom: null,
    effectiveTo: "2024-02-01",
    transitionStatus: "HISTORIC",
    ataApplicability: "ALL",
    publishedAt: null,
    sourceUrl: null,
    notes:
      "Events before 1 February 2024: check the earlier applicable ATA Code. The Single Code must NOT be applied retrospectively.",
  },
  {
    id: "CODE-BPA-V9",
    codeName: "BPA Approved Operator Scheme Code of Practice",
    version: "9",
    effectiveFrom: "2024-02-01",
    effectiveTo: "2024-10-01",
    transitionStatus: "HISTORIC",
    ataApplicability: "BPA",
    publishedAt: null,
    sourceUrl:
      "https://www.britishparking.co.uk/Code-of-Practice-and-Compliance-Monitoring/Parking-News-Online",
    notes:
      "BPA states its Version 9 applies to BPA non-compliance issues from 1 February 2024 to before 1 October 2024.",
  },
  {
    id: "CODE-SINGLE-V1",
    codeName: "Private Parking Sector Single Code of Practice",
    version: "1",
    effectiveFrom: "2024-10-01",
    effectiveTo: "2025-02-17",
    transitionStatus: "HISTORIC",
    ataApplicability: "ALL",
    publishedAt: null,
    sourceUrl:
      "https://www.britishparking.co.uk/Code-of-Practice-and-Compliance-Monitoring/Parking-News-Online",
    notes:
      "Single Code Version 1 applies from 1 October 2024 to before 17 February 2025, subject to transition provisions.",
  },
  {
    id: "CODE-SINGLE-V1-1",
    codeName: "Private Parking Sector Single Code of Practice",
    version: "1.1",
    effectiveFrom: "2025-02-17",
    effectiveTo: null,
    transitionStatus: "CURRENT",
    ataApplicability: "ALL",
    publishedAt: "2026-04-13",
    sourceUrl:
      "https://www.britishparking.co.uk/write/Documents/AOS/Sector%20Code%20Templates/sectorsingleCodeofPracticeVersion1.1130225.pdf",
    notes:
      "Version 1.1 has effect from 17 February 2025, subject to transition provisions and later updates. BPA records a publication/foreword update on 13 April 2026 concerning signage transition alignment. This record must be maintained by an administrator, not hard-coded in application logic.",
  },
];

/**
 * Resolve the applicable Code version for a parking event.
 *
 * KB-GOV-05 requires applicability to be resolved before drafting. When
 * the event date is unknown we return null so the caller can raise a
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
