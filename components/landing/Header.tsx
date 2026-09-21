"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { ChevronDownIcon, ArrowRightIcon } from "./Icons";

interface NavItem {
  label: string;
  href: string;
  hasDropdown?: boolean;
  match?: string;
}

const NAV: NavItem[] = [
  { label: "Home", href: "/", match: "/" },
  { label: "Services", href: "/services", match: "/services" },
  { label: "How It Works", href: "/how-it-works", match: "/how-it-works" },
  { label: "About Us", href: "/about", match: "/about" },
  { label: "Resources", href: "/#resources", hasDropdown: true },
  { label: "Contact Us", href: "/#contact" },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-brand-border/80 bg-white/95 text-brand-text backdrop-blur-md">
      <div className="container-page flex h-[72px] items-center justify-between gap-4">
        <BrandLogo />

        <nav
          className="hidden lg:flex lg:flex-1 lg:items-center lg:justify-center lg:gap-6 xl:gap-8"
          aria-label="Primary"
        >
          {NAV.map((item) => {
            const active =
              item.match === "/"
                ? pathname === "/"
                : Boolean(item.match && pathname.startsWith(item.match));
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`inline-flex items-center gap-1 border-b-2 pb-0.5 text-[13.5px] font-semibold transition ${
                  active
                    ? "border-brand-pink text-brand-text"
                    : "border-transparent text-brand-text/75 hover:text-brand-text"
                }`}
              >
                {item.label}
                {item.hasDropdown && (
                  <ChevronDownIcon className="h-3.5 w-3.5 text-brand-mute" />
                )}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/appeal/upload"
            className="btn-brand-primary hidden !rounded-md !px-4 !py-2.5 !text-[12.5px] sm:inline-flex"
            data-testid="header-cta"
          >
            Start an Appeal <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-brand-border lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            onClick={() => setMenuOpen((v) => !v)}
          >
            <div className="flex h-4 w-5 flex-col justify-between">
              <span
                className={`block h-0.5 w-full bg-brand-text transition ${menuOpen ? "translate-y-[7px] rotate-45" : ""}`}
              />
              <span
                className={`block h-0.5 w-full bg-brand-text transition ${menuOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block h-0.5 w-full bg-brand-text transition ${menuOpen ? "-translate-y-[7px] -rotate-45" : ""}`}
              />
            </div>
          </button>
        </div>
      </div>

      <div
        id="mobile-nav"
        className={`lg:hidden ${menuOpen ? "block" : "hidden"} border-t border-brand-border bg-white`}
      >
        <nav className="container-page flex flex-col py-3" aria-label="Mobile">
          {NAV.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="flex items-center justify-between rounded-md px-3 py-3 text-sm font-semibold text-brand-text hover:bg-brand-canvas"
            >
              {item.label}
              {item.hasDropdown && (
                <ChevronDownIcon className="h-4 w-4 text-brand-mute" />
              )}
            </Link>
          ))}
          <Link
            href="/appeal/upload"
            onClick={() => setMenuOpen(false)}
            className="btn-brand-primary mt-2 sm:hidden"
          >
            Start an Appeal <ArrowRightIcon className="h-4 w-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
