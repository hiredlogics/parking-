/**
 * Bounded transient-failure retry for provider calls.
 *
 * WHY THIS EXISTS
 * ---------------
 * A UAT batch reported a case as MANUAL_REVIEW with zero modules, zero
 * attempts and zero cost. That looked exactly like a knowledge-retrieval
 * failure and was diagnosed as one. It was not: the OpenAI call had
 * thrown a network timeout, `draftAppeal` caught it and returned
 * `DRAFTING_FAILED`, and the report could not tell a dead socket apart
 * from a legal-content problem.
 *
 * Two things follow, and both are implemented here:
 *
 *   1. Transient transport failures are retried, briefly and bounded.
 *   2. A transport failure is labelled as such, so it can never again
 *      be mistaken for a content or knowledge decision.
 *
 * A transport retry is NOT a validation regeneration. It re-sends the
 * same request after an infrastructure failure; it does not respond to
 * validator feedback, and it must not consume a legal-content attempt.
 */

import { hardenOutboundConnections } from "@/lib/net/bootstrap";

export class TransportError extends Error {
  readonly attempts: number;
  readonly lastStatus: number | null;
  constructor(message: string, attempts: number, lastStatus: number | null) {
    super(message);
    this.name = "TransportError";
    this.attempts = attempts;
    this.lastStatus = lastStatus;
  }
}

/** Network-level codes worth another go. */
const RETRYABLE_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNREFUSED",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

function statusOf(err: unknown): number | null {
  const s = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  return typeof s === "number" ? s : null;
}

function codeOf(err: unknown): string | null {
  const direct = (err as { code?: string })?.code;
  if (typeof direct === "string") return direct;
  const cause = (err as { cause?: { code?: string } })?.cause;
  if (typeof cause?.code === "string") return cause.code;
  // undici AggregateError nests the real failures.
  const errors = (err as { cause?: { errors?: Array<{ code?: string }> } })?.cause?.errors;
  if (Array.isArray(errors)) {
    for (const e of errors) if (typeof e?.code === "string") return e.code;
  }
  return null;
}

/**
 * Is this worth retrying?
 *
 * Retry: timeouts, connection resets, 429, and 5xx.
 * Never: 400, 401, 403, 404, 422 — a malformed or unauthorised request
 * will fail identically however many times it is sent, and retrying a
 * 401 just burns time while the real problem goes unreported.
 */
export function isTransient(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== null) {
    if (status === 429) return true;
    if (status >= 500 && status <= 599) return true;
    return false;
  }
  const code = codeOf(err);
  if (code && RETRYABLE_CODES.has(code)) return true;

  /*
   * The OpenAI SDK wraps transport failures in its own error classes and
   * flattens the message to a bare "Connection error." — no status, no
   * code. That string is what actually reached the drafting engine and
   * got reported as a zero-module MANUAL_REVIEW, so it must be matched
   * explicitly or the retry never fires.
   */
  const name = (err as { name?: string })?.name ?? "";
  if (name === "APIConnectionError" || name === "APIConnectionTimeoutError") return true;

  // Node surfaces a bare "fetch failed" for several connect errors.
  const message = err instanceof Error ? err.message : String(err);
  return /fetch failed|connection error|network|socket hang up|timed? ?out/i.test(message);
}

export interface RetryOptions {
  /** Total attempts including the first. Kept small on purpose. */
  attempts?: number;
  /** Base backoff in ms; doubles each attempt with jitter. */
  baseDelayMs?: number;
  /** Hard ceiling per attempt. */
  timeoutMs?: number;
  /** Label for structured logs, e.g. "DRAFTING". */
  operation: string;
}

const DEFAULTS = { attempts: 3, baseDelayMs: 400, timeoutMs: 90_000 };

function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Run a provider call with bounded transient retries.
 *
 * Throws `TransportError` once the budget is exhausted, so callers can
 * distinguish "the network failed" from "the content was rejected".
 * A non-transient error is rethrown immediately, unwrapped.
 */
export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const attempts = options.attempts ?? envInt("AI_TRANSPORT_ATTEMPTS", DEFAULTS.attempts);
  const base = options.baseDelayMs ?? envInt("AI_TRANSPORT_BASE_DELAY_MS", DEFAULTS.baseDelayMs);
  const timeout = options.timeoutMs ?? envInt("AI_TRANSPORT_TIMEOUT_MS", DEFAULTS.timeoutMs);

  hardenOutboundConnections();

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await withTimeout(fn(), timeout, options.operation);
    } catch (err) {
      lastError = err;
      if (!isTransient(err)) throw err;
      if (attempt === attempts) break;

      // Exponential backoff with jitter, so concurrent cases do not
      // retry in lockstep against a struggling endpoint.
      const delay = Math.round(base * 2 ** (attempt - 1) * (0.5 + Math.random()));
      console.warn(
        `[ai/transport] ${options.operation} attempt ${attempt}/${attempts} failed transiently (${describe(err)}); retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  throw new TransportError(
    `${options.operation} failed after ${attempts} attempt(s): ${describe(lastError)}`,
    attempts,
    statusOf(lastError),
  );
}

function describe(err: unknown): string {
  const status = statusOf(err);
  const code = codeOf(err);
  const message = err instanceof Error ? err.message : String(err);
  return [status ? `HTTP ${status}` : null, code, message]
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  operation: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error(`${operation} timed out after ${ms}ms`);
          (err as { code?: string }).code = "ETIMEDOUT";
          reject(err);
        }, ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
