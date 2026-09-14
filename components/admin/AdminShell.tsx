"use client";

import { useState } from "react";
import Link from "next/link";
import { Sidebar } from "./Sidebar";

/**
 * Admin shell — fixed sidebar on desktop, hamburger drawer on tablet/mobile.
 *
 * Each admin page fetches its own real data from its own `/api/admin/*`
 * route, so there is no shared global state to hydrate or poll here.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-dvh bg-brand-canvas text-brand-text">
      {/* Desktop sidebar */}
      <div className="hidden lg:block lg:shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {drawer && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
        >
          <button
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-black/50"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0 w-60 shadow-2xl">
            <Sidebar onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}

      {/* Main area */}
      <div className="flex min-h-dvh flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between border-b border-brand-borderSoft bg-white px-4 py-2 lg:hidden">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-brand-border"
            onClick={() => setDrawer(true)}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link href="/admin" className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-navy text-[11px] font-black text-brand-pink">PA</span>
            <span className="text-[12.5px] font-bold uppercase tracking-wide">Parking Appeals Group</span>
          </Link>
          <Link href="/" className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-mute">
            Site
          </Link>
        </div>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
