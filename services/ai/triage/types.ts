import type { DocumentTriageResult } from "@/types/triage";

export interface TriageFileInput {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface TriageProviderResult {
  output: DocumentTriageResult | null;
  providerId: string;
  model: string | null;
  error?: string;
}

export interface DocumentTriageProvider {
  id: string;
  assess(input: {
    file: TriageFileInput;
    /** Extracted field hints to improve classification. */
    extractedHints?: {
      operatorName?: string | null;
      allegedBreach?: string | null;
      parkingLocation?: string | null;
      chargeAmount?: number | null;
    };
    caseId?: string | null;
  }): Promise<TriageProviderResult>;
}
