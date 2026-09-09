import type { SessionOptions } from "iron-session";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import {
  KIND_COOKIE,
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  sessionPassword,
  type SessionData,
  type SessionRole,
} from "./sessionConfig";

export type { SessionData, SessionRole };

export const sessionOptions: SessionOptions = {
  password: sessionPassword(),
  cookieName: SESSION_COOKIE,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);
  return session;
}

export async function stampKindCookie(kind: SessionRole) {
  const store = await cookies();
  store.set(KIND_COOKIE, kind, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearKindCookie() {
  const store = await cookies();
  store.delete(KIND_COOKIE);
}
