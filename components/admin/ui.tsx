"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { statusColor, priorityColor } from "@/lib/crm/format";
import { humanStatus, humanPriority } from "@/lib/crm/store";
import type { KanbanStatus, Priority } from "@/lib/crm/types";

/** Full-width white page shell with an optional title + right actions. */
export function AdminPage({
  title,
  breadcrumb,
  actions,
  children,
}: {
  title?: string;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
      {(title || breadcrumb || actions) && (
        <div className="mb-4 flex flex-col gap-2 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {breadcrumb && (
              <div className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-brand-mute">
                {breadcrumb}
              </div>
            )}
            {title && (
              <h1 className="text-[22px] font-black tracking-tight text-brand-text sm:text-[26px]">
                {title}
              </h1>
            )}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export function AdminCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-white shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function AdminCardHeader({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-brand-borderSoft px-4 py-3 sm:px-5">
      <h2 className="text-[13px] font-bold uppercase tracking-widest text-brand-text">
        {title}
      </h2>
      {right && <div className="text-[12px] font-semibold text-brand-pink">{right}</div>}
    </div>
  );
}

/** KPI stat card used on the dashboard. */
export function KpiCard({
  label,
  value,
  icon,
  tone = "amber",
  href,
}: {
  label: string;
  value: number | string;
  icon: ReactNode;
  tone?: "amber" | "blue" | "violet" | "orange" | "emerald" | "pink";
  href?: string;
}) {
  const toneMap: Record<string, string> = {
    amber: "bg-amber-100 text-amber-700",
    blue: "bg-blue-100 text-blue-700",
    violet: "bg-violet-100 text-violet-700",
    orange: "bg-orange-100 text-orange-700",
    emerald: "bg-emerald-100 text-emerald-700",
    pink: "bg-brand-pinkLight text-brand-pink",
  };
  const inner = (
    <div className="flex items-center justify-between p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-mute">
          {label}
        </p>
        <p className="mt-1 text-2xl font-black leading-none text-brand-text">
          {value}
        </p>
      </div>
      <span className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${toneMap[tone]}`}>
        {icon}
      </span>
    </div>
  );
  const className =
    "block rounded-xl border border-brand-border bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-cardHover";
  return href ? <Link href={href} className={className}>{inner}</Link> : <div className={className}>{inner}</div>;
}

/** Small status pill for Kanban statuses. */
export function StatusPill({ status, size = "md" }: { status: KanbanStatus; size?: "sm" | "md" }) {
  const c = statusColor(status);
  const sizeCls = size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-2.5 py-1 text-[11px]";
  return (
    <span className={`inline-flex items-center rounded-full font-semibold ring-1 ${c.bg} ${c.text} ${c.ring} ${sizeCls}`}>
      {humanStatus(status)}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const c = priorityColor(priority);
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${c.bg} ${c.text}`}>
      {humanPriority(priority)}
    </span>
  );
}

/** Small primary + outline buttons used across the admin UI. */
export function AdminPrimary({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-md bg-brand-pink px-3.5 py-2 text-[12px] font-semibold uppercase tracking-wide text-white transition hover:bg-brand-pinkDark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink focus-visible:ring-offset-2 disabled:opacity-50 ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function AdminOutline({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 rounded-md border border-brand-border bg-white px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-brand-text transition hover:bg-brand-canvas focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-pink ${rest.className ?? ""}`}
    >
      {children}
    </button>
  );
}
