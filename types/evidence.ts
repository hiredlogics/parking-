export type EvidenceType =
  | "payment_receipt"
  | "app_screenshot"
  | "permit"
  | "signage_photo"
  | "anpr_evidence"
  | "location_evidence"
  | "authorisation_evidence"
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
  other: "Other",
};
