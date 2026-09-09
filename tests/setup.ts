import "@testing-library/jest-dom/vitest";

/**
 * Force the mock extraction provider during automated tests so we never
 * hit the OpenAI API from the test suite. Production and dev use the
 * real OpenAI provider by default (see services/extraction/index.ts).
 */
process.env.EXTRACTION_PROVIDER = "mock";
