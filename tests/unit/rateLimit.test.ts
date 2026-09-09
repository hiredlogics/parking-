/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Rate limiting.
 *
 * Postgres is mocked with a map that reproduces the atomic
 * INSERT ... ON CONFLICT DO UPDATE ... RETURNING count semantics the
 * real implementation relies on.
 */

let buckets: Map<string, number>;

vi.mock("@/lib/db/schema", () => ({ ensureSchema: async () => {} }));
vi.mock("@/lib/db/pool", () => ({
  getSql: () => ({
    query: async (text: string, params: unknown[]) => {
      const key = params[0] as string;
      if (text.includes("INSERT INTO rate_limits")) {
        const next = (buckets.get(key) ?? 0) + 1;
        buckets.set(key, next);
        return { rows: [{ count: next }] };
      }
      if (text.startsWith("SELECT count")) {
        const found = buckets.get(key);
        return { rows: found === undefined ? [] : [{ count: found }] };
      }
      if (text.startsWith("DELETE")) {
        buckets.clear();
        return { rows: [] };
      }
      return { rows: [] };
    },
  }),
}));

const {
  consumeRateLimit,
  peekRateLimit,
  pruneRateLimits,
  EXTRACTION_RATE_LIMIT,
} = await import("@/lib/rateLimit");

const RULE = { action: "extract", limit: 3, windowSeconds: 3600 };

beforeEach(() => {
  buckets = new Map();
  delete process.env.RATE_LIMIT_EXTRACT_PER_HOUR;
});

describe("consumeRateLimit", () => {
  it("allows calls up to the limit", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await consumeRateLimit("user_1", RULE);
      expect(r.allowed, `call ${i + 1}`).toBe(true);
    }
  });

  it("blocks the call after the limit", async () => {
    for (let i = 0; i < 3; i++) await consumeRateLimit("user_1", RULE);
    const r = await consumeRateLimit("user_1", RULE);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("counts down remaining budget", async () => {
    expect((await consumeRateLimit("user_1", RULE)).remaining).toBe(2);
    expect((await consumeRateLimit("user_1", RULE)).remaining).toBe(1);
    expect((await consumeRateLimit("user_1", RULE)).remaining).toBe(0);
  });

  it("keeps subjects independent", async () => {
    for (let i = 0; i < 3; i++) await consumeRateLimit("user_1", RULE);
    // One user exhausting their budget must not affect another.
    expect((await consumeRateLimit("user_2", RULE)).allowed).toBe(true);
  });

  it("keeps actions independent", async () => {
    for (let i = 0; i < 3; i++) await consumeRateLimit("user_1", RULE);
    const other = await consumeRateLimit("user_1", { ...RULE, action: "draft" });
    expect(other.allowed).toBe(true);
  });

  it("reports a reset time and a positive retry delay", async () => {
    const r = await consumeRateLimit("user_1", RULE);
    expect(Date.parse(r.resetAt)).toBeGreaterThan(Date.now() - 1000);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("buckets by window so a later window is a fresh budget", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-01-01T10:00:00.000Z"));
      for (let i = 0; i < 3; i++) await consumeRateLimit("user_1", RULE);
      expect((await consumeRateLimit("user_1", RULE)).allowed).toBe(false);

      // Next hour is a new bucket key, so the budget resets.
      vi.setSystemTime(new Date("2026-01-01T11:30:00.000Z"));
      expect((await consumeRateLimit("user_1", RULE)).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("peekRateLimit", () => {
  it("does not consume budget", async () => {
    await consumeRateLimit("user_1", RULE);
    await peekRateLimit("user_1", RULE);
    await peekRateLimit("user_1", RULE);
    expect((await peekRateLimit("user_1", RULE)).remaining).toBe(2);
  });

  it("reports a full budget for an unseen subject", async () => {
    const r = await peekRateLimit("nobody", RULE);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(3);
  });
});

describe("Extraction rule", () => {
  it("defaults to 12 per hour", () => {
    const r = EXTRACTION_RATE_LIMIT();
    expect(r.limit).toBe(12);
    expect(r.windowSeconds).toBe(3600);
  });

  it("is configurable by environment", () => {
    process.env.RATE_LIMIT_EXTRACT_PER_HOUR = "3";
    expect(EXTRACTION_RATE_LIMIT().limit).toBe(3);
  });

  it("ignores a nonsense override rather than disabling the limit", () => {
    process.env.RATE_LIMIT_EXTRACT_PER_HOUR = "not-a-number";
    expect(EXTRACTION_RATE_LIMIT().limit).toBe(12);
    process.env.RATE_LIMIT_EXTRACT_PER_HOUR = "0";
    expect(EXTRACTION_RATE_LIMIT().limit).toBe(12);
  });
});

describe("pruneRateLimits", () => {
  it("runs without error", async () => {
    await consumeRateLimit("user_1", RULE);
    await expect(pruneRateLimits()).resolves.toBeUndefined();
  });
});
