import type {
  DetectedCaseStage,
  DocumentKind,
  DocumentTriageResult,
  TriageServiceDecision,
} from "@/types/triage";

const DEBT_RECOVERY_DETAIL =
  "This document is a debt recovery letter, not an initial parking charge notice. A standard private parking appeal cannot be prepared from this at this stage. Please use Expert Help for debt recovery support.";

const LOC_DETAIL =
  "This looks like a Letter of Claim / pre-action debt letter rather than an initial parking charge notice. The standard private parking appeal service is not appropriate. Please use Expert Help.";

const COURT_DETAIL =
  "This looks like court, claim or enforcement paperwork. We cannot prepare an automated private parking appeal from this document. Please use Expert Help for County Court, CCJ or bailiff support.";

const COUNCIL_DETAIL =
  "This looks like a council or statutory penalty notice rather than a private parking charge. Our private parking appeal service is not the right route for this document.";

const DEBT_RECOVERY_SENDERS =
  /\b(?:debt\s*recovery\s*plus|\bdrp\b|zzps|trace\s*debt|debt\s*recovery|debt\s*collection|parking\s*collection|direct\s*collection(?:\s*bailiffs)?|\bdcbl\b|bw\s*legal|gladstones(?:\s*solicitors)?|moorside\s*legal|wright\s*hassall|qdr\s*solicitors|freeths|excel\s*collections?)\b/i;

const DEBT_RECOVERY_TEXT =
  /\b(?:letter\s+of\s+claim|pre[-\s]?action\s+protocol|legal\s+action\s+imminent|recommend(?:ing)?\s+legal\s+proceedings|county\s+court\s+judgment|\bccj\b|paydrp\.co\.uk|instructed\s+to\s+recover|debt\s+recovery\s*plus|urgent\s+reminder[\s\S]{0,120}legal\s+action|4\s+contact\s+attempts)\b/i;

const COURT_TEXT =
  /\b(?:claim\s+form(?:\s+n1)?|county\s+court\s+business\s+centre|notice\s+of\s+enforcement|warrant\s+of\s+control|writ\s+of\s+control|taking\s+control\s+of\s+goods|bailiff|high\s+court\s+enforcement)\b/i;

const COUNCIL_TEXT =
  /\b(?:local\s+authority|council\s+pcn|penalty\s+charge\s+notice|civil\s+enforcement\s+of\s+road\s+traffic|traffic\s+management\s+act)\b/i;

export interface DeterministicTriageInput {
  operatorName?: string | null;
  allegedBreach?: string | null;
  parkingLocation?: string | null;
  extraText?: string | null;
  /** Optional parking operator already separated by AI. */
  parkingOperatorName?: string | null;
  senderName?: string | null;
}

