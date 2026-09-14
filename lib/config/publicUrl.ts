/**
 * Centralised public URL and in-app path helpers.
 *
 * Product routes live under `/appeal/...` in the Next app router today.
 * Deployment at https://CLIENT-DOMAIN/appeal is achieved by Mojo (or
 * another reverse proxy) forwarding `/appeal/*` to this service while
 * preserving the path — see docs/operations/MOJO_REVERSE_PROXY.md.
 *
 * Do not scatter `https://…` or absolute origin strings in components.
 * Build absolute links (Stripe, email, PDF) with `publicUrl()`.
 */

/** Optional Next.js basePath (usually empty when Mojo preserves /appeal). */
export function basePath(): string {
  const raw = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  if (!raw || raw === "/") return "";
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/** Public origin for absolute links (no trailing slash). */
export function publicOrigin(): string {
  const raw =
    process.env.APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    "";
  return raw.replace(/\/$/, "");
}

/**
 * Join origin + optional basePath + path into an absolute URL.
 * `path` should start with `/` (e.g. `/appeal/review`).
 */
export function publicUrl(path: string): string {
  const origin = publicOrigin();
  const base = basePath();
  const normalised = path.startsWith("/") ? path : `/${path}`;
  // Avoid doubling when callers already include the basePath prefix.
  const withBase =
    base && normalised.startsWith(`${base}/`)
      ? normalised
      : `${base}${normalised}`;
  if (!origin) return withBase;
  return `${origin}${withBase}`;
}

/** In-app path constants — single place for the /appeal prefix. */
export const paths = {
  upload: "/appeal/upload",
  confirm: "/appeal/confirm",
  questions: "/appeal/questions",
  evidence: "/appeal/evidence",
  review: "/appeal/review",
  result: "/appeal/result",
  portal: "/portal",
  portalAppeals: "/portal/appeals",
  checkoutSuccess: (id: string) => `/checkout/${id}/success`,
  checkoutCancel: "/appeal/review",
  signin: "/signin",
  health: "/api/health",
} as const;
