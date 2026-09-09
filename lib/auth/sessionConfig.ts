/**
 * Session configuration shared by the server and the edge middleware.
 *
 * This module deliberately imports nothing from `next/headers` — the
 * middleware runs on the edge runtime, where that is unavailable, so it
 * cannot import `lib/auth/session.ts` directly.
 */

export type SessionRole = "ADMIN" | "CUSTOMER";

export interface SessionData {
  userId?: string;
  email?: string;
  name?: string;
  /** Business role: OWNER / ADMIN / MEMBER for admins, "CUSTOMER" for customers. */
  role?: string;
  /** High-level access role — what the middleware uses to gate routes. */
  kind?: SessionRole;
}

const DEFAULT_PASSWORD =
  "pag-dev-only-fallback-session-password-change-me-please-32chars!";

export const SESSION_COOKIE = "pag_admin_session";
export const KIND_COOKIE = "pag_kind";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export function sessionPassword(): string {
  return process.env.SESSION_PASSWORD || DEFAULT_PASSWORD;
}
