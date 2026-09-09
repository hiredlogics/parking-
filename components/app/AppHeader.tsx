"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAppealStore } from "@/features/appeal/store";
import { ArrowRightIcon, ChatQuestionIcon } from "@/components/landing/Icons";

/**
 * Simplified application header used across every step of the appeal
 * workflow. Keeps the visual language of the landing header (dark navy,
 * pink accents) but strips the marketing nav down to just what a
 * customer-in-flow needs.
 */
export function AppHeader() {
  const router = useRouter();
  const reset = useAppealStore((s) => s.reset);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleExit = () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Exit this appeal? Your progress will be cleared.",
      );
      if (!ok) return;
    }
    reset();
    router.push("/");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-brand-navy text-white">
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[68px]">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 focus:outline-none"
          aria-label="Parking Appeals Group — Home"
        >
          <span className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white">
            <span className="text-[15px] font-black tracking-tight text-brand-pink">
              PA
            </span>
          </span>
          <span className="hidden leading-none xs:flex xs:flex-col">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
              Parking
            </span>
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white">
              Appeals <span className="text-brand-pink">Group</span>
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex md:items-center md:gap-6" aria-label="Primary">
          <Link href="/" className="text-[12.5px] font-semibold uppercase tracking-wide text-white/85 transition hover:text-white">
            Home
          </Link>
          <Link href="/#how-it-works" className="text-[12.5px] font-semibold uppercase tracking-wide text-white/85 transition hover:text-white">
            How It Works
          </Link>
          <Link href="/#contact" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-wide text-white/85 transition hover:text-white">
            <ChatQuestionIcon className="h-4 w-4 text-brand-pink" /> Help
          </Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleExit}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-white/15 px-4 py-2 text-[12.5px] font-semibold uppercase tracking-wide text-white/90 transition hover:bg-white/5"
            data-testid="exit-appeal"
          >
            Exit Appeal <ArrowRightIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 md:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="flex h-4 w-5 flex-col justify-between">
              <span className={`block h-0.5 w-full bg-white transition ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`block h-0.5 w-full bg-white transition ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 w-full bg-white transition ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </div>
          </button>
        </div>
      </div>

      <div className={`md:hidden ${menuOpen ? "block" : "hidden"} border-t border-white/10 bg-brand-navy`}>
        <nav className="container-page flex flex-col py-3" aria-label="Mobile">
          <Link href="/" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wide text-white/85 hover:bg-white/5">Home</Link>
          <Link href="/#how-it-works" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wide text-white/85 hover:bg-white/5">How It Works</Link>
          <Link href="/#contact" onClick={() => setMenuOpen(false)} className="rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wide text-white/85 hover:bg-white/5">Help</Link>
          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              handleExit();
            }}
            className="mt-1 rounded-md border border-white/15 px-3 py-3 text-left text-sm font-semibold uppercase tracking-wide text-white/90 hover:bg-white/5"
          >
            Exit Appeal
          </button>
        </nav>
      </div>
    </header>
  );
}
