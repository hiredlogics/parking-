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
