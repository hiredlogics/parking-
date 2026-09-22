import type { DocumentTriageResult } from "@/types/triage";
import {
  assessDocumentDeterministic,
  mergeTriageResults,
} from "@/lib/triage/deterministic";
import { getTriageProvider } from "@/services/ai/triage";

/**
 * Full document triage: AI classification merged with deterministic
 * safety net. Always returns a result — never throws for classification
 * failure (falls back to deterministic).
 */
export async function runDocumentTriage(input: {
  file: { name: string; mimeType: string; bytes: Uint8Array };
  extractedHints?: {
    operatorName?: string | null;
    allegedBreach?: string | null;
    parkingLocation?: string | null;
    chargeAmount?: number | null;
  };
  caseId?: string | null;
}): Promise<DocumentTriageResult> {
  const deterministic = assessDocumentDeterministic({
    operatorName: input.extractedHints?.operatorName,
    allegedBreach: input.extractedHints?.allegedBreach,
    parkingLocation: input.extractedHints?.parkingLocation,
  });

  const provider = getTriageProvider();
  if (!provider) return deterministic;

  try {
    const ai = await provider.assess({
      file: input.file,
      extractedHints: input.extractedHints,
      caseId: input.caseId,
    });
    return mergeTriageResults(ai.output, deterministic);
  } catch (err) {
    console.warn("[triage] AI assess failed; using deterministic:", err);
    return deterministic;
  }
}
