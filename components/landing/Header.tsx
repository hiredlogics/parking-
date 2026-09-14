"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDownIcon, ArrowRightIcon } from "./Icons";

interface NavItem {
  label: string;
  href: string;
  hasDropdown?: boolean;
}

const NAV: NavItem[] = [
  { label: "HOW IT WORKS", href: "/#how-it-works" },
  { label: "SERVICES", href: "/#services" },
  { label: "ABOUT US", href: "/#about" },
  { label: "RESOURCES", href: "/#resources", hasDropdown: true },
  { label: "CONTACT US", href: "/#contact" },
];

/**
 * Landing-page site header. Dark navy bar with the PAG logo on the left,
 * primary navigation in the middle, and a hot-pink START MY APPEAL CTA on
 * the right. Collapses to a hamburger on tablet / mobile.
 */
export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-brand-navy text-white">
      <div className="container-page flex h-16 items-center justify-between gap-4 sm:h-[68px]">
        {/* Logo */}
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
              Appeals{" "}
              <span className="text-brand-pink">Group</span>
            </span>
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-center lg:gap-6"
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold uppercase tracking-wide text-white/85 transition hover:text-white"
            >
              {item.label}
              {item.hasDropdown && (
                <ChevronDownIcon className="h-3.5 w-3.5 text-brand-pink" />
              )}
            </Link>
          ))}
        </nav>

        {/* CTA + mobile menu button */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/appeal/upload"
            className="btn-brand-nav hidden sm:inline-flex"
            data-testid="header-cta"
          >
            Start My Appeal <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="flex h-4 w-5 flex-col justify-between">
              <span
                className={`block h-0.5 w-full bg-white transition ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`}
              />
              <span
                className={`block h-0.5 w-full bg-white transition ${menuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 w-full bg-white transition ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`}
              />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile / tablet dropdown */}
      <div
        id="mobile-nav"
        className={`lg:hidden ${menuOpen ? "block" : "hidden"} border-t border-white/10 bg-brand-navy`}
      >
        <nav className="container-page flex flex-col py-3" aria-label="Mobile">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between rounded-md px-3 py-3 text-sm font-semibold uppercase tracking-wide text-white/85 hover:bg-white/5"
            >
              {item.label}
              {item.hasDropdown && (
                <ChevronDownIcon className="h-4 w-4 text-brand-pink" />
              )}
            </Link>
          ))}
          <Link
            href="/appeal/upload"
            onClick={() => setMenuOpen(false)}
            className="btn-brand-primary mt-2 sm:hidden"
          >
            Start My Appeal <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
