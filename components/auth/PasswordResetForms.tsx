"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

export function ForgotPasswordForm() {
  const search = useSearchParams();
  const [email, setEmail] = useState(search?.get("email") ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not send reset email.");
        return;
      }
      setDone(
        data.message ??
          "If an account exists for that email, we have sent reset instructions.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <span className="app-badge">Account</span>
      <h1 className="mt-3 text-[22px] font-black tracking-tight">
        Forgot password
      </h1>
      <p className="mt-1 text-[13px] text-brand-mute">
        Enter your email and we will send a link to set a new password.
      </p>

      {done ? (
        <div className="mt-5 space-y-4">
          <div
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900"
          >
            {done}
          </div>
          <p className="text-[12.5px] text-brand-mute">
            Check your inbox (and spam). If SMTP is not configured locally, the
            reset link is printed in the server terminal.
          </p>
          <Link href="/signin" className="btn-brand-primary w-full justify-center">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-5 space-y-4">
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
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="btn-brand-primary w-full justify-center"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <p className="text-center text-[12.5px] text-brand-mute">
            <Link href="/signin" className="font-semibold text-brand-pink">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const search = useSearchParams();
  const token = search?.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/customer/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not reset password.");
        return;
      }
      window.location.href = "/signin?notice=reset";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
        <h1 className="mt-3 text-[22px] font-black tracking-tight">
          Reset link missing
        </h1>
        <p className="mt-2 text-[13px] text-brand-mute">
          Open the link from your email, or request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="btn-brand-primary mt-5 w-full justify-center"
        >
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <span className="app-badge">Account</span>
      <h1 className="mt-3 text-[22px] font-black tracking-tight">
        Choose a new password
      </h1>
      <p className="mt-1 text-[13px] text-brand-mute">
        Enter a new password for your account (minimum 8 characters).
      </p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label className="app-label" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            className="app-input"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <div>
          <label className="app-label" htmlFor="confirm">
            Confirm password
          </label>
          <input
            id="confirm"
            type="password"
            className="app-input"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800"
          >
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="btn-brand-primary w-full justify-center"
        >
          {busy ? "Saving…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-brand-navy text-white">
      <div className="container-page flex min-h-dvh items-center justify-center py-10">
        <div className="w-full max-w-md">
          <Link href="/" className="mb-6 flex items-center justify-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-md bg-white text-[15px] font-black text-brand-pink">
              PA
            </span>
            <div className="leading-tight">
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
                Parking
              </p>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
                Appeals <span className="text-brand-pink">Group</span>
              </p>
            </div>
          </Link>
          <div className="rounded-2xl border border-white/5 bg-white p-6 text-brand-text shadow-glow sm:p-7">
            {children}
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
