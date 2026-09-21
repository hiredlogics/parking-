/**
 * @vitest-environment node
 *
 * Extraction factory: AI by default (wrapped with rules fallback),
 * mock only via EXTRACTION_PROVIDER=mock, rules-only via EXTRACTION_PROVIDER=rules.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getExtractionProvider,
  resetExtractionProvider,
} from "@/services/extraction";
import { MockDocumentExtractionProvider } from "@/services/extraction/mockProvider";
import { ResilientExtractionProvider } from "@/services/extraction/resilientProvider";

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
  it("returns a resilient OpenAI wrapper when OPENAI_API_KEY is set", () => {
    delete process.env.EXTRACTION_PROVIDER;
    process.env.OPENAI_API_KEY = "sk-test-key";
    const p = getExtractionProvider();
    expect(p).toBeInstanceOf(ResilientExtractionProvider);
    expect(p.id).toMatch(/^resilient:openai:/);
  });

  it("falls back to rules OCR when no API key is set (does not use mock)", () => {
    delete process.env.EXTRACTION_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    const p = getExtractionProvider();
    expect(p).toBeInstanceOf(ResilientExtractionProvider);
    expect(p).not.toBeInstanceOf(MockDocumentExtractionProvider);
  });

  it("returns the mock provider only when EXTRACTION_PROVIDER=mock is explicitly set", () => {
    process.env.EXTRACTION_PROVIDER = "mock";
    delete process.env.OPENAI_API_KEY;
    const p = getExtractionProvider();
    expect(p).toBeInstanceOf(MockDocumentExtractionProvider);
  });

  it("returns rules-only when EXTRACTION_PROVIDER=rules", () => {
    process.env.EXTRACTION_PROVIDER = "rules";
    delete process.env.OPENAI_API_KEY;
    const p = getExtractionProvider();
    expect(p.id).toBe("rules-ocr");
  });
});
