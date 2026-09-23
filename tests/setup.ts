import "@testing-library/jest-dom/vitest";

/**
 * Keep the automated suite off the OpenAI API.
 *
 * Every AI surface is pinned to its deterministic or mock provider
 * here, not just extraction. Individual tests already opted out where
 * they needed to, but relying on that left a real hazard: now that
 * production drafting and question generation default to OpenAI
 * whenever a key is present, a test that reached a provider factory
 * without overriding it would make a paid, non-deterministic call.
 *
 * A test that genuinely needs the AI provider sets its own value and
 * restores it, as tests/unit/drafting.test.ts does.
 */
process.env.EXTRACTION_PROVIDER = "mock";
process.env.DRAFTING_PROVIDER = "deterministic";
process.env.QUESTION_PROVIDER = "bank";
process.env.EVIDENCE_PROVIDER = "mock";

/**
 * Pin pricing so cost assertions do not move when rates are revised.
 */
process.env.AI_PRICING_VERSION = "2026-09";
