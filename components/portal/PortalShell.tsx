"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/portal", label: "Home" },
  { href: "/portal/cases", label: "My Cases" },
  { href: "/portal/documents", label: "Documents" },
  { href: "/portal/invoices", label: "Payments" },
  { href: "/portal/settings", label: "Account" },
];

interface PortalUser {
  id: string;
  name: string;
  email: string;
  kind?: string;
}

/**
 * Customer portal shell. Reads the signed-in user from /api/auth/me
 * and shows a real logout that clears the iron-session cookie.
 */
export function PortalShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [user, setUser] = useState<PortalUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) setUser(d.user as PortalUser);
      })
      .catch(() => undefined);
  }, []);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/signin");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="flex min-h-dvh bg-brand-canvas text-brand-text">
      <aside className="hidden shrink-0 lg:block lg:w-64">
        <div className="sticky top-0 flex h-dvh flex-col justify-between border-r border-brand-borderSoft bg-white">
          <div>
            <div className="border-b border-brand-borderSoft px-4 py-4">
              <Link href="/" className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-brand-navy text-[13px] font-black text-brand-pink">PA</span>
                <div className="leading-tight">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-mute">Welcome back,</p>
                  <p className="text-[13px] font-bold text-brand-text">{user?.name?.split(" ")[0] ?? "Guest"}</p>
                </div>
              </Link>
            </div>
            <nav className="p-2" aria-label="Portal">
              <ul className="space-y-0.5">
                {NAV.map((item) => {
                  const active =
                    pathname === item.href ||
                    (item.href !== "/portal" && pathname.startsWith(item.href));
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={`flex items-center rounded-md px-3 py-2 text-[13px] font-medium ${
                          active
                            ? "bg-brand-pinkLight text-brand-pink"
                            : "text-brand-text/85 hover:bg-brand-canvas"
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
          <div className="border-t border-brand-borderSoft p-3">
            {user && (
              <div className="mb-3 rounded-md border border-brand-borderSoft bg-brand-canvas p-2 text-[11.5px]">
                <p className="truncate font-semibold text-brand-text">{user.name}</p>
                <p className="truncate text-brand-mute">{user.email}</p>
              </div>
            )}
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="block w-full rounded-md border border-brand-border bg-white px-3 py-2 text-center text-[11.5px] font-semibold uppercase tracking-wide text-brand-text hover:bg-brand-canvas disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Log out"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-1 flex-col">
        <div className="flex items-center justify-between border-b border-brand-borderSoft bg-white px-4 py-2 lg:hidden">
          <Link href="/portal" className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-navy text-[11px] font-black text-brand-pink">PA</span>
            <span className="text-[12.5px] font-bold uppercase tracking-wide">Customer Portal</span>
          </Link>
          <button
            type="button"
            onClick={signOut}
            disabled={signingOut}
            className="text-[11.5px] font-semibold uppercase tracking-wide text-brand-mute disabled:opacity-60"
          >
            {signingOut ? "…" : "Log out"}
          </button>
        </div>
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
