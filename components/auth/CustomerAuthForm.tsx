"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/landing/BrandLogo";

/**
 * Shared UI for customer sign-in / register.
 *
 * If register finds an existing email, we send the user to sign-in
 * with that email prefilled instead of creating another account.
 */
export function CustomerAuthForm({ mode }: { mode: "register" | "signin" }) {
  const router = useRouter();
  const search = useSearchParams();
  const rawNext = search?.get("next") ?? "";
  const defaultNext = mode === "register" ? "/appeal/upload" : "/portal";
  const nextPath =
    rawNext.startsWith("/appeal") ||
    rawNext.startsWith("/portal") ||
    rawNext === "/start"
      ? rawNext
      : defaultNext;

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const prefill = search?.get("email");
    if (prefill) setEmail(prefill);
    const n = search?.get("notice");
    if (n === "exists") {
      setNotice("That email already has an account. Please sign in.");
    } else if (n === "reset") {
      setNotice("Password updated. You can sign in with your new password.");
    }
  }, [search]);

  const isRegister = mode === "register";
  const heading = isRegister ? "Create your account" : "Sign in to continue";
  const subhead = isRegister
    ? "Register with your email and a password so we can save your appeal, evidence and downloads."
    : "Sign in to see your saved appeals, evidence and messages.";
  const cta = isRegister ? "Create Account & Start Appeal" : "Sign In";
  const endpoint = isRegister
    ? "/api/auth/customer/register"
    : "/api/auth/customer/login";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const body = isRegister ? { name, email, password } : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.code === "EMAIL_EXISTS" || res.status === 409) {
          const q = new URLSearchParams({
            email: email.trim().toLowerCase(),
            notice: "exists",
            next: nextPath,
          });
          router.push(`/signin?${q.toString()}`);
          return;
        }
        setError(data.error ?? "Something went wrong.");
        return;
      }
      router.push(nextPath);
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
            <span className="app-badge">
              {isRegister ? "New here" : "Welcome back"}
            </span>
            <h1 className="mt-3 text-[22px] font-black tracking-tight">
              {heading}
            </h1>
            <p className="mt-1 text-[13px] text-brand-mute">{subhead}</p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              {isRegister && (
                <div>
                  <label className="app-label" htmlFor="name">
                    Full name
                  </label>
                  <input
                    id="name"
                    className="app-input"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
              )}
              <div>
                <label className="app-label" htmlFor="email">
                  Email
                </label>
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
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="app-label mb-0" htmlFor="password">
                    Password
                  </label>
                  {!isRegister && (
                    <Link
                      href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`}
                      className="text-[12px] font-semibold text-brand-pink hover:underline"
                    >
                      Forgot password?
                    </Link>
                  )}
                </div>
                <input
                  id="password"
                  type="password"
                  className="app-input"
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={isRegister ? 8 : undefined}
                  required
                />
                {isRegister && (
                  <p className="app-hint">Minimum 8 characters.</p>
                )}
              </div>

              {notice && (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900"
                >
                  {notice}
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
                >
                  {error}
                  {error.toLowerCase().includes("sign in") && (
                    <>
                      {" "}
                      <Link
                        href={`/signin?email=${encodeURIComponent(email)}&next=${encodeURIComponent(nextPath)}`}
                        className="font-semibold text-brand-pink underline"
                      >
                        Go to sign in
                      </Link>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="btn-brand-primary w-full justify-center"
              >
                {busy ? "Please wait…" : cta}
              </button>
            </form>

            <p className="mt-5 text-center text-[12.5px] text-brand-mute">
              {isRegister ? (
                <>
                  Already have an account?{" "}
                  <Link
                    href={`/signin?next=${encodeURIComponent(nextPath)}`}
                    className="font-semibold text-brand-pink"
                  >
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  New here?{" "}
                  <Link
                    href={`/signup?next=${encodeURIComponent(nextPath)}`}
                    className="font-semibold text-brand-pink"
                  >
                    Create an account
                  </Link>
                </>
              )}
            </p>
          </div>

          <p className="mt-5 text-center text-[12px] text-white/60">
            <Link href="/" className="hover:text-white">
              ← Back to the site
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