function combinedText(input: DeterministicTriageInput): string {
  return [
    input.senderName,
    input.operatorName,
    input.parkingOperatorName,
    input.allegedBreach,
    input.parkingLocation,
    input.extraText,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join("\n");
}

function result(partial: {
  documentKind: DocumentKind;
  caseStage: DetectedCaseStage;
  senderName: string | null;
  parkingOperatorName: string | null;
  serviceDecision: TriageServiceDecision;
  reasonCode: string;
  detail: string;
  confidence: number;
  signals: string[];
}): DocumentTriageResult {
  return {
    ...partial,
    providerId: "deterministic-triage",
    model: null,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Deterministic safety net — always runs even when AI triage is available.
 * Prefer AI for nuance; never let AI override a clear wrong-stage block
 * from known debt/court/council signals.
 */
export function assessDocumentDeterministic(
  input: DeterministicTriageInput,
): DocumentTriageResult {
  const sender =
    (input.senderName ?? input.operatorName ?? "").trim() || null;
  const parkingOp =
    (input.parkingOperatorName ?? "").trim() ||
    (sender && !DEBT_RECOVERY_SENDERS.test(sender) ? sender : null);
  const text = combinedText(input);

  if (COURT_TEXT.test(text)) {
    return result({
      documentKind: /ccj|judgment|enforcement|bailiff/i.test(text)
        ? "CCJ_OR_ENFORCEMENT"
        : "COURT_CLAIM",
      caseStage: /enforcement|bailiff/i.test(text)
        ? "ENFORCEMENT"
        : "COURT_PROCEEDINGS",
      senderName: sender,
      parkingOperatorName: parkingOp !== sender ? parkingOp : null,
      serviceDecision: "WRONG_STAGE_REDIRECT",
      reasonCode: "COURT_OR_ENFORCEMENT_STAGE",
      detail: COURT_DETAIL,
      confidence: 0.92,
      signals: ["deterministic:court_or_enforcement"],
    });
  }

  if (
    DEBT_RECOVERY_SENDERS.test(sender ?? "") ||
    DEBT_RECOVERY_TEXT.test(text)
  ) {
    const isLoc = /\bletter\s+of\s+claim|pre[-\s]?action\s+protocol\b/i.test(
      text,
    );
    return result({
      documentKind: isLoc ? "LETTER_OF_CLAIM" : "DEBT_RECOVERY",
      caseStage: isLoc ? "PRE_ACTION_LETTER_OF_CLAIM" : "DEBT_RECOVERY",
      senderName: sender,
      parkingOperatorName:
        parkingOp && parkingOp !== sender ? parkingOp : null,
      serviceDecision: "WRONG_STAGE_REDIRECT",
      reasonCode: isLoc ? "LETTER_OF_CLAIM_STAGE" : "DEBT_RECOVERY_STAGE",
      detail: isLoc ? LOC_DETAIL : DEBT_RECOVERY_DETAIL,
      confidence: 0.95,
      signals: ["deterministic:debt_recovery"],
    });
  }

  if (COUNCIL_TEXT.test(text)) {
    return result({
      documentKind: "COUNCIL_OR_STATUTORY",
      caseStage: "UNKNOWN",
      senderName: sender,
      parkingOperatorName: null,
      serviceDecision: "WRONG_STAGE_REDIRECT",
      reasonCode: "COUNCIL_OR_STATUTORY",
      detail: COUNCIL_DETAIL,
      confidence: 0.85,
      signals: ["deterministic:council"],
    });
  }

  return result({
    documentKind: "INITIAL_OPERATOR_PCN",
    caseStage: "INITIAL_OPERATOR_APPEAL",
    senderName: sender,
    parkingOperatorName: parkingOp,
    serviceDecision: "PRIVATE_PARKING_INITIAL_APPEAL_OK",
    reasonCode: "IN_SCOPE_INITIAL_APPEAL",
    detail: "Document appears to be an initial private parking notice.",
    confidence: 0.55,
    signals: ["deterministic:assumed_initial_pcn"],
  });
}

/** Prefer wrong-stage from either AI or deterministic. */
export function mergeTriageResults(
  ai: DocumentTriageResult | null | undefined,
  deterministic: DocumentTriageResult,
): DocumentTriageResult {
  if (!ai) return deterministic;

  if (
    deterministic.serviceDecision === "WRONG_STAGE_REDIRECT" &&
    ai.serviceDecision !== "WRONG_STAGE_REDIRECT"
  ) {
    return {
      ...deterministic,
      signals: [
        ...deterministic.signals,
        "merge:deterministic_override_wrong_stage",
        `ai_had:${ai.documentKind}`,
      ],
    };
  }

  if (ai.serviceDecision === "WRONG_STAGE_REDIRECT") {
    return {
      ...ai,
      senderName: ai.senderName ?? deterministic.senderName,
      parkingOperatorName:
        ai.parkingOperatorName ?? deterministic.parkingOperatorName,
      signals: [...ai.signals, "merge:ai_wrong_stage"],
    };
  }

  return {
    ...ai,
    senderName: ai.senderName ?? deterministic.senderName,
    parkingOperatorName:
      ai.parkingOperatorName ??
      (ai.senderName !== deterministic.parkingOperatorName
        ? deterministic.parkingOperatorName
        : ai.parkingOperatorName),
    signals: [...ai.signals, "merge:ai_primary"],
  };
}
