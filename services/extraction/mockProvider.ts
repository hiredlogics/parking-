import type { ExtractionResult, ExtractedPcn } from "@/types";
import { DEMO_SCENARIOS, findDemoScenarioByHint } from "@/tests/fixtures/demoScenarios";
import type { DocumentExtractionProvider } from "./types";

/**
 * MockDocumentExtractionProvider
 *
 * ⚠ Do not use in production. This provider is only wired into the
 * extraction factory when `EXTRACTION_PROVIDER=mock` is set — used for
 * automated tests and local sanity checks. The default provider is the
 * real OpenAI vision extractor (see `openaiProvider.ts`).
 *
 * Given a filename hint, this returns one of the seeded demo scenarios
 * verbatim; otherwise it rotates through them based on a stable hash of
 * the filename. It never returns fields the customer did not upload — it
 * simply mirrors the shape of a real provider so tests can exercise the
 * downstream pipeline without hitting the network.
 */
export class MockDocumentExtractionProvider implements DocumentExtractionProvider {
  readonly id = "mock-v1";
  readonly displayName = "Mock Extractor (test-only)";

  async extract(file: {
    name: string;
    mimeType: string;
    bytes: Uint8Array | ArrayBuffer;
    hint?: string;
  }): Promise<ExtractionResult> {
    const hint = file.hint ?? file.name;
    const scenario =
      findDemoScenarioByHint(hint) ??
      DEMO_SCENARIOS[stableHash(file.name) % DEMO_SCENARIOS.length];

    const raw: ExtractedPcn = { ...scenario.pcn };
    const confidence = Object.fromEntries(
      Object.keys(raw).map((k) => [k, 0.9]),
    ) as ExtractionResult["confidence"];

    return {
      raw,
      confidence,
      providerId: this.id,
      extractedAt: new Date().toISOString(),
      warnings: [
        "Mock extraction — this is fixture data, not the actual document. Enable OpenAI extraction for real uploads.",
      ],
    };
  }
}

function stableHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}
