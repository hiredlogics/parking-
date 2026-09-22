/**
 * Durable document understanding — the triage spine.
 *
 * Written once at extraction. Confirm must not overwrite these fields.
 * Service suitability is decided here before any questioning.
 */
import type {
  DetectedCaseStage,
  DocumentKind,
  DocumentTriageResult,
  TriageServiceDecision,
} from "@/types/triage";
import type { ExtractionResult } from "@/types";

/** Customer-facing stop message for unsuitable / wrong-stage documents. */
export const SERVICE_NOT_SUITABLE_DETAIL =
  "This document appears to be at a later stage of the process and is not suitable for the standard appeal service.";

/** Customer-facing stop when the upload is not a related parking notice. */
export const UNRELATED_DOCUMENT_DETAIL =
  "This file does not appear to be a private parking charge notice (or Notice to Keeper). Please upload a clear photo or PDF of your parking notice. Other documents cannot be used for this appeal service.";


export interface DurableDocumentUnderstanding {
  documentType: DocumentKind | null;
  senderName: string | null;
  parkingOperatorName: string | null;
  caseStage: DetectedCaseStage | null;
  serviceDecision: TriageServiceDecision | null;
}

export function isServiceSupported(
  decision: TriageServiceDecision | string | null | undefined,
): boolean {
  if (!decision) return true;
  return (
    decision === "PRIVATE_PARKING_INITIAL_APPEAL_OK" ||
    decision === "MANUAL_REVIEW"
  );
}

export function isServiceNotSupported(
  decision: TriageServiceDecision | string | null | undefined,
): boolean {
  return (
    decision === "NOT_SUPPORTED" || decision === "WRONG_STAGE_REDIRECT"
  );
}

/**
 * Apply triage onto extraction: separate sender from parking operator.
 * Never leave a debt-recovery sender in the parking-operator field.
 */
export function applyTriageToExtraction(
  extraction: ExtractionResult,
  triage: DocumentTriageResult,
): ExtractionResult {
  const raw = { ...extraction.raw };
  const warnings = [...(extraction.warnings ?? [])];

  const notSupported = isServiceNotSupported(triage.serviceDecision);

  if (notSupported) {
    // Prefer true parking operator; never keep DRP (or other senders) as operator.
    if (triage.parkingOperatorName) {
      raw.operator_name = triage.parkingOperatorName;
    } else if (
      triage.senderName &&
      raw.operator_name &&
      raw.operator_name.trim().toLowerCase() ===
        triage.senderName.trim().toLowerCase()
    ) {
      delete raw.operator_name;
    }
    warnings.push(triage.detail || SERVICE_NOT_SUITABLE_DETAIL);
  } else if (
    triage.parkingOperatorName &&
    triage.senderName &&
    triage.parkingOperatorName !== triage.senderName
  ) {
    raw.operator_name = triage.parkingOperatorName;
    warnings.push(
      `Document sender recorded as ${triage.senderName}; parking operator shown as ${triage.parkingOperatorName}.`,
    );
  } else if (triage.parkingOperatorName) {
    raw.operator_name = triage.parkingOperatorName;
  }

  // Persist triage stage on the extracted notice — confirm must not reset it.
  if (triage.caseStage) {
    raw.case_stage = triage.caseStage as typeof raw.case_stage;
  }

  return {
    ...extraction,
    raw,
    triage: {
      ...triage,
      detail: notSupported
        ? SERVICE_NOT_SUITABLE_DETAIL
        : triage.detail,
      serviceDecision: notSupported
        ? "NOT_SUPPORTED"
        : triage.serviceDecision,
    },
    warnings,
  };
}

export function understandingFromTriage(
  triage: DocumentTriageResult | null | undefined,
): DurableDocumentUnderstanding {
  if (!triage) {
    return {
      documentType: null,
      senderName: null,
      parkingOperatorName: null,
      caseStage: null,
      serviceDecision: null,
    };
  }
  return {
    documentType: triage.documentKind,
    senderName: triage.senderName,
    parkingOperatorName: triage.parkingOperatorName,
    caseStage: triage.caseStage,
    serviceDecision: isServiceNotSupported(triage.serviceDecision)
      ? "NOT_SUPPORTED"
      : triage.serviceDecision,
  };
}
