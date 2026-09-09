import { getSql } from "@/lib/db/pool";
import { ensureSchema } from "@/lib/db/schema";

/**
 * Fixed-window rate limiting.
 *
 * The counter lives in Postgres, so it survives a restart and is shared
 * between instances. The increment is a single atomic statement —
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` — so two concurrent
 * requests cannot both read the same count and both be allowed.
 *
 * Fixed windows can permit a short burst across a boundary. That is an
 * accepted trade for the simplicity; these limits exist to stop runaway
 * cost and abuse, not to shape traffic precisely.
 */

type Row = Record<string, unknown>;

async function q(text: string, params: unknown[] = []): Promise<Row[]> {
  await ensureSchema();
  const sql = getSql();
  const res = (await sql.query(text, params)) as unknown as
    | { rows?: Row[] }
    | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

export interface RateLimitRule {
  /** What is being limited, e.g. "extract". */
  action: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** ISO timestamp when the current window ends. */
  resetAt: string;
  retryAfterSeconds: number;
}

/** Start of the fixed window containing `now`. */
function windowStart(now: Date, windowSeconds: number): Date {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(now.getTime() / ms) * ms);
}

/**
 * Count one use against a subject's budget.
 *
 * `subject` should be a stable identity — a user id. Never an IP alone
 * for authenticated actions, since that punishes shared networks.
 */
export async function consumeRateLimit(
  subject: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = new Date();
  const start = windowStart(now, rule.windowSeconds);
  const resetAt = new Date(start.getTime() + rule.windowSeconds * 1000);
  const bucketKey = `${rule.action}:${subject}:${start.toISOString()}`;

  const rows = await q(
    `INSERT INTO rate_limits (bucket_key, count, window_start, expires_at)
     VALUES ($1, 1, $2, $3)
     ON CONFLICT (bucket_key)
       DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [bucketKey, start.toISOString(), resetAt.toISOString()],
  );

  const count = Number(rows[0]?.count ?? 1);
  const allowed = count <= rule.limit;

  return {
    allowed,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: resetAt.toISOString(),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** Read a subject's usage without consuming any of it. */
export async function peekRateLimit(
  subject: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const now = new Date();
  const start = windowStart(now, rule.windowSeconds);
  const resetAt = new Date(start.getTime() + rule.windowSeconds * 1000);
  const bucketKey = `${rule.action}:${subject}:${start.toISOString()}`;

  const rows = await q(
    `SELECT count FROM rate_limits WHERE bucket_key = $1 LIMIT 1`,
    [bucketKey],
  );
  const count = Number(rows[0]?.count ?? 0);
  return {
    allowed: count < rule.limit,
    limit: rule.limit,
    remaining: Math.max(0, rule.limit - count),
    resetAt: resetAt.toISOString(),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((resetAt.getTime() - now.getTime()) / 1000),
    ),
  };
}

/** Drop expired buckets. Safe to call opportunistically. */
export async function pruneRateLimits(): Promise<void> {
  await q(`DELETE FROM rate_limits WHERE expires_at < $1`, [
    new Date().toISOString(),
  ]);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * PCN extraction. Each call is a paid vision request, so this is the
 * budget control as much as an abuse control.
 */
export const EXTRACTION_RATE_LIMIT = (): RateLimitRule => ({
  action: "extract",
  limit: envInt("RATE_LIMIT_EXTRACT_PER_HOUR", 12),
  windowSeconds: 3600,
});
