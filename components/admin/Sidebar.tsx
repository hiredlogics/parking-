"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: <Icon><path d="M3 12l9-9 9 9" /><path d="M5 10v10h4v-6h6v6h4V10" /></Icon> },
  { href: "/admin/cases", label: "Cases", icon: <Icon><rect x="4" y="6" width="16" height="14" rx="2" /><path d="M9 6V4h6v2" /><path d="M8 12h8M8 16h5" /></Icon> },
  { href: "/admin/appeals", label: "Appeal Cases", icon: <Icon><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M15 3v4h4" /><path d="M8 13h6M8 17h4" /></Icon> },
  { href: "/admin/clients", label: "Clients", icon: <Icon><circle cx="9" cy="8" r="3.5" /><path d="M3 20c.9-3.5 3-5.5 6-5.5s5.1 2 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M15 20c.5-2 1.7-3.5 4-3.5" /></Icon> },
  { href: "/admin/appeal-builder", label: "Appeal Builder™", icon: <Icon><path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M15 3v4h4" /><path d="M9 13l2 2 4-4" /></Icon> },
  { href: "/admin/appeal-logic", label: "Appeal Logic", icon: <Icon><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8 7.5L11 16M16 7.5L13 16M8.3 6h7.4" /></Icon> },
  { href: "/admin/community", label: "Community", icon: <Icon><path d="M4 20v-1a5 5 0 0 1 5-5" /><path d="M14 20v-1a5 5 0 0 1 5-5" /><circle cx="9" cy="8" r="3" /><circle cx="19" cy="9" r="2.5" /></Icon> },
  { href: "/admin/reports", label: "Reports", icon: <Icon><path d="M4 20V8" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20v-4" /><path d="M2 20h20" /></Icon> },
  { href: "/admin/finance", label: "Finance", icon: <Icon><path d="M2 8h20v10H2z" /><circle cx="12" cy="13" r="2.5" /><path d="M6 8v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" /></Icon> },
  { href: "/admin/settings", label: "Settings", icon: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></Icon> },
  { href: "/admin/help", label: "Help & Support", icon: <Icon><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-.7.5-1.5.9-1.5 1.7v.3" /><path d="M12 17v.01" /></Icon> },
];

interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

export function Sidebar({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.user) setUser(d.user as SessionUser);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const initials =
    user?.name
      .split(/\s+/)
      .map((s) => s[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "PA";

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <aside className="flex h-full min-h-dvh w-60 flex-col justify-between bg-brand-navy text-white">
      <div>
        {/* Logo */}
        <div className="px-4 pt-4 pb-3 border-b border-white/5">
          <Link href="/admin" onClick={onNavigate} className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-white text-brand-pink text-[15px] font-black">
              PA
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">Parking</span>
              <span className="text-[11px] font-extrabold uppercase tracking-[0.14em]">
                Appeals <span className="text-brand-pink">Group</span>
              </span>
            </span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="p-2" aria-label="Admin">
          <ul className="space-y-0.5">
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition ${
                      active
                        ? "bg-brand-pink text-white shadow-card"
                        : "text-white/75 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className={active ? "text-white" : "text-white/60"}>
                      {item.icon}
                    </span>
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Admin profile */}
      <div className="m-3 mb-4 rounded-lg border border-white/5 bg-white/[0.04] p-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-pink text-[11px] font-bold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">
              {user?.name ?? "Admin"}
            </p>
            <p className="truncate text-[11px] text-white/60">
              {user?.email ?? user?.role ?? "OWNER"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-white/85 hover:bg-white/5 disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Log out"}
        </button>
      </div>
    </aside>
  );
}
