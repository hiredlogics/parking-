"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sidebar } from "./Sidebar";
import { useCrm } from "@/lib/crm/store";

const POLL_INTERVAL_MS = 5_000;

/**
 * Admin shell — fixed sidebar on desktop, hamburger drawer on tablet/mobile.
 *
 * On mount we call `refreshFromServer()` which fetches the authoritative
 * CRM state from `/api/crm/state` and replaces the local Zustand store.
 * We then poll every 5 seconds so new customer registrations and
 * appeals appear in the admin dashboard without needing to reload.
 * Polling is paused while the tab is hidden to save the DB.
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState(false);
  const refreshFromServer = useCrm((s) => s.refreshFromServer);
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      try {
        await refreshFromServer();
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const interval = window.setInterval(() => {
      if (!cancelled) void tick();
    }, POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshFromServer]);

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
