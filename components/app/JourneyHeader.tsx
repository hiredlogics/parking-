"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Journey header — full-width on web, same brand look as mobile mockups.
 * Logo left · nav / hamburger right (not cramped to the content column).
 */
export function JourneyHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-borderSoft bg-white">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:h-16 sm:px-6 lg:px-10">
        <Link
          href="/"
          className="text-[13px] font-black uppercase tracking-[0.08em] text-brand-text sm:text-[15px] lg:text-[16px]"
          aria-label="Parking Appeals Group — Home"
        >
          Parking{" "}
          <span className="text-brand-pink">Appeals</span>
          <span className="text-brand-pink">.</span> Group
        </Link>

        {/* Desktop links — proper web nav */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 text-[14px] font-semibold text-brand-text transition hover:bg-brand-pinkPale hover:text-brand-pink"
          >
            Home
          </Link>
          <Link
            href="/portal"
            className="rounded-lg px-3 py-2 text-[14px] font-semibold text-brand-text transition hover:bg-brand-pinkPale hover:text-brand-pink"
          >
            My portal
          </Link>
          <Link
            href="/signin"
            className="ml-1 rounded-xl bg-brand-pink px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-brand-pinkDark"
          >
            Sign in
          </Link>
        </nav>

        {/* Mobile / tablet hamburger */}
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-brand-text hover:bg-brand-canvas md:hidden"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
            {open ? (
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            ) : (
              <>
                <path d="M4 7h16" strokeLinecap="round" />
                <path d="M4 12h16" strokeLinecap="round" />
                <path d="M4 17h16" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-brand-borderSoft bg-white px-4 py-3 md:hidden">
          <nav className="mx-auto flex w-full max-w-7xl flex-col gap-1 text-[14px] font-semibold text-brand-text">
            <Link href="/" className="rounded-lg px-3 py-2.5 hover:bg-brand-pinkPale" onClick={() => setOpen(false)}>
              Home
            </Link>
            <Link href="/portal" className="rounded-lg px-3 py-2.5 hover:bg-brand-pinkPale" onClick={() => setOpen(false)}>
              My portal
            </Link>
            <Link href="/signin" className="rounded-lg px-3 py-2.5 hover:bg-brand-pinkPale" onClick={() => setOpen(false)}>
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
