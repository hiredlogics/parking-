import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unsealData } from "iron-session";
import {
  KIND_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionPassword,
  type SessionData,
} from "@/lib/auth/sessionConfig";

/**
 * Route guard.
 *
 *   /admin/*                                  → admin session  (→ /login)
 *   /appeal/*, /start, /portal/*, /checkout/* → customer session (→ /signup)
 *
 * The cookie is DECRYPTED here, not merely detected.
 *
 * Checking only for the cookie's presence used to strand people: a
 * stale or undecryptable cookie — after SESSION_PASSWORD changes, or
 * once the seal expires — passed the guard, so customer pages rendered
 * normally while every API call behind them returned 401. There was no
 * route back to sign-in from that state.
 *
 * `unsealData` uses Web Crypto and runs on the edge runtime. It never
 * throws for a bad cookie here; a failure is treated as "no session".
 */

interface Guarded {
  hasSession: boolean;
  kind: SessionData["kind"];
}

async function readSession(req: NextRequest): Promise<Guarded> {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (!raw) return { hasSession: false, kind: undefined };

  try {
    const data = await unsealData<SessionData>(raw, {
      password: sessionPassword(),
      // Must match how the session was sealed, or long-lived cookies
      // would be rejected here but accepted by the API layer.
      ttl: SESSION_MAX_AGE,
    });
    if (!data?.userId) return { hasSession: false, kind: undefined };
    // Prefer the sealed value; the readable pag_kind cookie is only a
    // hint and can be edited by the client.
    return {
      hasSession: true,
      kind: data.kind ?? (req.cookies.get(KIND_COOKIE)?.value as SessionData["kind"]),
    };
  } catch {
    return { hasSession: false, kind: undefined };
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAdmin = pathname.startsWith("/admin");
  const isCustomer =
    pathname.startsWith("/portal") ||
    pathname.startsWith("/appeal") ||
    pathname.startsWith("/checkout") ||
    pathname === "/start" ||
    pathname.startsWith("/start/");

  if (!isAdmin && !isCustomer) return NextResponse.next();

  const { hasSession, kind } = await readSession(req);

  // A cookie we could not decrypt is dead weight — clear it so the
  // browser stops sending it and the next visit starts clean. A VALID
  // session must never be cleared, even when it is the wrong kind for
  // this route.
  const stale = !hasSession && Boolean(req.cookies.get(SESSION_COOKIE));

  if (isAdmin) {
    if (hasSession && kind !== "CUSTOMER") return NextResponse.next();
    return redirectTo(req, "/login", pathname, stale);
  }

  // Customer flow: an admin CRM session must not skip customer signup.
  if (hasSession && kind !== "ADMIN") return NextResponse.next();

  // A first-time visitor almost certainly needs to register; someone
  // already signed in as an admin just needs the customer sign-in page.
  return redirectTo(req, hasSession ? "/signin" : "/signup", pathname, stale);
}

function redirectTo(
  req: NextRequest,
  pathname: string,
  next: string,
  clearStaleCookies: boolean,
) {
  const url = req.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  url.searchParams.set("next", next + (req.nextUrl.search ?? ""));

  const res = NextResponse.redirect(url);
  if (clearStaleCookies) {
    res.cookies.delete({ name: SESSION_COOKIE, path: "/" });
    res.cookies.delete({ name: KIND_COOKIE, path: "/" });
  }
  return res;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/appeal/:path*",
    "/start",
    "/start/:path*",
    "/portal/:path*",
    "/checkout/:path*",
  ],
};
