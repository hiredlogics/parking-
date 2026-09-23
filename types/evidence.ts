export type EvidenceType =
  | "payment_receipt"
  | "app_screenshot"
  | "permit"
  | "signage_photo"
  | "anpr_evidence"
  | "location_evidence"
  | "authorisation_evidence"
  | "breakdown_evidence"
  | "other";

export interface EvidenceItem {
  id: string;
  type: EvidenceType;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  uploadedAt: string;
  description?: string;
}

export const EVIDENCE_TYPE_LABELS: Record<EvidenceType, string> = {
  payment_receipt: "Payment receipt",
  app_screenshot: "App screenshot",
  permit: "Permit / authorisation",
  signage_photo: "Signage photo",
  anpr_evidence: "ANPR evidence",
  location_evidence: "Location evidence",
  authorisation_evidence: "Authorisation evidence",
  breakdown_evidence: "Breakdown / recovery evidence",
  other: "Other supporting evidence",
};

/**
 * Upload category → the evidence kinds the knowledge base names.
 *
 * WHY THIS EXISTS
 * ---------------
 * The KB describes the evidence a module needs in its own vocabulary —
 * "lease", "tenancy", "recovery_report", "dashcam" — and
 * `EVIDENCE_ESSENTIAL` in lib/retrieval/engine.ts filters modules on it.
 * That vocabulary and the nine tiles a customer can actually upload
 * under had NO values in common, and the filter compared one against the
 * other. The effect in production was that every module with an
 * essential-evidence requirement was unreachable no matter what the
 * customer supplied: the whole residential route (KB-RES-01..06), the
 * breakdown grounds (KB-BREAK-01, KB-BREAK-03) and KB-EV-01.
 *
 * It passed unnoticed because the UAT fixtures set `evidenceTypes` to
 * "lease" and "recovery_report" directly — values the upload path
 * rejects — so the tests exercised a vocabulary the product never
 * produces.
 *
 * This is a sufficiency check ("is evidence of this kind available?"),
 * not an assertion that the document says any particular thing. Nothing
 * here lets a ground be argued: the residential modules still require
 * `agreement_uploaded === "YES"`, and the residential and breakdown
 * prohibitions in lib/analysis/prohibited.ts still require the facts.
 */
export const KB_EVIDENCE_KINDS: Record<EvidenceType, string[]> = {
  // The tile is "Permit / authorisation"; a lease or tenancy uploaded to
  // appeal a residential charge arrives here.
  authorisation_evidence: ["lease", "tenancy", "parking_grant"],
  breakdown_evidence: [
    "recovery_report",
    "garage_invoice",
    "roadside_record",
    "call_logs",
  ],
  signage_photo: ["photos"],
  location_evidence: ["location_record", "dashcam", "cctv"],
  payment_receipt: ["receipt"],
  app_screenshot: ["receipt"],
  anpr_evidence: [],
  permit: [],
  other: [],
};

/**
 * Expand upload categories into the vocabulary the KB filters on,
 * keeping the originals so gates keyed on a tile still match.
 */
export function expandEvidenceKinds(evidenceTypes: string[]): string[] {
  const out = new Set<string>(evidenceTypes);
  for (const t of evidenceTypes) {
    for (const kind of KB_EVIDENCE_KINDS[t as EvidenceType] ?? []) {
      out.add(kind);
    }
  }
  return [...out];
}

/**
 * Which evidence tiles to suggest from selected situation tags.
 * Always includes "other" as a catch-all.
 */
export function evidenceTypesForScenarios(tags: unknown): EvidenceType[] {
  const set = new Set<EvidenceType>();
  const list = Array.isArray(tags) ? tags.map(String) : [];
  for (const t of list) {
    switch (t) {
      case "signage_issue":
        set.add("signage_photo");
        set.add("location_evidence");
        break;
      case "authorised_or_permit":
        set.add("permit");
        set.add("authorisation_evidence");
        break;
      case "resident_parking_rights":
        set.add("permit");
        set.add("authorisation_evidence");
        set.add("location_evidence");
        break;
      case "grace_or_exit":
      case "short_stay_consideration":
      case "anpr_disputed":
      case "multiple_visits_same_day":
        set.add("anpr_evidence");
        set.add("location_evidence");
        break;
      case "payment_made":
      case "payment_attempted_failed":
      case "vrm_error":
        set.add("payment_receipt");
        set.add("app_screenshot");
        break;
      case "breakdown_immobilised":
        set.add("breakdown_evidence");
        set.add("location_evidence");
        break;
      default:
        break;
    }
  }
  // Sensible defaults when no situation tags yet.
  if (set.size === 0) {
    set.add("signage_photo");
    set.add("payment_receipt");
    set.add("permit");
    set.add("authorisation_evidence");
  }
  set.add("other");
  return [...set];
}
