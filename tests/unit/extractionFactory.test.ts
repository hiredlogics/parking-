/**
 * @vitest-environment node
 *
 * These tests guard the extraction-provider factory behaviour.
 * The pack requires: real OpenAI extraction by default, never a silent
 * fallback to mock data. The mock is only reachable via the explicit
 * EXTRACTION_PROVIDER=mock opt-in used by this test suite.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getExtractionProvider,
  resetExtractionProvider,
} from "@/services/extraction";
import { MockDocumentExtractionProvider } from "@/services/extraction/mockProvider";
import { OpenAIExtractionProvider } from "@/services/extraction/openaiProvider";

let savedProvider: string | undefined;
let savedKey: string | undefined;

beforeEach(() => {
  savedProvider = process.env.EXTRACTION_PROVIDER;
  savedKey = process.env.OPENAI_API_KEY;
  resetExtractionProvider();
});

afterEach(() => {
  if (savedProvider === undefined) delete process.env.EXTRACTION_PROVIDER;
  else process.env.EXTRACTION_PROVIDER = savedProvider;
  if (savedKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = savedKey;
  resetExtractionProvider();
});

describe("extraction provider factory", () => {
  it("returns the OpenAI provider by default when OPENAI_API_KEY is set", () => {
    delete process.env.EXTRACTION_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test-key";
    const p = getExtractionProvider();
    expect(p).toBeInstanceOf(OpenAIExtractionProvider);
  });

  it("throws instead of silently falling back to the mock when no API key is set", () => {
    delete process.env.EXTRACTION_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    expect(() => getExtractionProvider()).toThrow(/OPENAI_API_KEY/);
  });

  it("returns the mock provider only when EXTRACTION_PROVIDER=mock is explicitly set", () => {
    process.env.EXTRACTION_PROVIDER = "mock";
    delete process.env.OPENAI_API_KEY;
    const p = getExtractionProvider();
    expect(p).toBeInstanceOf(MockDocumentExtractionProvider);
  });
});
