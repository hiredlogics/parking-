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

export const SESSION_COOKIE = "pag_admin_session";
export const KIND_COOKIE = "pag_kind";

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * The seal password for the session cookie.
 *
 * The development fallback lives in `lib/config/production.ts` and is
 * refused there in production. It must be, because this literal is
 * committed: anyone who can read the repository could otherwise forge a
 * session for any customer or administrator.
 *
 * Imported lazily so the edge middleware — which also calls this — does
 * not pull the whole config module into its bundle.
 */
export function sessionPassword(): string {
  const configured = process.env.SESSION_PASSWORD?.trim();
  if (configured && configured.length > 0) return configured;

  if (
    process.env.APP_ENV === "production" ||
    process.env.APP_ENV === "staging" ||
    (!process.env.APP_ENV && process.env.NODE_ENV === "production")
  ) {
    throw new Error(
      "SESSION_PASSWORD is not set. Refusing to seal production sessions with the development placeholder — anyone with the repository could forge a session. Generate one with: openssl rand -base64 48",
    );
  }

  return "pag-dev-only-fallback-session-password-change-me-please-32chars!";
}
