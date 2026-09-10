/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import {
  TransportError,
  isTransient,
  withTransientRetry,
} from "@/services/ai/transport";
import {
  formatDuration,
  formatUkDate,
  formatUkTime,
} from "@/lib/format/ukDate";

describe("Transient failure classification", () => {
  it("retries timeouts and connection resets", () => {
    for (const code of ["ETIMEDOUT", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT", "EAI_AGAIN"]) {
      const err = Object.assign(new Error("boom"), { code });
      expect(isTransient(err), code).toBe(true);
    }
  });

  it("retries a bare Node 'fetch failed'", () => {
    // The exact failure that produced a bogus zero-module MANUAL_REVIEW.
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
  });

  it("retries the OpenAI SDK's bare 'Connection error.'", () => {
    /*
     * The precise failure that produced the reported defect: the SDK
     * gives no status and no code, just this message.
     */
    const err = Object.assign(new Error("Connection error."), {
      name: "APIConnectionError",
    });
    expect(isTransient(err)).toBe(true);
  });

  it("retries an APIConnectionTimeoutError", () => {
    const err = Object.assign(new Error("Request timed out."), {
      name: "APIConnectionTimeoutError",
    });
    expect(isTransient(err)).toBe(true);
  });

  it("reads the code from a nested cause", () => {
    const err = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    });
    expect(isTransient(err)).toBe(true);
  });

  it("retries 429 and 5xx", () => {
    for (const status of [429, 500, 502, 503, 504]) {
      expect(isTransient(Object.assign(new Error("x"), { status })), String(status)).toBe(true);
    }
  });

  it("never retries client errors", () => {
    // Retrying a 401 burns time and hides the real problem.
    for (const status of [400, 401, 403, 404, 422]) {
      expect(isTransient(Object.assign(new Error("x"), { status })), String(status)).toBe(false);
    }
  });
});

describe("Bounded retry behaviour", () => {
  it("returns the first successful result without retrying", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withTransientRetry(fn, { operation: "T" })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("recovers when a transient failure is followed by success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("reset"), { code: "ECONNRESET" }))
      .mockResolvedValue("ok");
    await expect(
      withTransientRetry(fn, { operation: "T", baseDelayMs: 1 }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stops at the attempt budget and raises TransportError", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("reset"), { code: "ECONNRESET" }));
    await expect(
      withTransientRetry(fn, { operation: "T", attempts: 3, baseDelayMs: 1 }),
    ).rejects.toBeInstanceOf(TransportError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("never retries indefinitely", async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error("x"), { status: 503 }));
    await expect(
      withTransientRetry(fn, { operation: "T", attempts: 2, baseDelayMs: 1 }),
    ).rejects.toBeInstanceOf(TransportError);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("rethrows a non-transient error immediately and unwrapped", async () => {
    const bad = Object.assign(new Error("invalid request"), { status: 400 });
    const fn = vi.fn().mockRejectedValue(bad);
    await expect(withTransientRetry(fn, { operation: "T" })).rejects.toBe(bad);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("times out a hanging call rather than blocking forever", async () => {
    const fn = vi.fn().mockImplementation(() => new Promise(() => {}));
    await expect(
      withTransientRetry(fn, { operation: "T", attempts: 1, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(TransportError);
  });
});

describe("UK customer date formatting", () => {
  it("formats the reported ISO date", () => {
    expect(formatUkDate("2026-07-12")).toBe("12 July 2026");
  });

  it("formats representative dates across the year", () => {
    expect(formatUkDate("2026-01-01")).toBe("1 January 2026");
    expect(formatUkDate("2026-02-28")).toBe("28 February 2026");
    expect(formatUkDate("2025-12-31")).toBe("31 December 2025");
    expect(formatUkDate("2026-05-01")).toBe("1 May 2026");
    expect(formatUkDate("2026-11-09")).toBe("9 November 2026");
  });

  it("does not pad the day", () => {
    expect(formatUkDate("2026-07-05")).toBe("5 July 2026");
  });

  it("accepts a full timestamp", () => {
    expect(formatUkDate("2026-07-23T00:00:00.000Z")).toBe("23 July 2026");
  });

  it("returns null for absent values", () => {
    expect(formatUkDate(null)).toBeNull();
    expect(formatUkDate(undefined)).toBeNull();
  });

  it("passes through anything it does not recognise", () => {
    // Never silently reshape a value we did not parse.
    expect(formatUkDate("last Tuesday")).toBe("last Tuesday");
    expect(formatUkDate("12/07/2026")).toBe("12/07/2026");
  });

  it("rejects impossible calendar dates", () => {
    expect(formatUkDate("2026-02-30")).toBe("2026-02-30");
    expect(formatUkDate("2026-13-01")).toBe("2026-13-01");
  });

  it("formats times in 12-hour prose", () => {
    expect(formatUkTime("14:07")).toBe("2:07pm");
    expect(formatUkTime("09:14")).toBe("9:14am");
    expect(formatUkTime("00:30")).toBe("12:30am");
    expect(formatUkTime("12:00")).toBe("12:00pm");
  });

  it("formats durations in prose", () => {
    expect(formatDuration(7)).toBe("7 minutes");
    expect(formatDuration(1)).toBe("1 minute");
    expect(formatDuration(60)).toBe("1 hour");
    expect(formatDuration(167)).toBe("2 hours 47 minutes");
    expect(formatDuration(488)).toBe("8 hours 8 minutes");
  });
});

describe("Formatting does not touch canonical values", () => {
  it("leaves the ISO input string untouched", () => {
    const iso = "2026-07-12";
    formatUkDate(iso);
    expect(iso).toBe("2026-07-12");
  });

  it("is pure — repeated calls agree", () => {
    expect(formatUkDate("2026-07-12")).toBe(formatUkDate("2026-07-12"));
  });
});
