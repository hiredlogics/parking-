import type { ExtractionResult } from "@/types";

/**
 * Provider-agnostic contract for OCR / document extraction.
 *
 * Implementations must ONLY extract and classify. They must not make legal
 * decisions. Extracted values are not usable in the rules engine until the
 * customer confirms them on /appeal/confirm.
 */
export interface DocumentExtractionProvider {
  readonly id: string;
  readonly displayName: string;
  extract(file: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    /** Optional filename hint / demo case id. */
    hint?: string;
  }): Promise<ExtractionResult>;
}
