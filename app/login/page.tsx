"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/landing/BrandLogo";

export const dynamic = "force-dynamic";

/**
 * Admin sign-in only. There is no self-registration for admins — the
 * credentials are hardcoded on the server (see `lib/auth/service.ts`).
 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-dvh bg-brand-navy text-white">
          <div className="container-page flex min-h-dvh items-center justify-center py-10">
            <div className="app-badge">Loading…</div>
          </div>
        </div>
      }
    >
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const nextPath = search?.get("next") ?? "/admin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dbReady, setDbReady] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setDbReady(!!d.hasDb))
      .catch(() => setDbReady(false));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(nextPath.startsWith("/admin") ? nextPath : "/admin");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-brand-navy text-white">
      <div className="container-page flex min-h-dvh items-center justify-center py-10">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center">
            <BrandLogo href="/" invert size="md" />
          </div>

          <div className="rounded-2xl border border-white/5 bg-white p-6 text-brand-text shadow-glow sm:p-7">
            <span className="app-badge">Admin sign in</span>
            <h1 className="mt-3 text-[22px] font-black tracking-tight">Sign in to the CRM</h1>
            <p className="mt-1 text-[13px] text-brand-mute">
              Use the fixed Parking Appeals Group admin credentials.
            </p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="app-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="app-input"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="app-label" htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  className="app-input"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-brand-primary w-full justify-center"
              >
                {busy ? "Signing in…" : "Sign In"}
              </button>
            </form>

            {dbReady === false && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Database not configured yet.
              </div>
            )}
            {dbReady === true && (
              <div className="mt-4 rounded-lg border border-brand-borderSoft bg-brand-canvas px-3 py-2 text-[12px] text-brand-mute">
                <p className="font-semibold text-brand-text">Fixed admin credentials</p>
                <p className="mt-0.5">
                  <span className="font-mono">admin@parkingappealsgroup.co.uk</span> /{" "}
                  <span className="font-mono">changeme</span>
                </p>
              </div>
            )}
          </div>

          <p className="mt-5 text-center text-[12px] text-white/60">
            <Link href="/" className="hover:text-white">← Back to the site</Link>
            {" · "}
            <Link href="/signup" className="hover:text-white">Are you a customer? Register here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
